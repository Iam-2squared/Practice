-- Practice-only bootstrap. Run in a NEW dedicated Supabase project.
-- No existing user data is modified or dropped. All app access is server-side.
begin;
create table if not exists public.practice_accounts (
 id uuid primary key default gen_random_uuid(),
 lookup text unique not null check (lookup ~ '^[a-f0-9]{64}$'),
 salt text not null check (salt ~ '^[a-f0-9]{32}$'),
 password_hash text not null check (password_hash ~ '^[a-f0-9]{128}$'),
 market text not null check (market in ('demo','yahoo')),
 state jsonb not null check (
   jsonb_typeof(state) = 'object' and
   jsonb_typeof(state->'cashMinor') = 'number' and
   (state->>'cashMinor')::numeric between 0 and 1000000000000 and
   (state->>'cashMinor')::numeric = trunc((state->>'cashMinor')::numeric) and
   jsonb_typeof(state->'positions') = 'array' and
   jsonb_array_length(state->'positions') <= 100 and
   jsonb_typeof(state->'version') = 'number' and (state->>'version')::bigint >= 0
 ),
 created_at timestamptz not null default now()
);
create table if not exists public.practice_sessions (
 token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
 account_id uuid not null references public.practice_accounts(id) on delete cascade,
 expires_at timestamptz not null
);
create index if not exists practice_sessions_expiry on public.practice_sessions(expires_at);
create index if not exists practice_sessions_account on public.practice_sessions(account_id);
create table if not exists public.practice_trades (
 sequence bigint generated always as identity primary key,
 account_id uuid not null references public.practice_accounts(id) on delete cascade,
 request_id uuid not null,
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 trade jsonb not null,
 created_at timestamptz not null default now(),
 unique(account_id,request_id)
);
create index if not exists practice_trades_account_sequence on public.practice_trades(account_id,sequence desc);
create table if not exists public.practice_rate_buckets (
 key text primary key,
 bucket bigint not null,
 hits integer not null,
 expires_at timestamptz not null
);
create index if not exists practice_rate_expiry on public.practice_rate_buckets(expires_at);
alter table public.practice_accounts enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_trades enable row level security;
alter table public.practice_rate_buckets enable row level security;
-- No browser policies: anon/authenticated MUST NOT read balances or write trades.
revoke all on public.practice_accounts, public.practice_sessions, public.practice_trades, public.practice_rate_buckets from public, anon, authenticated;
grant select,insert,update,delete on public.practice_accounts, public.practice_sessions, public.practice_trades, public.practice_rate_buckets to service_role;
revoke all on sequence public.practice_trades_sequence_seq from public,anon,authenticated;
grant usage,select on sequence public.practice_trades_sequence_seq to service_role;
create or replace function public.practice_commit_trade(
 p_account_id uuid, p_expected_version bigint, p_state jsonb, p_trade jsonb, p_fingerprint text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.practice_accounts%rowtype; old_trade public.practice_trades%rowtype;
begin
 select * into strict a from public.practice_accounts where id=p_account_id for update;
 select * into old_trade from public.practice_trades where account_id=p_account_id and request_id=(p_trade->>'requestId')::uuid;
 if found then
  if old_trade.fingerprint <> p_fingerprint then return jsonb_build_object('idempotencyConflict',true); end if;
  return jsonb_build_object('duplicate',true,'state',a.state,'trade',old_trade.trade);
 end if;
 if (a.state->>'version')::bigint <> p_expected_version then return jsonb_build_object('conflict',true); end if;
 if (p_state->>'version')::bigint <> p_expected_version + 1
    or p_trade->>'side' not in ('buy','sell')
    or p_trade->>'symbol' !~ '^[1-9][0-9A-Z]{3}\.T$'
    or (p_trade->>'source') <> a.market
    or (p_trade->>'quantity')::numeric not between 1 and 1000000
    or (p_trade->>'quantity')::numeric <> trunc((p_trade->>'quantity')::numeric)
    or (p_trade->>'priceMinor')::numeric <= 0
    or (p_trade->>'totalMinor')::numeric <> (p_trade->>'priceMinor')::numeric * (p_trade->>'quantity')::numeric
    or (p_trade->>'cashAfterMinor')::numeric <> (p_state->>'cashMinor')::numeric then
  raise exception 'Invalid trade contract';
 end if;
 update public.practice_accounts set state=p_state where id=p_account_id;
 insert into public.practice_trades(account_id,request_id,fingerprint,trade)
 values(p_account_id,(p_trade->>'requestId')::uuid,p_fingerprint,p_trade);
 return jsonb_build_object('duplicate',false,'state',p_state,'trade',p_trade);
end $$;
revoke all on function public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text) to service_role;
create or replace function public.practice_rate_limit(
 p_key text, p_limit integer, p_window_ms bigint, p_now_ms bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare b bigint; n integer;
begin
 if p_limit < 1 or p_limit > 10000 or p_window_ms < 1000 or p_window_ms > 86400000 or p_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid limiter'; end if;
 -- Use database time, never a browser-supplied clock.
 b := floor(extract(epoch from statement_timestamp()) * 1000 / p_window_ms);
 delete from public.practice_rate_buckets where expires_at < now();
 insert into public.practice_rate_buckets as r(key,bucket,hits,expires_at)
 values(p_key,b,1,now()+make_interval(secs=>p_window_ms::double precision/1000))
 on conflict(key) do update set bucket=b,
 hits=case when r.bucket=b then r.hits+1 else 1 end,
 expires_at=now()+make_interval(secs=>p_window_ms::double precision/1000)
 returning hits into n;
 return n <= p_limit;
end $$;
revoke all on function public.practice_rate_limit(text,integer,bigint,bigint) from public,anon,authenticated;
grant execute on function public.practice_rate_limit(text,integer,bigint,bigint) to service_role;
commit;
