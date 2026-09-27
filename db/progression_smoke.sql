-- Isolated fixtures; everything rolls back. Existing users are never mutated.
begin;
set local role service_role;
do $$
declare aid uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); r jsonb; saved jsonb; n integer; version bigint; week_ms bigint;
begin
 if has_table_privilege('anon','public.practice_progress','SELECT') or has_table_privilege('authenticated','public.practice_progress','UPDATE') or has_table_privilege('anon','public.practice_week_prices','SELECT') then raise exception 'Progress privilege leak'; end if;
 if has_function_privilege('anon','public.practice_progress_observe(uuid,bigint,bigint,text)','EXECUTE') then raise exception 'RPC privilege leak'; end if;
 insert into public.practice_accounts(id,lookup,salt,password_hash,username,market,state) values(aid,encode(sha256(aid::text::bytea),'hex'),repeat('a',32),repeat('b',128),'p_'||substr(aid::text,1,8),'multi','{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}');
 select (state->>'version')::bigint into version from public.practice_wallets where account_id=aid;
 r:=public.practice_progress_observe(aid,version,10200000,'portfolio');if not (r->'unlocked' ?& array['profit1000','profit2000']) or not (r->>'portfolioSeen')::boolean then raise exception 'Profit thresholds missing'; end if;
 r:=public.practice_progress_observe(aid,version,9800000,'chart');if not (r->'unlocked' ?& array['profit1000','profit2000','loss1000','loss2000']) or not (r->>'chartSeen')::boolean then raise exception 'Loss thresholds missing'; end if;
 saved:=r->'unlocked';r:=public.practice_progress_observe(aid,version,10000000,'');if r->'unlocked' is distinct from saved then raise exception 'Unlocks lost'; end if;
 r:=public.practice_select_badges(aid,array['profit1000','profit2000','loss1000']);if not (r->>'ok')::boolean then raise exception 'Selection failed'; end if;
 r:=public.practice_select_badges(aid,array['profit1000','profit2000','loss1000','loss2000']);if (r->>'ok')::boolean then raise exception 'More than 3 accepted'; end if;
 r:=public.practice_select_badges(aid,array['crypto3']);if (r->>'ok')::boolean then raise exception 'Locked title accepted'; end if;
 r:=public.practice_select_badges(aid,array['profit1000','profit1000']);if (r->>'ok')::boolean then raise exception 'Duplicate accepted'; end if;
 week_ms:=floor(extract(epoch from (date_trunc('week',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'))*1000);
 select x into r from public.practice_progress_snapshots(aid,null,week_ms) x;if r->'account'->>'id'<>aid::text or (r->>'cryptoCount')::integer<>0 then raise exception 'Snapshot failed'; end if;
 insert into public.practice_accounts(id,lookup,salt,password_hash,username,market,state) values(other_id,encode(sha256(other_id::text::bytea),'hex'),repeat('c',32),repeat('d',128),'q_'||substr(other_id::text,1,8),'multi','{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}');
 r:=public.practice_progress_observe(other_id,999,10200000,'portfolio');if r->'unlocked' ? 'profit1000' then raise exception 'Stale valuation unlocked'; end if;
 delete from public.practice_accounts where id=aid;select count(*) into n from public.practice_progress where account_id=aid;if n<>0 then raise exception 'Cascade failed'; end if;
end $$;
rollback;
