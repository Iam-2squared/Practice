-- Practice v0.2. Dedicated NEW project only. No user data is reset.
begin;
create or replace function public.practice_valid_state(s jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare p jsonb; seen text[] := '{}';
begin
 if (jsonb_typeof(s)='object' and s ?& array['cashMinor','realizedMinor','positions','version']
   and jsonb_typeof(s->'cashMinor')='number' and jsonb_typeof(s->'realizedMinor')='number'
   and jsonb_typeof(s->'version')='number' and jsonb_typeof(s->'positions')='array') is not true then return false; end if;
 if (s->>'cashMinor')::numeric not between 0 and 1000000000000
   or (s->>'cashMinor')::numeric <> trunc((s->>'cashMinor')::numeric)
   or abs((s->>'realizedMinor')::numeric) > 9007199254740991
   or (s->>'realizedMinor')::numeric <> trunc((s->>'realizedMinor')::numeric)
   or (s->>'version')::numeric not between 0 and 9007199254740991
   or (s->>'version')::numeric <> trunc((s->>'version')::numeric)
   or jsonb_array_length(s->'positions') > 100 then return false; end if;
 for p in select value from jsonb_array_elements(s->'positions') loop
  if (jsonb_typeof(p)='object' and p ?& array['symbol','name','shares','costMinor']
    and jsonb_typeof(p->'symbol')='string' and p->>'symbol' ~ '^[1-9][0-9A-Z]{3}\.T$'
    and jsonb_typeof(p->'name')='string' and length(p->>'name') between 1 and 100
    and jsonb_typeof(p->'shares')='number' and jsonb_typeof(p->'costMinor')='number') is not true then return false; end if;
  if (p->>'shares')::numeric not between 100 and 1000000000000
    or mod((p->>'shares')::numeric,100) <> 0
    or (p->>'costMinor')::numeric not between 1 and 1000000000000
    or (p->>'costMinor')::numeric <> trunc((p->>'costMinor')::numeric)
    or p->>'symbol'=any(seen) then return false; end if;
  seen := array_append(seen,p->>'symbol');
 end loop;
 return true;
end $$;
revoke all on function public.practice_valid_state(jsonb) from public,anon,authenticated;
grant execute on function public.practice_valid_state(jsonb) to service_role;
create table if not exists public.practice_accounts (
 id uuid primary key default gen_random_uuid(),
 lookup text unique not null check (lookup ~ '^[a-f0-9]{64}$'),
 salt text not null check (salt ~ '^[a-f0-9]{32}$'),
 password_hash text not null check (password_hash ~ '^[a-f0-9]{128}$'),
 username text not null check (char_length(username) between 2 and 20 and username=btrim(username) and username !~ '[[:cntrl:]<>]'),
 market text not null check (market in ('demo','yahoo')),
 state jsonb not null check (public.practice_valid_state(state)),
 created_at timestamptz not null default now()
);
create unique index if not exists practice_accounts_username_lower_key on public.practice_accounts(lower(username));
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
 trade jsonb not null check ((jsonb_typeof(trade->'quantity')='number'
   and (trade->>'quantity')::numeric between 100 and 1000000
   and mod((trade->>'quantity')::numeric,100)=0) is true),
 created_at timestamptz not null default now(),
 unique(account_id,request_id)
);
create index if not exists practice_trades_account_sequence on public.practice_trades(account_id,sequence desc);
create table if not exists public.practice_rate_buckets (
 key text primary key, bucket bigint not null, hits integer not null, expires_at timestamptz not null
);
create index if not exists practice_rate_expiry on public.practice_rate_buckets(expires_at);
alter table public.practice_accounts enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_trades enable row level security;
alter table public.practice_rate_buckets enable row level security;
-- Browser roles cannot access data; the Node API authenticates each request.
revoke all on public.practice_accounts,public.practice_sessions,public.practice_trades,public.practice_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.practice_accounts,public.practice_sessions,public.practice_trades,public.practice_rate_buckets to service_role;
revoke all on sequence public.practice_trades_sequence_seq from public,anon,authenticated;
grant usage,select on sequence public.practice_trades_sequence_seq to service_role;
create or replace function public.practice_commit_trade(
 p_account_id uuid,p_expected_version bigint,p_state jsonb,p_trade jsonb,p_fingerprint text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 a public.practice_accounts%rowtype; old_trade public.practice_trades%rowtype;
 qty numeric; price numeric; total numeric; cash numeric; realized numeric := 0; basis numeric;
 positions jsonb; position jsonb; idx integer; expected jsonb;
begin
 select * into strict a from public.practice_accounts where id=p_account_id for update;
 select * into old_trade from public.practice_trades where account_id=p_account_id and request_id=(p_trade->>'requestId')::uuid;
 if found then
  if old_trade.fingerprint is distinct from p_fingerprint then return jsonb_build_object('idempotencyConflict',true); end if;
  return jsonb_build_object('duplicate',true,'state',a.state,'trade',old_trade.trade);
 end if;
 if (a.state->>'version')::bigint <> p_expected_version then return jsonb_build_object('conflict',true); end if;
 if (jsonb_typeof(p_trade)='object' and p_trade ?& array['requestId','symbol','name','side','quantity','priceMinor','totalMinor','cashAfterMinor','realizedMinor','source','executedAt','quoteAt']
   and p_trade->>'requestId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and p_trade->>'side' in ('buy','sell') and p_trade->>'symbol' ~ '^[1-9][0-9A-Z]{3}\.T$'
   and p_trade->>'source'=a.market and jsonb_typeof(p_trade->'name')='string'
   and length(p_trade->>'name') between 1 and 100
   and jsonb_typeof(p_trade->'quantity')='number' and jsonb_typeof(p_trade->'priceMinor')='number'
   and jsonb_typeof(p_trade->'totalMinor')='number' and jsonb_typeof(p_trade->'cashAfterMinor')='number'
   and jsonb_typeof(p_trade->'realizedMinor')='number' and jsonb_typeof(p_trade->'executedAt')='number'
   and p_fingerprint ~ '^[a-f0-9]{64}$' and public.practice_valid_state(p_state)) is not true then
  raise exception 'Invalid trade contract' using errcode='23514';
 end if;
 qty := (p_trade->>'quantity')::numeric; price := (p_trade->>'priceMinor')::numeric; total := qty*price;
 if qty not between 100 and 1000000 or mod(qty,100)<>0
   or price not between 1 and 1000000000000 or price<>trunc(price)
   or total>1000000000000 or total<>(p_trade->>'totalMinor')::numeric then
  raise exception 'Invalid lot or price' using errcode='23514';
 end if;
 positions := a.state->'positions'; cash := (a.state->>'cashMinor')::numeric;
 select (ordinality-1)::integer,value into idx,position from jsonb_array_elements(positions) with ordinality where value->>'symbol'=p_trade->>'symbol';
 if p_trade->>'side'='buy' then
  if cash<total then raise exception 'Insufficient cash' using errcode='23514'; end if;
  cash := cash-total;
  if idx is null then
   positions := positions || jsonb_build_array(jsonb_build_object('symbol',p_trade->>'symbol','name',p_trade->>'name','shares',qty,'costMinor',total));
  else
   position := position || jsonb_build_object('shares',(position->>'shares')::numeric+qty,'costMinor',(position->>'costMinor')::numeric+total);
   positions := jsonb_set(positions,array[idx::text],position);
  end if;
 else
  if idx is null or (position->>'shares')::numeric<qty then raise exception 'Insufficient shares' using errcode='23514'; end if;
  basis := floor((position->>'costMinor')::numeric*qty/(position->>'shares')::numeric);
  realized := total-basis; cash := cash+total;
  if (position->>'shares')::numeric=qty then positions := positions-idx;
  else
   position := position || jsonb_build_object('shares',(position->>'shares')::numeric-qty,'costMinor',(position->>'costMinor')::numeric-basis);
   positions := jsonb_set(positions,array[idx::text],position);
  end if;
 end if;
 expected := jsonb_build_object('cashMinor',cash,'realizedMinor',(a.state->>'realizedMinor')::numeric+realized,'positions',positions,'version',p_expected_version+1);
 if expected is distinct from p_state or not public.practice_valid_state(expected)
   or (p_trade->>'cashAfterMinor')::numeric<>cash or (p_trade->>'realizedMinor')::numeric<>realized then
  raise exception 'State transition mismatch' using errcode='23514';
 end if;
 update public.practice_accounts set state=expected where id=p_account_id;
 insert into public.practice_trades(account_id,request_id,fingerprint,trade) values(p_account_id,(p_trade->>'requestId')::uuid,p_fingerprint,p_trade);
 return jsonb_build_object('duplicate',false,'state',expected,'trade',p_trade);
end $$;
revoke all on function public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text) to service_role;
create or replace function public.practice_rate_limit(p_key text,p_limit integer,p_window_ms bigint,p_now_ms bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare b bigint; n integer;
begin
 if (p_limit between 1 and 10000 and p_window_ms between 1000 and 86400000 and p_key ~ '^[a-f0-9]{64}$') is not true then raise exception 'Invalid limiter'; end if;
 b := floor(extract(epoch from statement_timestamp())*1000/p_window_ms);
 delete from public.practice_rate_buckets where expires_at<now();
 insert into public.practice_rate_buckets as r(key,bucket,hits,expires_at) values(p_key,b,1,now()+make_interval(secs=>p_window_ms::double precision/1000))
 on conflict(key) do update set bucket=b,hits=case when r.bucket=b then least(r.hits+1,10001) else 1 end,
 expires_at=now()+make_interval(secs=>p_window_ms::double precision/1000) returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.practice_rate_limit(text,integer,bigint,bigint) from public,anon,authenticated;
grant execute on function public.practice_rate_limit(text,integer,bigint,bigint) to service_role;
commit;
),
 username text not null check (char_length(username) between 2 and 20 and username=btrim(username) and username !~ '[[:cntrl:]<>]'),
 market text not null check (market in ('demo','yahoo')),
 state jsonb not null check (public.practice_valid_state(state)),
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
 trade jsonb not null check ((jsonb_typeof(trade->'quantity')='number'
   and (trade->>'quantity')::numeric between 100 and 1000000
   and mod((trade->>'quantity')::numeric,100)=0) is true),
 created_at timestamptz not null default now(),
 unique(account_id,request_id)
);
create index if not exists practice_trades_account_sequence on public.practice_trades(account_id,sequence desc);
create table if not exists public.practice_rate_buckets (
 key text primary key, bucket bigint not null, hits integer not null, expires_at timestamptz not null
);
create index if not exists practice_rate_expiry on public.practice_rate_buckets(expires_at);
alter table public.practice_accounts enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_trades enable row level security;
alter table public.practice_rate_buckets enable row level security;
-- Browser roles cannot access data; the Node API authenticates each request.
revoke all on public.practice_accounts,public.practice_sessions,public.practice_trades,public.practice_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.practice_accounts,public.practice_sessions,public.practice_trades,public.practice_rate_buckets to service_role;
revoke all on sequence public.practice_trades_sequence_seq from public,anon,authenticated;
grant usage,select on sequence public.practice_trades_sequence_seq to service_role;
create or replace function public.practice_commit_trade(
 p_account_id uuid,p_expected_version bigint,p_state jsonb,p_trade jsonb,p_fingerprint text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 a public.practice_accounts%rowtype; old_trade public.practice_trades%rowtype;
 qty numeric; price numeric; total numeric; cash numeric; realized numeric := 0; basis numeric;
 positions jsonb; position jsonb; idx integer; expected jsonb;
begin
 select * into strict a from public.practice_accounts where id=p_account_id for update;
 select * into old_trade from public.practice_trades where account_id=p_account_id and request_id=(p_trade->>'requestId')::uuid;
 if found then
  if old_trade.fingerprint is distinct from p_fingerprint then return jsonb_build_object('idempotencyConflict',true); end if;
  return jsonb_build_object('duplicate',true,'state',a.state,'trade',old_trade.trade);
 end if;
 if (a.state->>'version')::bigint <> p_expected_version then return jsonb_build_object('conflict',true); end if;
 if (jsonb_typeof(p_trade)='object' and p_trade ?& array['requestId','symbol','name','side','quantity','priceMinor','totalMinor','cashAfterMinor','realizedMinor','source','executedAt','quoteAt']
   and p_trade->>'requestId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and p_trade->>'side' in ('buy','sell') and p_trade->>'symbol' ~ '^[1-9][0-9A-Z]{3}\.T$'
   and p_trade->>'source'=a.market and jsonb_typeof(p_trade->'name')='string'
   and length(p_trade->>'name') between 1 and 100
   and jsonb_typeof(p_trade->'quantity')='number' and jsonb_typeof(p_trade->'priceMinor')='number'
   and jsonb_typeof(p_trade->'totalMinor')='number' and jsonb_typeof(p_trade->'cashAfterMinor')='number'
   and jsonb_typeof(p_trade->'realizedMinor')='number' and jsonb_typeof(p_trade->'executedAt')='number'
   and p_fingerprint ~ '^[a-f0-9]{64}$' and public.practice_valid_state(p_state)) is not true then
  raise exception 'Invalid trade contract' using errcode='23514';
 end if;
 qty := (p_trade->>'quantity')::numeric; price := (p_trade->>'priceMinor')::numeric; total := qty*price;
 if qty not between 100 and 1000000 or mod(qty,100)<>0
   or price not between 1 and 1000000000000 or price<>trunc(price)
   or total>1000000000000 or total<>(p_trade->>'totalMinor')::numeric then
  raise exception 'Invalid lot or price' using errcode='23514';
 end if;
 positions := a.state->'positions'; cash := (a.state->>'cashMinor')::numeric;
 select (ordinality-1)::integer,value into idx,position from jsonb_array_elements(positions) with ordinality where value->>'symbol'=p_trade->>'symbol';
 if p_trade->>'side'='buy' then
  if cash<total then raise exception 'Insufficient cash' using errcode='23514'; end if;
  cash := cash-total;
  if idx is null then
   positions := positions || jsonb_build_array(jsonb_build_object('symbol',p_trade->>'symbol','name',p_trade->>'name','shares',qty,'costMinor',total));
  else
   position := position || jsonb_build_object('shares',(position->>'shares')::numeric+qty,'costMinor',(position->>'costMinor')::numeric+total);
   positions := jsonb_set(positions,array[idx::text],position);
  end if;
 else
  if idx is null or (position->>'shares')::numeric<qty then raise exception 'Insufficient shares' using errcode='23514'; end if;
  basis := floor((position->>'costMinor')::numeric*qty/(position->>'shares')::numeric);
  realized := total-basis; cash := cash+total;
  if (position->>'shares')::numeric=qty then positions := positions-idx;
  else
   position := position || jsonb_build_object('shares',(position->>'shares')::numeric-qty,'costMinor',(position->>'costMinor')::numeric-basis);
   positions := jsonb_set(positions,array[idx::text],position);
  end if;
 end if;
 expected := jsonb_build_object('cashMinor',cash,'realizedMinor',(a.state->>'realizedMinor')::numeric+realized,'positions',positions,'version',p_expected_version+1);
 if expected is distinct from p_state or not public.practice_valid_state(expected)
   or (p_trade->>'cashAfterMinor')::numeric<>cash or (p_trade->>'realizedMinor')::numeric<>realized then
  raise exception 'State transition mismatch' using errcode='23514';
 end if;
 update public.practice_accounts set state=expected where id=p_account_id;
 insert into public.practice_trades(account_id,request_id,fingerprint,trade) values(p_account_id,(p_trade->>'requestId')::uuid,p_fingerprint,p_trade);
 return jsonb_build_object('duplicate',false,'state',expected,'trade',p_trade);
end $$;
revoke all on function public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.practice_commit_trade(uuid,bigint,jsonb,jsonb,text) to service_role;
create or replace function public.practice_rate_limit(p_key text,p_limit integer,p_window_ms bigint,p_now_ms bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare b bigint; n integer;
begin
 if (p_limit between 1 and 10000 and p_window_ms between 1000 and 86400000 and p_key ~ '^[a-f0-9]{64}$') is not true then raise exception 'Invalid limiter'; end if;
 b := floor(extract(epoch from statement_timestamp())*1000/p_window_ms);
 delete from public.practice_rate_buckets where expires_at<now();
 insert into public.practice_rate_buckets as r(key,bucket,hits,expires_at) values(p_key,b,1,now()+make_interval(secs=>p_window_ms::double precision/1000))
 on conflict(key) do update set bucket=b,hits=case when r.bucket=b then least(r.hits+1,10001) else 1 end,
 expires_at=now()+make_interval(secs=>p_window_ms::double precision/1000) returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.practice_rate_limit(text,integer,bigint,bigint) from public,anon,authenticated;
grant execute on function public.practice_rate_limit(text,integer,bigint,bigint) to service_role;
commit;
