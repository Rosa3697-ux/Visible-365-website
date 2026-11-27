begin;
do $$
declare en_id uuid:=gen_random_uuid(); es_id uuid:=gen_random_uuid(); account_id uuid; lang text; role_name text; rel text;
begin
foreach account_id in array array[en_id,es_id] loop
 lang:=case when account_id=en_id then 'en' else 'es' end;
 insert into auth.users(id,email) values(account_id, account_id::text||'@example.invalid');
 perform public.waas_signup(account_id,'Fictional QA '||lang,lang,'Cleaning','','','essential');
 if not exists(select from public.waas_accounts a join public.waas_projects p using(user_id) join public.waas_orders o using(user_id) where a.user_id=account_id and a.language=lang and a.intake_state='draft') then raise exception 'Missing onboarding data'; end if;
end loop;
foreach role_name in array array['anon','authenticated'] loop
 foreach rel in array array['waas_accounts','waas_orders','waas_projects','waas_requests','waas_audit'] loop
 if has_table_privilege(role_name,'public.'||rel,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Unexpected direct access: % %',role_name,rel; end if; end loop;
 if has_function_privilege(role_name,'public.waas_signup(uuid,text,text,text,text,text,text)','execute') then raise exception 'Unexpected signup RPC grant'; end if;
end loop;
end $$;
select 'two customer signups, linked storage, English and Spanish, direct-role isolation passed' as checks;
rollback;
