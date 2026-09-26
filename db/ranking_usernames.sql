-- Add public-facing usernames for the leaderboard without changing balances, positions, trades or credentials.
begin;
alter table public.practice_accounts add column if not exists username text;
update public.practice_accounts
set username = 'user_' || left(replace(id::text,'-',''), 8)
where username is null;
alter table public.practice_accounts alter column username set not null;
alter table public.practice_accounts drop constraint if exists practice_accounts_username_check;
alter table public.practice_accounts add constraint practice_accounts_username_check
  check (char_length(username) between 2 and 20 and username = btrim(username) and username !~ '[[:cntrl:]<>]');
create unique index if not exists practice_accounts_username_lower_key
  on public.practice_accounts (lower(username));
commit;
