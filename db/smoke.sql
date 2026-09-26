-- CI only: transaction rolls back all fixture data. No real Supabase project needed.
begin;
do $$
declare aid uuid; s jsonb; t jsonb; r jsonb; denied boolean := false;
begin
 if has_table_privilege('anon','public.practice_accounts','select')
    or has_table_privilege('authenticated','public.practice_accounts','update')
    or has_function_privilege('anon','public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text)','execute') then
  raise exception 'Public database exposure';
 end if;
 insert into public.practice_accounts(lookup,salt,password_hash,market,state)
 values(repeat('a',64),repeat('b',32),repeat('c',128),'demo',
 '{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}') returning id into aid;
 s := '{"cashMinor":9800000,"realizedMinor":0,"positions":[{"symbol":"7203.T","name":"Test","shares":2,"costMinor":200000}],"version":1}';
 t := '{"requestId":"00000000-0000-4000-8000-000000000001","symbol":"7203.T","name":"Test","side":"buy","quantity":2,"priceMinor":100000,"totalMinor":200000,"cashAfterMinor":9800000,"source":"demo"}';
 r := public.practice_commit_trade(aid,0,s,t,repeat('d',64));
 if r->>'duplicate' <> 'false' or (r->'state'->>'cashMinor')::bigint <> 9800000 then raise exception 'Initial commit failed'; end if;
 r := public.practice_commit_trade(aid,0,s,t,repeat('d',64));
 if r->>'duplicate' <> 'true' then raise exception 'Idempotency failed'; end if;
 if (select count(*) from public.practice_trades where account_id=aid) <> 1 then raise exception 'Duplicate ledger row'; end if;
 r := public.practice_commit_trade(aid,0,s,t,repeat('e',64));
 if r->>'idempotencyConflict' <> 'true' then raise exception 'Fingerprint conflict failed'; end if;
 t := jsonb_set(t,'{requestId}','"00000000-0000-4000-8000-000000000002"');
 r := public.practice_commit_trade(aid,0,s,t,repeat('e',64));
 if r->>'conflict' <> 'true' then raise exception 'CAS conflict failed'; end if;
 begin
  s := jsonb_set(jsonb_set(s,'{version}','2'),'{cashMinor}','-1');
  t := jsonb_set(t,'{cashAfterMinor}','-1');
  perform public.practice_commit_trade(aid,1,s,t,repeat('e',64));
 exception when check_violation then denied := true;
 end;
 if not denied then raise exception 'Negative cash accepted'; end if;
 if (select (state->>'version')::integer from public.practice_accounts where id=aid) <> 1 then raise exception 'Failed commit mutated account'; end if;
 if not public.practice_rate_limit(repeat('f',64),1,60000,0) then raise exception 'First rate bucket failed'; end if;
 if public.practice_rate_limit(repeat('f',64),1,60000,0) then raise exception 'Rate limit not enforced'; end if;
end $$;
rollback;
