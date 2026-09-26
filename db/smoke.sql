-- Service-role integration fixtures. No real user account is changed; always rolled back.
begin;
set local role service_role;
do $$
declare aid uuid; s jsonb; t jsonb; r jsonb; denied boolean; token uuid;
 stamp bigint:=floor(extract(epoch from statement_timestamp())*1000); tag text:=replace(gen_random_uuid()::text,'-','');
begin
 if has_table_privilege('anon','public.practice_wallets','select') or has_table_privilege('authenticated','public.practice_asset_trades','select') or has_function_privilege('anon','public.practice_commit_asset_trade(uuid,bigint,jsonb,jsonb,text)','execute') then raise exception 'Public access';end if;
 if public.practice_valid_asset_state('{}') or public.practice_valid_asset_state(null) then raise exception 'Malformed state';end if;
 insert into public.practice_accounts(lookup,salt,password_hash,username,market,state) values(repeat(tag,2),repeat('a',32),repeat('b',128),'qa_'||left(tag,12),'multi','{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}') returning id into aid;
 if (select state->>'cashMinor' from public.practice_wallets where account_id=aid)<>'10000000' then raise exception 'Wallet trigger';end if;
 s:='{"cashMinor":9000000,"realizedMinor":0,"positions":[{"symbol":"BTC","name":"Bitcoin","type":"crypto","unit":"BTC","quantity":1000,"costMinor":1000000}],"version":1}';
 t:=jsonb_build_object('requestId',gen_random_uuid(),'symbol','BTC','name','Bitcoin','type','crypto','unit','BTC','side','buy','quantity',1000,'quantityScale',1000000,'priceMinor',1000000000,'totalMinor',1000000,'cashAfterMinor',9000000,'realizedMinor',0,'source','coingecko','quoteAt',stamp,'quoteDate',null,'executedAt',stamp);
 r:=public.practice_commit_asset_trade(aid,0,s,t,repeat('c',64));if r->'state'<>s then raise exception 'BTC buy';end if;
 r:=public.practice_commit_asset_trade(aid,0,s,t,repeat('c',64));if r->>'duplicate'<>'true' then raise exception 'Duplicate';end if;
 r:=public.practice_commit_asset_trade(aid,0,s,t,repeat('d',64));if r->>'idempotencyConflict'<>'true' then raise exception 'Fingerprint';end if;
 t:=t||jsonb_build_object('requestId',gen_random_uuid());
 r:=public.practice_commit_asset_trade(aid,0,s,t,repeat('c',64));if r->>'conflict'<>'true' then raise exception 'CAS';end if;
 denied:=false;begin perform public.practice_commit_asset_trade(aid,1,s,t||'{"quantity":9}',repeat('c',64));exception when check_violation then denied:=true;end;if not denied then raise exception 'Step accepted';end if;
 denied:=false;begin perform public.practice_commit_asset_trade(aid,1,s,t||'{"source":"frankfurter"}',repeat('c',64));exception when check_violation then denied:=true;end;if not denied then raise exception 'Wrong source';end if;
 denied:=false;begin perform public.practice_commit_asset_trade(aid,1,s,t||jsonb_build_object('quoteAt',stamp-1800000),repeat('c',64));exception when check_violation then denied:=true;end;if not denied then raise exception 'Stale timestamp';end if;
 s:='{"cashMinor":10100000,"realizedMinor":100000,"positions":[],"version":2}';
 t:=t||jsonb_build_object('side','sell','priceMinor',1100000000,'totalMinor',1100000,'cashAfterMinor',10100000,'realizedMinor',100000);
 r:=public.practice_commit_asset_trade(aid,1,s,t,repeat('c',64));if r->'state'<>s then raise exception 'BTC sell';end if;
 s:='{"cashMinor":9950000,"realizedMinor":100000,"positions":[{"symbol":"USDJPY","name":"米ドル / 円","type":"fx","unit":"USD","quantity":10000000,"costMinor":150000}],"version":3}';
 t:=jsonb_build_object('requestId',gen_random_uuid(),'symbol','USDJPY','name','米ドル / 円','type','fx','unit','USD','side','buy','quantity',10000000,'quantityScale',1000000,'priceMinor',15000,'totalMinor',150000,'cashAfterMinor',9950000,'realizedMinor',0,'source','frankfurter','quoteAt',null,'quoteDate',current_date::text,'executedAt',stamp);
 r:=public.practice_commit_asset_trade(aid,2,s,t,repeat('c',64));if r->'state'<>s then raise exception 'FX buy';end if;
 s:='{"cashMinor":10101000,"realizedMinor":101000,"positions":[],"version":4}';
 t:=t||jsonb_build_object('requestId',gen_random_uuid(),'side','sell','priceMinor',15100,'totalMinor',151000,'cashAfterMinor',10101000,'realizedMinor',1000);
 r:=public.practice_commit_asset_trade(aid,3,s,t,repeat('c',64));if r->'state'<>s then raise exception 'FX sell';end if;
 insert into public.practice_trades(account_id,request_id,fingerprint,trade) values(aid,gen_random_uuid(),repeat('d',64),'{"symbol":"9434.T","quantity":100,"source":"yahoo"}');
 r:=public.practice_asset_history(aid,0,50);if jsonb_array_length(r->'items')<>5 then raise exception 'History union';end if;
 if not exists(select 1 from jsonb_array_elements(r->'items') x where x->>'legacy'='true') then raise exception 'Legacy flag';end if;
 r:=public.practice_asset_history(aid,0,2);if r->>'hasMore'<>'true' or jsonb_array_length(r->'items')<>2 then raise exception 'Pagination';end if;
 insert into public.practice_sessions(token_hash,account_id,expires_at) values(repeat(tag,2),aid,now()+interval '1 day');
 delete from public.practice_accounts where id=aid;
 if exists(select 1 from public.practice_wallets where account_id=aid) or exists(select 1 from public.practice_asset_trades where account_id=aid) or exists(select 1 from public.practice_trades where account_id=aid) or exists(select 1 from public.practice_sessions where account_id=aid) then raise exception 'Cascade';end if;
 r:=public.practice_claim_quotes('crypto');
 if r->>'claimed'='true' then
  token:=(r->>'token')::uuid;r:=public.practice_claim_quotes('crypto');if r->>'claimed'<>'false' then raise exception 'Double cache claim';end if;
  if public.practice_save_quotes('crypto',gen_random_uuid(),'[1,2,3,4]',stamp) then raise exception 'Wrong lease accepted';end if;
  perform public.practice_fail_quotes('crypto',token,'MARKET_RATE_LIMIT',600000);
 end if;
end $$;
rollback;
select 'PASS: wallet trigger, BTC/FX round trips, CAS, idempotency, invalid quotes, legacy history, pagination, deletion cascade and cache lease' as result;
