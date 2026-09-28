-- Additive market expansion, 2026-09-28. Run AFTER progression.sql.
-- No accounts, credentials, balances, positions, history or budget rows are reset.
-- Legacy quote keys remain available to the previous deployment during rollout.
begin;
set local lock_timeout = '5s';

create or replace function public.practice_assets() returns jsonb
language sql immutable security invoker set search_path='' as $$
 select '[{"symbol":"BTC","name":"Bitcoin","type":"crypto","unit":"BTC","step":10,"source":"coingecko"},{"symbol":"ETH","name":"Ethereum","type":"crypto","unit":"ETH","step":100,"source":"coingecko"},{"symbol":"SOL","name":"Solana","type":"crypto","unit":"SOL","step":1000,"source":"coingecko"},{"symbol":"XRP","name":"XRP","type":"crypto","unit":"XRP","step":1000000,"source":"coingecko"},{"symbol":"BNB","name":"BNB","type":"crypto","unit":"BNB","step":1000,"source":"coingecko"},{"symbol":"ADA","name":"Cardano","type":"crypto","unit":"ADA","step":1000000,"source":"coingecko"},{"symbol":"DOGE","name":"Dogecoin","type":"crypto","unit":"DOGE","step":1000000,"source":"coingecko"},{"symbol":"AVAX","name":"Avalanche","type":"crypto","unit":"AVAX","step":10000,"source":"coingecko"},{"symbol":"LINK","name":"Chainlink","type":"crypto","unit":"LINK","step":10000,"source":"coingecko"},{"symbol":"LTC","name":"Litecoin","type":"crypto","unit":"LTC","step":10000,"source":"coingecko"},{"symbol":"USDJPY","name":"米ドル / 円","type":"fx","unit":"USD","step":1000000,"source":"frankfurter"},{"symbol":"EURJPY","name":"ユーロ / 円","type":"fx","unit":"EUR","step":1000000,"source":"frankfurter"},{"symbol":"GBPJPY","name":"英ポンド / 円","type":"fx","unit":"GBP","step":1000000,"source":"frankfurter"},{"symbol":"AUDJPY","name":"豪ドル / 円","type":"fx","unit":"AUD","step":1000000,"source":"frankfurter"},{"symbol":"CADJPY","name":"カナダドル / 円","type":"fx","unit":"CAD","step":1000000,"source":"frankfurter"},{"symbol":"CHFJPY","name":"スイスフラン / 円","type":"fx","unit":"CHF","step":1000000,"source":"frankfurter"},{"symbol":"NZDJPY","name":"NZドル / 円","type":"fx","unit":"NZD","step":1000000,"source":"frankfurter"}]'::jsonb;
$$;
create or replace function public.practice_asset(s text) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select value from jsonb_array_elements(public.practice_assets()) where value->>'symbol'=s;
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
   or jsonb_array_length(s->'positions')>jsonb_array_length(public.practice_assets()) then return false; end if;
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

alter table public.practice_quote_cache drop constraint if exists practice_quote_cache_key_check;
alter table public.practice_quote_cache add constraint practice_quote_cache_key_check
 check(key in ('crypto','fx','crypto-v2','fx-v2'));
create or replace function public.practice_claim_quotes(p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.practice_quote_cache%rowtype; stamp bigint:=floor(extract(epoch from statement_timestamp())*1000);token uuid:=gen_random_uuid();
begin
 if p_key is null or p_key not in ('crypto','fx','crypto-v2','fx-v2') then raise exception 'Invalid cache key';end if;
 insert into public.practice_quote_cache(key) values(p_key) on conflict(key) do nothing;
 select * into strict r from public.practice_quote_cache where key=p_key for update;
 if stamp<r.next_fetch_at then return jsonb_build_object('claimed',false,'cached',jsonb_build_object('payload',r.payload,'fetchedAt',r.fetched_at,'nextFetchAt',r.next_fetch_at,'error',r.error_code));end if;
 update public.practice_quote_cache set lease=token,payload=null,error_code=null,fetched_at=stamp,next_fetch_at=stamp+300000 where key=p_key;
 return jsonb_build_object('claimed',true,'token',token);
end $$;
create or replace function public.practice_save_quotes(p_key text,p_token uuid,p_payload jsonb,p_fetched_at bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare expected_count integer; market_type text; actual_symbols text[]; expected_symbols text[];
begin
 if p_key is null or p_key not in ('crypto','fx','crypto-v2','fx-v2') then raise exception 'Invalid cache key';end if;
 market_type:=split_part(p_key,'-',1);
 if p_key in ('crypto','fx') then expected_count:=4;
 else select count(*),array_agg(value->>'symbol' order by value->>'symbol') into expected_count,expected_symbols
   from jsonb_array_elements(public.practice_assets()) where value->>'type'=market_type;end if;
 if jsonb_typeof(p_payload) is distinct from 'array' or p_fetched_at is null or abs(p_fetched_at-floor(extract(epoch from statement_timestamp())*1000))>60000 then raise exception 'Invalid cache payload';end if;
 if jsonb_array_length(p_payload)<>expected_count then raise exception 'Invalid cache batch size';end if;
 if p_key in ('crypto-v2','fx-v2') then
   select array_agg(value->>'symbol' order by value->>'symbol') into actual_symbols from jsonb_array_elements(p_payload);
   if actual_symbols is distinct from expected_symbols then raise exception 'Invalid cache symbols';end if;
 end if;
 update public.practice_quote_cache set payload=p_payload,fetched_at=p_fetched_at,
 next_fetch_at=p_fetched_at+case when market_type='crypto' then 300000 else 14400000 end,error_code=null
 where key=p_key and lease=p_token;
 return found;
end $$;

create or replace function public.practice_valid_chart_key(k text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(cardinality(string_to_array(k,':'))=3 and split_part(k,':',1)='chart' and
   ((public.practice_asset(split_part(k,':',2))->>'type'='crypto' and split_part(k,':',3) in ('24H','7D','30D','90D','1Y'))
    or (public.practice_asset(split_part(k,':',2))->>'type'='fx' and split_part(k,':',3) in ('7D','1M','3M','1Y','5Y'))),false);
$$;
alter table public.practice_chart_cache drop constraint if exists practice_chart_cache_key_check;
alter table public.practice_chart_cache add constraint practice_chart_cache_key_check check(public.practice_valid_chart_key(key));
create or replace function public.practice_claim_chart(p_key text,p_ttl_ms bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.practice_chart_cache%rowtype;
 stamp bigint:=floor(extract(epoch from statement_timestamp())*1000);
 token uuid:=gen_random_uuid(); budget_key text; budget_count integer; next_month bigint;
begin
 if not public.practice_valid_chart_key(p_key) or p_ttl_ms is null or p_ttl_ms not between 300000 and 86400000 then raise exception 'Invalid chart cache key or TTL';end if;
 insert into public.practice_chart_cache(key) values(p_key) on conflict(key) do nothing;
 select * into strict r from public.practice_chart_cache where key=p_key for update;
 if stamp<r.next_fetch_at then
   return jsonb_build_object('claimed',false,'cached',jsonb_build_object(
     'payload',r.payload,'fetchedAt',r.fetched_at,'nextFetchAt',r.next_fetch_at,'error',r.error_code));
 end if;
 if public.practice_asset(split_part(p_key,':',2))->>'type'='crypto' then
   budget_key:='coingecko-chart:'||to_char(statement_timestamp() at time zone 'UTC','YYYY-MM');
   insert into public.practice_provider_budgets(key,call_count) values(budget_key,1)
   on conflict(key) do update set call_count=public.practice_provider_budgets.call_count+1,updated_at=now()
   where public.practice_provider_budgets.call_count<500 returning call_count into budget_count;
   if budget_count is null then
     next_month:=floor(extract(epoch from ((date_trunc('month',statement_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC'))*1000);
     update public.practice_chart_cache set payload=null,error_code='CHART_BUDGET',fetched_at=stamp,next_fetch_at=next_month where key=p_key;
     return jsonb_build_object('claimed',false,'cached',jsonb_build_object('payload',null,'fetchedAt',stamp,'nextFetchAt',next_month,'error','CHART_BUDGET'));
   end if;
 end if;
 update public.practice_chart_cache set lease=token,payload=null,error_code=null,fetched_at=stamp,next_fetch_at=stamp+p_ttl_ms where key=p_key;
 return jsonb_build_object('claimed',true,'token',token);
end $$;

alter table public.practice_comments drop constraint if exists practice_comments_room_check;
alter table public.practice_comments add constraint practice_comments_room_check
 check(room='GENERAL' or public.practice_asset(room) is not null);
alter table public.practice_week_prices drop constraint if exists practice_week_prices_symbol_check;
alter table public.practice_week_prices add constraint practice_week_prices_symbol_check
 check(public.practice_asset(symbol) is not null);
alter table public.practice_week_prices drop constraint if exists practice_week_prices_check1;
alter table public.practice_week_prices add constraint practice_week_prices_check1
 check((public.practice_asset(symbol)->>'type'='crypto' and source='coingecko' and granularity='hourly' and week_start-price_at<=7200000)
    or (public.practice_asset(symbol)->>'type'='fx' and source='frankfurter' and granularity='business-daily' and week_start-price_at<=864000000));

create or replace function public.practice_progress_snapshots(p_account_id uuid,p_after uuid,p_week_start bigint)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
   'account',jsonb_build_object('id',a.id,'username',a.username,'market','multi','state',w.state,'createdAt',floor(extract(epoch from a.created_at)*1000)),
   'walletCreatedAt',floor(extract(epoch from w.created_at)*1000),
   'buyCount',s.buys,'sellCount',s.sells,'cryptoCount',s.crypto,'fxCount',s.fx,
   'weekBuyMinor',s.week_buys,'weekSellMinor',s.week_sells,'weekDeltas',d.deltas,
   'progress',jsonb_build_object('unlocked',coalesce(p.unlocked,'{}'::jsonb),'selected',coalesce(p.selected,'{}'::text[]),'chartSeen',coalesce(p.chart_seen,false),'portfolioSeen',coalesce(p.portfolio_seen,false)))
 from public.practice_accounts a
 join public.practice_wallets w on w.account_id=a.id
 left join public.practice_progress p on p.account_id=a.id
 cross join lateral (
   select count(*) filter(where t.trade->>'side'='buy') buys,
     count(*) filter(where t.trade->>'side'='sell') sells,
     count(*) filter(where public.practice_asset(t.trade->>'symbol')->>'type'='crypto') crypto,
     count(*) filter(where public.practice_asset(t.trade->>'symbol')->>'type'='fx') fx,
     coalesce(sum((t.trade->>'totalMinor')::numeric) filter(where t.trade->>'side'='buy' and t.created_at>=to_timestamp(p_week_start/1000.0)),0) week_buys,
     coalesce(sum((t.trade->>'totalMinor')::numeric) filter(where t.trade->>'side'='sell' and t.created_at>=to_timestamp(p_week_start/1000.0)),0) week_sells
   from public.practice_asset_trades t where t.account_id=a.id
 ) s
 cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object('symbol',z.symbol,'quantity',z.quantity)),'[]'::jsonb) deltas from (
     select t.trade->>'symbol' symbol,sum((t.trade->>'quantity')::numeric*case when t.trade->>'side'='buy' then 1 else -1 end) quantity
     from public.practice_asset_trades t where t.account_id=a.id and t.created_at>=to_timestamp(p_week_start/1000.0) group by t.trade->>'symbol'
   ) z
 ) d
 where (p_account_id is null or a.id=p_account_id) and (p_after is null or a.id>p_after)
 order by a.id limit 500;
$$;
create or replace function public.practice_progress_observe(p_account_id uuid,p_version bigint,p_total_minor bigint,p_event text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.practice_wallets%rowtype; p public.practice_progress%rowtype; c bigint; f bigint; pnl bigint; ts bigint; code text; matches boolean; earned_data jsonb;
begin
 if p_event is null or p_event not in ('','chart','portfolio') then raise exception 'Invalid progress event'; end if;
 if p_total_minor is not null and (p_total_minor<0 or p_total_minor>9000000000000) then raise exception 'Invalid valuation'; end if;
 select * into strict w from public.practice_wallets where account_id=p_account_id for share;
 insert into public.practice_progress(account_id) values(p_account_id) on conflict(account_id) do nothing;
 select * into strict p from public.practice_progress where account_id=p_account_id for update;
 select count(*) filter(where public.practice_asset(trade->>'symbol')->>'type'='crypto'),count(*) filter(where public.practice_asset(trade->>'symbol')->>'type'='fx') into c,f from public.practice_asset_trades where account_id=p_account_id;
 if (w.state->>'version')::bigint=p_version and p_total_minor is not null then pnl:=p_total_minor-10000000; end if;
 ts:=floor(extract(epoch from statement_timestamp())*1000);earned_data:=p.unlocked;
 foreach code in array array['profit1000','profit2000','crypto3','fx3','loss1000','loss2000'] loop
   matches:=case code when 'profit1000' then pnl>=100000 when 'profit2000' then pnl>=200000 when 'crypto3' then c>=3 when 'fx3' then f>=3 when 'loss1000' then pnl<=-100000 when 'loss2000' then pnl<=-200000 end;
   if matches and not earned_data ? code then earned_data:=earned_data||jsonb_build_object(code,ts); end if;
 end loop;
 if p.unlocked is distinct from earned_data or (p_event='chart' and not p.chart_seen) or (p_event='portfolio' and pnl is not null and not p.portfolio_seen) then
   update public.practice_progress set unlocked=earned_data,chart_seen=chart_seen or p_event='chart',portfolio_seen=portfolio_seen or (p_event='portfolio' and pnl is not null),updated_at=now() where account_id=p_account_id returning * into p;
 end if;
 return jsonb_build_object('unlocked',p.unlocked,'selected',p.selected,'chartSeen',p.chart_seen,'portfolioSeen',p.portfolio_seen);
end $$;

revoke all on function public.practice_assets(),public.practice_asset(text),public.practice_valid_asset_state(jsonb),public.practice_valid_chart_key(text),public.practice_claim_quotes(text),public.practice_save_quotes(text,uuid,jsonb,bigint),public.practice_claim_chart(text,bigint),public.practice_progress_snapshots(uuid,uuid,bigint),public.practice_progress_observe(uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.practice_assets(),public.practice_asset(text),public.practice_valid_asset_state(jsonb),public.practice_valid_chart_key(text),public.practice_claim_quotes(text),public.practice_save_quotes(text,uuid,jsonb,bigint),public.practice_claim_chart(text,bigint),public.practice_progress_snapshots(uuid,uuid,bigint),public.practice_progress_observe(uuid,bigint,bigint,text) to service_role;
commit;
