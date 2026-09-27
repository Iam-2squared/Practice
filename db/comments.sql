-- Practice v1.1 community comments. Additive only; existing user/trade data is untouched.
begin;
create table if not exists public.practice_comments (
 id bigint generated always as identity primary key,
 account_id uuid not null references public.practice_accounts(id) on delete cascade,
 room text not null check (room in ('GENERAL','BTC','ETH','SOL','XRP','USDJPY','EURJPY','GBPJPY','AUDJPY')),
 body text not null check (char_length(body) between 1 and 280 and body=btrim(body) and body !~ '[[:cntrl:]]'),
 created_at timestamptz not null default now()
);
create index if not exists practice_comments_room_created on public.practice_comments(room,created_at desc,id desc);
create index if not exists practice_comments_account_created on public.practice_comments(account_id,created_at desc);
alter table public.practice_comments enable row level security;
revoke all on public.practice_comments from public,anon,authenticated;
grant select,insert,delete on public.practice_comments to service_role;
revoke all on sequence public.practice_comments_id_seq from public,anon,authenticated;
grant usage,select on sequence public.practice_comments_id_seq to service_role;
commit;
