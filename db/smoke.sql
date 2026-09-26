-- Service-role integration test. All fixture data is rolled back.
begin;
set local role service_role;
do $$
declare aid uuid; s jsonb; t jsonb; r jsonb; denied boolean; q integer;
 lookup_a text := replace(gen_random_uuid()::text,'-','');
begin
 if has_table_privilege('anon','public.practice_accounts','select')
    or has_table_privilege('authenticated','public.practice_accounts','update')
    or has_function_privilege('anon','public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text)','execute') then raise exception 'Public exposure'; end if;
 if public.practice_valid_state('{}') or public.practice_valid_state(null) then raise exception 'Missing state fields accepted'; end if;
 insert into public.practice_accounts(lookup,salt,password_hash,username,market,state)
 values(repeat(lookup_a,2),repeat('b',32),repeat('c',128),'smoke_user','demo','{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}') returning id into aid;
 s := '{"cashMinor":8000000,"realizedMinor":0,"positions":[{"symbol":"9432.T","name":"Test","shares":200,"costMinor":2000000}],"version":1}';
 t := '{"requestId":"00000000-0000-4000-8000-000000000001","symbol":"9432.T","name":"Test","side":"buy","quantity":200,"priceMinor":10000,"totalMinor":2000000,"cashAfterMinor":8000000,"realizedMinor":0,"source":"demo","quoteAt":null,"executedAt":1800000000000}';
 foreach q in array array[1,99,101,150,199] loop
  denied:=false;
  begin perform public.practice_commit_trade(aid,0,s,jsonb_set(t,'{quantity}',to_jsonb(q)),repeat('d',64));
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'Non-lot quantity % accepted',q; end if;
 end loop;
 if (select (state->>'version')::integer from public.practice_accounts where id=aid)<>0 then raise exception 'Rejected orders mutated state'; end if;
 r:=public.practice_commit_trade(aid,0,s,t,repeat('d',64));
 if r->>'duplicate'<>'false' or r->'state'<>s then raise exception '200-share buy failed'; end if;
 r:=public.practice_commit_trade(aid,0,s,t,repeat('d',64));
 if r->>'duplicate'<>'true' then raise exception 'Idempotency failed'; end if;
 if (select count(*) from public.practice_trades where account_id=aid)<>1 then raise exception 'Duplicate ledger row'; end if;
 r:=public.practice_commit_trade(aid,0,s,t,repeat('e',64));
 if r->>'idempotencyConflict'<>'true' then raise exception 'Fingerprint conflict failed'; end if;
 t:=jsonb_set(t,'{requestId}','"00000000-0000-4000-8000-000000000002"');
 r:=public.practice_commit_trade(aid,0,s,t,repeat('e',64));
 if r->>'conflict'<>'true' then raise exception 'Version conflict failed'; end if;
 denied:=false;
 begin perform public.practice_commit_trade(aid,1,jsonb_set(s,'{version}','2'),t,repeat('e',64));
 exception when check_violation then denied:=true; end;
 if not denied then raise exception 'Forged state accepted'; end if;
 denied:=false;
 begin update public.practice_accounts set state=jsonb_set(state,'{cashMinor}','-1') where id=aid;
 exception when check_violation then denied:=true; end;
 if not denied then raise exception 'Negative cash accepted'; end if;
 denied:=false;
 begin update public.practice_accounts set state=jsonb_set(state,'{positions,0,shares}','99') where id=aid;
 exception when check_violation then denied:=true; end;
 if not denied then raise exception 'Odd-lot holding accepted'; end if;
 s:='{"cashMinor":9200000,"realizedMinor":200000,"positions":[{"symbol":"9432.T","name":"Test","shares":100,"costMinor":1000000}],"version":2}';
 t:=t||'{"side":"sell","quantity":100,"priceMinor":12000,"totalMinor":1200000,"cashAfterMinor":9200000,"realizedMinor":200000}'::jsonb;
 r:=public.practice_commit_trade(aid,1,s,t,repeat('e',64));
 if r->'state'<>s then raise exception 'Partial sale or cost basis failed'; end if;
 s:='{"cashMinor":10300000,"realizedMinor":300000,"positions":[],"version":3}';
 t:=t||'{"requestId":"00000000-0000-4000-8000-000000000003","priceMinor":11000,"totalMinor":1100000,"cashAfterMinor":10300000,"realizedMinor":100000}'::jsonb;
 r:=public.practice_commit_trade(aid,2,s,t,repeat('f',64));
 if r->'state'<>s then raise exception 'Full sale or realized profit failed'; end if;
 insert into public.practice_sessions(token_hash,account_id,expires_at) values(repeat('a',64),aid,now()+interval '1 day'),(repeat('b',64),aid,now()+interval '1 day');
 delete from public.practice_accounts where id=aid;
 if exists(select 1 from public.practice_sessions where account_id=aid) or exists(select 1 from public.practice_trades where account_id=aid) then raise exception 'Deletion cascade failed'; end if;
 if not public.practice_rate_limit(repeat(lookup_a,2),1,60000,0) then raise exception 'First rate bucket failed'; end if;
 if public.practice_rate_limit(repeat(lookup_a,2),1,60000,0) then raise exception 'Rate limit failed'; end if;
end $$;
rollback;
