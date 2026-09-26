-- Read-only verification. Every table must show rls=true and anon_select=false.
select c.relname as table_name,c.relrowsecurity as rls,
 has_table_privilege('anon',c.oid,'select') as anon_select,
 has_table_privilege('authenticated',c.oid,'update') as authenticated_update,
 has_table_privilege('service_role',c.oid,'select') as server_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('practice_accounts','practice_sessions','practice_trades','practice_rate_buckets');
select p.proname,p.prosecdef as security_definer,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('service_role',p.oid,'execute') as server_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('practice_commit_trade','practice_rate_limit');
