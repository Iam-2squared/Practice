-- Additive v0.4 migration. Old balances, positions, credentials and trades are NOT deleted or rewritten.
-- Crypto/FX gets its own JPY 100,000 practice wallet on the same account identity.
begin;
create or replace function public.practice_asset(s text) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select value from jsonb_array_elements('[
 {"symbol":"BTC","name":"Bitcoin","type":"crypto","unit":"BTC","step":10,"source":"coingecko"},
 {"symbol":"ETH","name":"Ethereum","type":"crypto","unit":"ETH","step":100,"source":"coingecko"},
 {"symbol":"SOL","name":"Solana","type":"crypto","unit":"SOL","step":1000,"source":"coingecko"},
 {"symbol":"XRP","name":"XRP","type":"crypto","unit":"XRP","step":1000000,"source":"coingecko"},
 {"symbol":"USDJPY","name":"米ドル / 円","type":"fx","unit":"USD","step":1000000,"source":"frankfurter"},
 {"symbol":"EURJPY","name":"ユーロ / 円","type":"fx","unit":"EUR","step":1000000,"source":"frankfurter"},
 {"symbol":"GBPJPY","name":"英ポンド / 円","type":"fx","unit":"GBP","step":1000000,"source":"frankfurter"},
 {"symbol":"AUDJPY","name":"豪ドル / 円","type":"fx","unit":"AUD","step":1000000,"source":"frankfurter"}
 ]'::jsonb) where value->>'symbol'=s;
$$;
create or replace function public.practice_valid_asset_state(s jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb; a jsonb; seen text[]:='{}';
begin
 if (jsonb_typeof(s)='object' and s ?& array['cashMinor','realizedMinor','version','positions']
   and jsonb_typeof(s->'cashMinor')='number' and jsonb_typeof(s->'realizedMinor')='number'
   and jsonb_typeof(s->'version')='number' and jsonb_typeof(s->'positions')='array') is not true then return false; end if;
 if (s->>'cashMinor')::numeric not between 0 and 1000000000000 or (s->>'cashMinor')::numeric<>trunc((s->>'cashMinor')::numeric)
   or abs((s->>'realizedMinor')::numeric)>9007199254740991 or (s->>'realizedMinor')::numeric<>trunc((s->>'realizedMinor')::numeric)
   or (s->>'version')::numeric not between 0 and 9007199254740991 or (s->>'version')::numeric<>trunc((s->>'version')::numeric)
   or jsonb_array_length(s->'positions')>8 then return false; end if;
 for p in select value from jsonb_array_elements(s->'positions') loop
   a:=public.practice_asset(p->>'symbol');
   if (a is not null and jsonb_typeof(p)='object' and p ?& array['symbol','name','type','unit','quantity','costMinor']
      and p->>'name'=a->>'name' and p->>'unit'=a->>'unit' and p->>'type'=a->>'type'
      and jsonb_typeof(p->'quantity')='number' and jsonb_typeof(p->'costMinor')='number') is not true then return false; end if;
   if (p->>'quantity')::numeric not between 1 and 1000000000000 or mod((p->>'quantity')::numeric,(a->>'step')::numeric)<>0
      or (p->>'costMinor')::numeric not between 0 and 1000000000000 or (p->>'costMinor')::numeric<>trunc((p->>'costMinor')::numeric)
      or p->>'symbol'=any(seen) then return false; end if;
   seen:=array_append(seen,p->>'symbol');
 end loop;
 return true;
exception when others then return false;
end $$;
alter table public.practice_accounts drop constraint if exists practice_accounts_market_check;
alter table public.practice_accounts add constraint practice_accounts_market_check check(market in ('demo','yahoo','multi'));
create table if not exists public.practice_wallets(
 account_id uuid primary key references public.practice_accounts(id) on delete cascade,
 state jsonb not null default '{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}'::jsonb check(public.practice_valid_asset_state(state)),
 created_at timestamptz not null default now()
);
create table if not exists public.practice_asset_trades(
 sequence bigint generated always as identity primary key,
 account_id uuid not null references public.practice_wallets(account_id) on delete cascade,
 request_id uuid not null, fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 trade jsonb not null check(jsonb_typeof(trade)='object'), created_at timestamptz not null default now(),
 unique(account_id,request_id)
);
create index if not exists practice_asset_trades_account on public.practice_asset_trades(account_id,sequence desc);
create table if not exists public.practice_quote_cache(
 key text primary key check(key in ('crypto','fx')), payload jsonb, fetched_at bigint not null default 0,
 next_fetch_at bigint not null default 0, lease uuid, error_code text
);
alter table public.practice_wallets enable row level security;
alter table public.practice_asset_trades enable row level security;
alter table public.practice_quote_cache enable row level security;
revoke all on public.practice_wallets,public.practice_asset_trades,public.practice_quote_cache from public,anon,authenticated;
grant select,insert,update,delete on public.practice_wallets,public.practice_asset_trades,public.practice_quote_cache to service_role;
revoke all on sequence public.practice_asset_trades_sequence_seq from public,anon,authenticated;
grant usage,select on sequence public.practice_asset_trades_sequence_seq to service_role;
create or replace function public.practice_init_wallet() returns trigger language plpgsql security invoker set search_path='' as $$
begin insert into public.practice_wallets(account_id) values(new.id);return new;end $$;
drop trigger if exists practice_init_wallet on public.practice_accounts;
create trigger practice_init_wallet after insert on public.practice_accounts for each row execute function public.practice_init_wallet();
insert into public.practice_wallets(account_id) select id from public.practice_accounts on conflict(account_id) do nothing;
create or replace function public.practice_commit_asset_trade(p_account_id uuid,p_expected_version bigint,p_state jsonb,p_trade jsonb,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.practice_wallets%rowtype; old public.practice_asset_trades%rowtype; a jsonb; positions jsonb; position jsonb; expected jsonb;
 idx integer; qty numeric; price numeric; total numeric; cash numeric; realized numeric:=0; basis numeric; stamp numeric;
begin
 select * into strict w from public.practice_wallets where account_id=p_account_id for update;
 select * into old from public.practice_asset_trades where account_id=p_account_id and request_id=(p_trade->>'requestId')::uuid;
 if found then
  if old.fingerprint is distinct from p_fingerprint then return jsonb_build_object('idempotencyConflict',true);end if;
  return jsonb_build_object('duplicate',true,'state',w.state,'trade',old.trade);
 end if;
 if (w.state->>'version')::bigint<>p_expected_version then return jsonb_build_object('conflict',true);end if;
 a:=public.practice_asset(p_trade->>'symbol');stamp:=floor(extract(epoch from statement_timestamp())*1000);
 if (jsonb_typeof(p_trade)='object' and a is not null and p_trade ?& array['requestId','symbol','name','type','unit','side','quantity','quantityScale','priceMinor','totalMinor','cashAfterMinor','realizedMinor','source','quoteAt','quoteDate','executedAt']
    and p_trade->>'requestId'~'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and p_trade->>'side' in ('buy','sell') and p_trade->>'source'=a->>'source' and p_trade->>'type'=a->>'type' and p_trade->>'unit'=a->>'unit' and p_trade->>'name'=a->>'name'
    and p_trade->'quantityScale'='1000000'::jsonb and jsonb_typeof(p_trade->'quantity')='number' and jsonb_typeof(p_trade->'priceMinor')='number'
    and jsonb_typeof(p_trade->'totalMinor')='number' and jsonb_typeof(p_trade->'cashAfterMinor')='number' and jsonb_typeof(p_trade->'realizedMinor')='number'
    and jsonb_typeof(p_trade->'executedAt')='number' and abs((p_trade->>'executedAt')::numeric-stamp)<=60000
    and p_fingerprint~'^[a-f0-9]{64}$' and public.practice_valid_asset_state(p_state)) is not true then raise exception 'Invalid asset trade' using errcode='23514';end if;
 if a->>'type'='crypto' then
   if (jsonb_typeof(p_trade->'quoteAt')='number' and (p_trade->>'quoteAt')::numeric between stamp-900000 and stamp+30000) is not true then raise exception 'Stale crypto quote' using errcode='23514';end if;
 else
   if (p_trade->'quoteAt'='null'::jsonb and p_trade->>'quoteDate'~'^\d{4}-\d{2}-\d{2}$'
      and (p_trade->>'quoteDate')::date between current_date-10 and current_date) is not true then raise exception 'Invalid daily FX date' using errcode='23514';end if;
 end if;
 qty:=(p_trade->>'quantity')::numeric;price:=(p_trade->>'priceMinor')::numeric;
 total:=case when p_trade->>'side'='buy' then ceil(qty*price/1000000) else floor(qty*price/1000000) end;
 if qty not between 1 and 1000000000000 or mod(qty,(a->>'step')::numeric)<>0 or price not between 1 and 1000000000000 or price<>trunc(price)
   or total not between 1 and 1000000000000 or total<>(p_trade->>'totalMinor')::numeric then raise exception 'Invalid amount or step' using errcode='23514';end if;
 positions:=w.state->'positions';cash:=(w.state->>'cashMinor')::numeric;
 select (ordinality-1)::integer,value into idx,position from jsonb_array_elements(positions) with ordinality where value->>'symbol'=a->>'symbol';
 if p_trade->>'side'='buy' then
   if cash<total then raise exception 'Insufficient cash' using errcode='23514';end if;cash:=cash-total;
   if idx is null then positions:=positions||jsonb_build_array(jsonb_build_object('symbol',a->>'symbol','name',a->>'name','type',a->>'type','unit',a->>'unit','quantity',qty,'costMinor',total));
   else position:=position||jsonb_build_object('quantity',(position->>'quantity')::numeric+qty,'costMinor',(position->>'costMinor')::numeric+total);positions:=jsonb_set(positions,array[idx::text],position);end if;
 else
   if idx is null or (position->>'quantity')::numeric<qty then raise exception 'Insufficient quantity' using errcode='23514';end if;
   basis:=floor((position->>'costMinor')::numeric*qty/(position->>'quantity')::numeric);realized:=total-basis;cash:=cash+total;
   if (position->>'quantity')::numeric=qty then positions:=positions-idx;
   else position:=position||jsonb_build_object('quantity',(position->>'quantity')::numeric-qty,'costMinor',(position->>'costMinor')::numeric-basis);positions:=jsonb_set(positions,array[idx::text],position);end if;
 end if;
 expected:=jsonb_build_object('cashMinor',cash,'realizedMinor',(w.state->>'realizedMinor')::numeric+realized,'positions',positions,'version',p_expected_version+1);
 if expected is distinct from p_state or not public.practice_valid_asset_state(expected) or (p_trade->>'cashAfterMinor')::numeric<>cash or (p_trade->>'realizedMinor')::numeric<>realized then raise exception 'State transition mismatch' using errcode='23514';end if;
 update public.practice_wallets set state=expected where account_id=p_account_id;
 insert into public.practice_asset_trades(account_id,request_id,fingerprint,trade) values(p_account_id,(p_trade->>'requestId')::uuid,p_fingerprint,p_trade);
 return jsonb_build_object('duplicate',false,'state',expected,'trade',p_trade);
end $$;
create or replace function public.practice_asset_history(p_account_id uuid,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb; items jsonb;
begin
 if p_offset not between 0 and 1000000 or p_limit not between 1 and 50 then raise exception 'Invalid page';end if;
 select coalesce(jsonb_agg(x.t order by x.ts desc,x.kind desc,x.sequence desc),'[]'::jsonb) into rows from (
   select * from (
    select trade||'{"legacy":false}'::jsonb as t,created_at as ts,1 as kind,sequence from public.practice_asset_trades where account_id=p_account_id
    union all
    select trade||'{"legacy":true,"quantityScale":1}'::jsonb,created_at,0,sequence from public.practice_trades where account_id=p_account_id
   ) merged order by ts desc,kind desc,sequence desc limit p_limit+1 offset p_offset
 ) x;
 select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into items from jsonb_array_elements(rows) with ordinality where ordinality<=p_limit;
 return jsonb_build_object('items',items,'hasMore',jsonb_array_length(rows)>p_limit);
end $$;
create or replace function public.practice_claim_quotes(p_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.practice_quote_cache%rowtype; stamp bigint:=floor(extract(epoch from statement_timestamp())*1000);token uuid:=gen_random_uuid();
begin
 if p_key not in ('crypto','fx') then raise exception 'Invalid cache key';end if;
 insert into public.practice_quote_cache(key) values(p_key) on conflict(key) do nothing;
 select * into strict r from public.practice_quote_cache where key=p_key for update;
 if stamp<r.next_fetch_at then return jsonb_build_object('claimed',false,'cached',jsonb_build_object('payload',r.payload,'fetchedAt',r.fetched_at,'nextFetchAt',r.next_fetch_at,'error',r.error_code));end if;
 update public.practice_quote_cache set lease=token,payload=null,error_code=null,fetched_at=stamp,next_fetch_at=stamp+300000 where key=p_key;
 return jsonb_build_object('claimed',true,'token',token);
end $$;
create or replace function public.practice_save_quotes(p_key text,p_token uuid,p_payload jsonb,p_fetched_at bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_payload)<>'array' or jsonb_array_length(p_payload)<>4 or abs(p_fetched_at-floor(extract(epoch from statement_timestamp())*1000))>60000 then raise exception 'Invalid cache payload';end if;
 update public.practice_quote_cache set payload=p_payload,fetched_at=p_fetched_at,next_fetch_at=p_fetched_at+case when p_key='crypto' then 300000 else 14400000 end,error_code=null where key=p_key and lease=p_token;
 return found;
end $$;
create or replace function public.practice_fail_quotes(p_key text,p_token uuid,p_error text,p_retry_ms bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.practice_quote_cache set payload=null,error_code=left(p_error,64),next_fetch_at=floor(extract(epoch from statement_timestamp())*1000)+least(86400000,greatest(300000,p_retry_ms)) where key=p_key and lease=p_token;
 return found;
end $$;
revoke all on function public.practice_asset(text),public.practice_valid_asset_state(jsonb),public.practice_init_wallet(),public.practice_commit_asset_trade(uuid,bigint,jsonb,jsonb,text),public.practice_asset_history(uuid,integer,integer),public.practice_claim_quotes(text),public.practice_save_quotes(text,uuid,jsonb,bigint),public.practice_fail_quotes(text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.practice_asset(text),public.practice_valid_asset_state(jsonb),public.practice_init_wallet(),public.practice_commit_asset_trade(uuid,bigint,jsonb,jsonb,text),public.practice_asset_history(uuid,integer,integer),public.practice_claim_quotes(text),public.practice_save_quotes(text,uuid,jsonb,bigint),public.practice_fail_quotes(text,uuid,text,bigint) to service_role;
commit;
