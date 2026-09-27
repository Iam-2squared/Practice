-- Additive progression layer. Existing credentials, balances and ledgers are unchanged.
begin;
create table if not exists public.practice_progress (
 account_id uuid primary key references public.practice_accounts(id) on delete cascade,
 chart_seen boolean not null default false,
 portfolio_seen boolean not null default false,
 unlocked jsonb not null default '{}'::jsonb check (jsonb_typeof(unlocked)='object'),
 selected text[] not null default '{}' check (cardinality(selected)<=3),
 updated_at timestamptz not null default now()
);
create table if not exists public.practice_week_prices (
 week_start bigint not null,
 symbol text not null check(symbol in ('BTC','ETH','SOL','XRP','USDJPY','EURJPY','GBPJPY','AUDJPY')),
 price_minor bigint not null check(price_minor between 1 and 1000000000000),
 price_at bigint not null,
 source text not null,
 granularity text not null,
 recorded_at timestamptz not null default now(),
 primary key(week_start,symbol),
 check(mod(week_start-313200000,604800000)=0),
 check(price_at<=week_start),
 check((symbol in ('BTC','ETH','SOL','XRP') and source='coingecko' and granularity='hourly' and week_start-price_at<=7200000)
    or (symbol in ('USDJPY','EURJPY','GBPJPY','AUDJPY') and source='frankfurter' and granularity='business-daily' and week_start-price_at<=864000000))
);
alter table public.practice_progress enable row level security;
alter table public.practice_week_prices enable row level security;
revoke all on public.practice_progress,public.practice_week_prices from public,anon,authenticated;
grant select,insert,update,delete on public.practice_progress to service_role;
grant select,insert on public.practice_week_prices to service_role;
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
     count(*) filter(where t.trade->>'symbol' in ('BTC','ETH','SOL','XRP')) crypto,
     count(*) filter(where t.trade->>'symbol' in ('USDJPY','EURJPY','GBPJPY','AUDJPY')) fx,
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
 select count(*) filter(where trade->>'symbol' in ('BTC','ETH','SOL','XRP')),count(*) filter(where trade->>'symbol' in ('USDJPY','EURJPY','GBPJPY','AUDJPY')) into c,f from public.practice_asset_trades where account_id=p_account_id;
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
create or replace function public.practice_select_badges(p_account_id uuid,p_selected text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.practice_progress%rowtype; code text;
begin
 if p_selected is null or cardinality(p_selected)>3 or cardinality(p_selected)<>(select count(distinct x) from unnest(p_selected) x) then return jsonb_build_object('ok',false); end if;
 select * into p from public.practice_progress where account_id=p_account_id for update;
 if not found then return jsonb_build_object('ok',false); end if;
 foreach code in array p_selected loop
   if code is null or code not in ('profit1000','profit2000','crypto3','fx3','loss1000','loss2000') or not p.unlocked ? code then return jsonb_build_object('ok',false); end if;
 end loop;
 update public.practice_progress set selected=p_selected,updated_at=now() where account_id=p_account_id;
 return jsonb_build_object('ok',true,'selected',p_selected);
end $$;
revoke all on function public.practice_progress_snapshots(uuid,uuid,bigint),public.practice_progress_observe(uuid,bigint,bigint,text),public.practice_select_badges(uuid,text[]) from public,anon,authenticated;
grant execute on function public.practice_progress_snapshots(uuid,uuid,bigint),public.practice_progress_observe(uuid,bigint,bigint,text),public.practice_select_badges(uuid,text[]) to service_role;
commit;
