-- One-time migration from Japanese equities to the crypto/FX-only Practice market.
begin;
delete from public.practice_trades;
update public.practice_accounts
set market='multi',
    state='{"cashMinor":10000000,"realizedMinor":0,"positions":[],"version":0}'::jsonb;
commit;
