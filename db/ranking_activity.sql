begin;
alter table public.practice_accounts drop constraint if exists practice_accounts_username_check;
alter table public.practice_accounts add constraint practice_accounts_username_check check (char_length(username)>=2 and char_length(username)<=15 and username=btrim(username) and username !~ '[[:cntrl:]<>]');
create or replace function public.practice_leaderboard_sell_counts()
returns table(account_id uuid,sell_count bigint)
language sql security definer set search_path=public,pg_temp
as $$ select a.id,count(t.sequence) filter (where t.trade->>'side'='sell')::bigint from public.practice_accounts a left join public.practice_asset_trades t on t.account_id=a.id group by a.id $$;
revoke all on function public.practice_leaderboard_sell_counts() from public,anon,authenticated;
grant execute on function public.practice_leaderboard_sell_counts() to service_role;
commit;
