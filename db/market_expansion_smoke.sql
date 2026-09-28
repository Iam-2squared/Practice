-- CI database only. Every fixture is rolled back; never run against user data.
begin;
set local role service_role;
do $$
declare aid uuid; a jsonb; s jsonb; t jsonb; r jsonb; positions jsonb; payload jsonb;
 qty bigint; price bigint; total bigint; version bigint:=0; cash bigint:=10000000;
 token uuid; k text; denied boolean; tag text:=replace(gen_random_uuid()::text,'-','');
 stamp bigint:=floor(extract(epoch from statement_timestamp())*1000); week_start bigint;
begin
 if jsonb_array_length(public.practice_assets())<>17 then raise exception 'Catalog size';end if;
 if has_function_privilege('anon','public.practice_assets()','execute') or has_function_privilege('authenticated','public.practice_valid_chart_key(text)','execute') or has_table_privilege('anon','public.practice_quote_cache','select') then raise exception 'Public privileges';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('practice_wallets','practice_asset_trades','practice_quote_cache','practice_chart_cache','practice_comments','practice_week_prices') and not c.relrowsecurity) then raise exception 'RLS disabled';end if;
 insert into public.practice_accounts(lookup,salt,password_hash,username,market,state) values(repeat(tag,2),repeat('a',32),repeat('b',128),'mx_'||left(tag,12),'multi','{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}') returning id into aid;
 positions:='[]'::jsonb;
 for a in select value from jsonb_array_elements(public.practice_assets()) loop
   qty:=(a->>'step')::bigint;price:=case when a->>'type'='crypto' then 1000000 else 10000 end;total:=ceil(qty::numeric*price/1000000);cash:=cash-total;
   positions:=positions||jsonb_build_array(jsonb_build_object('symbol',a->>'symbol','name',a->>'name','type',a->>'type','unit',a->>'unit','quantity',qty,'costMinor',total));
   s:=jsonb_build_object('cashMinor',cash,'realizedMinor',0,'positions',positions,'version',version+1);
   t:=jsonb_build_object('requestId',gen_random_uuid(),'symbol',a->>'symbol','name',a->>'name','type',a->>'type','unit',a->>'unit','side','buy','quantity',qty,'quantityScale',1000000,'priceMinor',price,'totalMinor',total,'cashAfterMinor',cash,'realizedMinor',0,'source',a->>'source','quoteAt',case when a->>'type'='crypto' then stamp else null end,'quoteDate',case when a->>'type'='fx' then current_date::text else null end,'executedAt',stamp);
   r:=public.practice_commit_asset_trade(aid,version,s,t,repeat('c',64));if r->'state' is distinct from s then raise exception 'Buy failed: %',a->>'symbol';end if;
   r:=public.practice_commit_asset_trade(aid,version,s,t,repeat('c',64));if r->>'duplicate'<>'true' then raise exception 'Duplicate failed';end if;
   version:=version+1;
   insert into public.practice_comments(account_id,room,body) values(aid,a->>'symbol','Isolated market expansion fixture');
 end loop;
 if jsonb_array_length(s->'positions')<>17 or not public.practice_valid_asset_state(s) then raise exception '17 holdings rejected';end if;
 if public.practice_valid_asset_state(jsonb_set(s,'{positions}',positions||jsonb_build_array(positions->0))) then raise exception 'Duplicate holding accepted';end if;
 select x into r from public.practice_progress_snapshots(aid,null,stamp-86400000) x;
 if (r->>'cryptoCount')::int<>10 or (r->>'fxCount')::int<>7 then raise exception 'New asset statistics omitted';end if;
 r:=public.practice_progress_observe(aid,version,10000000,'portfolio');
 if not (r->'unlocked' ?& array['crypto3','fx3']) then raise exception 'New asset achievements omitted';end if;
 for a in select value from jsonb_array_elements(public.practice_assets()) loop
   qty:=(a->>'step')::bigint;price:=case when a->>'type'='crypto' then 1000000 else 10000 end;total:=floor(qty::numeric*price/1000000);cash:=cash+total;
   select coalesce(jsonb_agg(value),'[]'::jsonb) into positions from jsonb_array_elements(positions) where value->>'symbol'<>a->>'symbol';
   s:=jsonb_build_object('cashMinor',cash,'realizedMinor',0,'positions',positions,'version',version+1);
   t:=jsonb_build_object('requestId',gen_random_uuid(),'symbol',a->>'symbol','name',a->>'name','type',a->>'type','unit',a->>'unit','side','sell','quantity',qty,'quantityScale',1000000,'priceMinor',price,'totalMinor',total,'cashAfterMinor',cash,'realizedMinor',0,'source',a->>'source','quoteAt',case when a->>'type'='crypto' then stamp else null end,'quoteDate',case when a->>'type'='fx' then current_date::text else null end,'executedAt',stamp);
   r:=public.practice_commit_asset_trade(aid,version,s,t,repeat('d',64));if r->'state' is distinct from s then raise exception 'Sell failed: %',a->>'symbol';end if;version:=version+1;
 end loop;
 if cash<>10000000 or jsonb_array_length(positions)<>0 then raise exception 'Round trip balance';end if;
 if jsonb_array_length(public.practice_asset_history(aid,0,50)->'items')<>34 then raise exception 'History not preserved';end if;

 foreach k in array array['crypto-v2','fx-v2'] loop
   r:=public.practice_claim_quotes(k);if r->>'claimed'<>'true' then raise exception 'New quote lease';end if;token:=(r->>'token')::uuid;
   select jsonb_agg(jsonb_build_object('symbol',value->>'symbol')) into payload from jsonb_array_elements(public.practice_assets()) where value->>'type'=split_part(k,'-',1);
   if public.practice_save_quotes(k,gen_random_uuid(),payload,stamp) then raise exception 'Wrong lease';end if;
   denied:=false;begin perform public.practice_save_quotes(k,token,payload||jsonb_build_array(payload->0),stamp);exception when others then denied:=true;end;if not denied then raise exception 'Wrong size accepted';end if;
   denied:=false;begin perform public.practice_save_quotes(k,token,jsonb_set(payload,'{0,symbol}','"FAKE"'),stamp);exception when others then denied:=true;end;if not denied then raise exception 'Wrong symbol accepted';end if;
   if not public.practice_save_quotes(k,token,payload,stamp) then raise exception 'Batch save';end if;
   r:=public.practice_claim_quotes(k);if r->>'claimed'<>'false' or jsonb_array_length(r->'cached'->'payload')<>jsonb_array_length(payload) then raise exception 'Shared batch cache';end if;
 end loop;
 if not public.practice_valid_chart_key('chart:AVAX:24H') or not public.practice_valid_chart_key('chart:NZDJPY:5Y') or public.practice_valid_chart_key('chart:AAPL:24H') or public.practice_valid_chart_key('chart:BNB:5Y') or public.practice_valid_chart_key('chart:BTC:24H:extra') or public.practice_valid_chart_key(null) then raise exception 'Chart key validation';end if;
 insert into public.practice_provider_budgets(key,call_count) values('coingecko-chart:'||to_char(statement_timestamp() at time zone 'UTC','YYYY-MM'),499) on conflict(key) do update set call_count=499;
 r:=public.practice_claim_chart('chart:BNB:24H',3600000);if r->>'claimed'<>'true' then raise exception 'Last chart credit';end if;
 for a in select value from jsonb_array_elements(public.practice_assets()) where value->>'type'='crypto' loop
   r:=public.practice_claim_chart('chart:'||(a->>'symbol')||':7D',3600000);if r->'cached'->>'error'<>'CHART_BUDGET' then raise exception 'Budget bypass: %',a->>'symbol';end if;
 end loop;
 r:=public.practice_claim_chart('chart:CADJPY:7D',86400000);if r->>'claimed'<>'true' then raise exception 'FX should not consume crypto budget';end if;
 week_start:=floor((stamp-313200000)::numeric/604800000)*604800000+313200000;
 for a in select value from jsonb_array_elements(public.practice_assets()) loop
   insert into public.practice_week_prices(week_start,symbol,price_minor,price_at,source,granularity)
   values(week_start,a->>'symbol',10000,week_start,a->>'source',case when a->>'type'='crypto' then 'hourly' else 'business-daily' end);
 end loop;
 denied:=false;begin insert into public.practice_week_prices(week_start,symbol,price_minor,price_at,source,granularity) values(week_start,'AAPL',10000,week_start,'coingecko','hourly');exception when check_violation then denied:=true;end;if not denied then raise exception 'Equity accepted';end if;
end $$;
rollback;
select 'PASS: 17-asset buy/sell/history, 17 holdings, achievements, comments, weekly prices, cache generations, leases, shared 500-chart budget, RLS and permissions' as result;
