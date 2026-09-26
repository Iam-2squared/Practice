-- Additive v0.5 migration. Adds only a shared public-market chart cache.
-- Existing accounts, credentials, wallets, positions and trade history are untouched.
begin;

create table if not exists public.practice_chart_cache(
 key text primary key check(
   key ~ '^chart:(BTC|ETH|SOL|XRP):(24H|7D|30D|90D|1Y)$'
   or key ~ '^chart:(USDJPY|EURJPY|GBPJPY|AUDJPY):(7D|1M|3M|1Y|5Y)$'
 ),
 payload jsonb,
 fetched_at bigint not null default 0,
 next_fetch_at bigint not null default 0,
 lease uuid,
 error_code text
);

create table if not exists public.practice_provider_budgets(
 key text primary key check(key~'^coingecko-chart:[0-9]{4}-[0-9]{2}$'),
 call_count integer not null check(call_count between 1 and 500),
 updated_at timestamptz not null default now()
);

alter table public.practice_chart_cache enable row level security;
alter table public.practice_provider_budgets enable row level security;
revoke all on public.practice_chart_cache,public.practice_provider_budgets from public,anon,authenticated;
grant select,insert,update,delete on public.practice_chart_cache,public.practice_provider_budgets to service_role;

create or replace function public.practice_claim_chart(p_key text,p_ttl_ms bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.practice_chart_cache%rowtype;
 stamp bigint:=floor(extract(epoch from statement_timestamp())*1000);
 token uuid:=gen_random_uuid();
 budget_key text;
 budget_count integer;
 next_month bigint;
begin
 if (p_key ~ '^chart:(BTC|ETH|SOL|XRP):(24H|7D|30D|90D|1Y)$'
   or p_key ~ '^chart:(USDJPY|EURJPY|GBPJPY|AUDJPY):(7D|1M|3M|1Y|5Y)$') is not true
   or p_ttl_ms not between 300000 and 86400000 then raise exception 'Invalid chart cache key or TTL';end if;
 insert into public.practice_chart_cache(key) values(p_key) on conflict(key) do nothing;
 select * into strict r from public.practice_chart_cache where key=p_key for update;
 if stamp<r.next_fetch_at then
   return jsonb_build_object('claimed',false,'cached',jsonb_build_object(
     'payload',r.payload,'fetchedAt',r.fetched_at,'nextFetchAt',r.next_fetch_at,'error',r.error_code));
 end if;
 if p_key~'^chart:(BTC|ETH|SOL|XRP):' then
   budget_key:='coingecko-chart:'||to_char(statement_timestamp() at time zone 'UTC','YYYY-MM');
   insert into public.practice_provider_budgets(key,call_count) values(budget_key,1)
   on conflict(key) do update set call_count=public.practice_provider_budgets.call_count+1,updated_at=now()
   where public.practice_provider_budgets.call_count<500
   returning call_count into budget_count;
   if budget_count is null then
     next_month:=floor(extract(epoch from ((date_trunc('month',statement_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC'))*1000);
     update public.practice_chart_cache set payload=null,error_code='CHART_BUDGET',fetched_at=stamp,next_fetch_at=next_month where key=p_key;
     return jsonb_build_object('claimed',false,'cached',jsonb_build_object('payload',null,'fetchedAt',stamp,'nextFetchAt',next_month,'error','CHART_BUDGET'));
   end if;
 end if;
 update public.practice_chart_cache set lease=token,payload=null,error_code=null,
   fetched_at=stamp,next_fetch_at=stamp+p_ttl_ms where key=p_key;
 return jsonb_build_object('claimed',true,'token',token);
end $$;

create or replace function public.practice_save_chart(
 p_key text,p_token uuid,p_payload jsonb,p_fetched_at bigint,p_next_fetch_at bigint
) returns boolean language plpgsql security invoker set search_path='' as $$
declare stamp bigint:=floor(extract(epoch from statement_timestamp())*1000);
begin
 if jsonb_typeof(p_payload)<>'object' or abs(p_fetched_at-stamp)>60000
   or p_next_fetch_at-p_fetched_at not between 300000 and 86400000 then raise exception 'Invalid chart cache payload';end if;
 update public.practice_chart_cache set payload=p_payload,fetched_at=p_fetched_at,
   next_fetch_at=p_next_fetch_at,error_code=null where key=p_key and lease=p_token;
 return found;
end $$;

create or replace function public.practice_fail_chart(
 p_key text,p_token uuid,p_error text,p_retry_ms bigint
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.practice_chart_cache set payload=null,error_code=left(p_error,64),
   next_fetch_at=floor(extract(epoch from statement_timestamp())*1000)+least(86400000,greatest(300000,p_retry_ms))
 where key=p_key and lease=p_token;
 return found;
end $$;

revoke all on function public.practice_claim_chart(text,bigint),
 public.practice_save_chart(text,uuid,jsonb,bigint,bigint),
 public.practice_fail_chart(text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.practice_claim_chart(text,bigint),
 public.practice_save_chart(text,uuid,jsonb,bigint,bigint),
 public.practice_fail_chart(text,uuid,text,bigint) to service_role;

commit;
