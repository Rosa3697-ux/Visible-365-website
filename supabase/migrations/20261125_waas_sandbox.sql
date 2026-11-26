-- V13-V16, fresh dedicated Supabase sandbox only. Review before applying.
begin;
create table public.waas_accounts (
 user_id uuid primary key references auth.users(id) on delete restrict,
 business_name text not null check(char_length(business_name) between 1 and 120),
 language text not null check(language in ('en','es')),
 industry text not null check(char_length(industry)<=80),
 website text not null default '' check(char_length(website)<=300),
 notes text not null default '' check(char_length(notes)<=3000),
 created_at timestamptz not null default now()
);
create table public.waas_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.waas_accounts(user_id),
 plan text not null check(plan in ('essential','growth')),
 stage text not null default 'requested' check(stage in ('requested','approved','checkout_pending','active','payment_issue','canceled')),
 scope text not null default '' check(char_length(scope)<=5000),
 terms_version text,
 accepted_at timestamptz,
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 stripe_session_id text unique,
 stripe_status text,
 last_event_created bigint not null default 0,
 created_at timestamptz not null default now()
);
create table public.waas_projects (
 user_id uuid primary key references public.waas_accounts(user_id),
 stage text not null default 'onboarding' check(stage in ('onboarding','design','review','approved','domain','live')),
 preview_url text check(preview_url is null or preview_url like 'https://%'),
 live_url text check(live_url is null or live_url like 'https://%'),
 updated_at timestamptz not null default now()
);
create table public.waas_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.waas_accounts(user_id),
 category text not null check(category in ('content','photos','support','other')),
 details text not null check(char_length(details) between 1 and 3000),
 status text not null default 'new' check(status in ('new','in_progress','done')),
 minutes integer not null default 0 check(minutes between 0 and 6000),
 reply text not null default '' check(char_length(reply)<=3000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.waas_webhook_events (id text primary key, created_at timestamptz not null default now());
create table public.waas_audit (id bigint generated always as identity primary key, actor uuid, action text not null, subject uuid, created_at timestamptz not null default now());
alter table public.waas_accounts enable row level security;
alter table public.waas_orders enable row level security;
alter table public.waas_projects enable row level security;
alter table public.waas_requests enable row level security;
alter table public.waas_webhook_events enable row level security;
alter table public.waas_audit enable row level security;
-- All access through the authenticated server API; deny direct client writes/reads.
revoke all on public.waas_accounts,public.waas_orders,public.waas_projects,public.waas_requests,public.waas_webhook_events,public.waas_audit from anon,authenticated;
grant all on public.waas_accounts,public.waas_orders,public.waas_projects,public.waas_requests,public.waas_webhook_events,public.waas_audit to service_role;
grant usage,select on sequence public.waas_audit_id_seq to service_role;
create or replace function public.waas_signup(p_user uuid,p_business text,p_language text,p_industry text,p_website text,p_notes text,p_plan text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare oid uuid;
begin
 insert into public.waas_accounts(user_id,business_name,language,industry,website,notes) values(p_user,p_business,p_language,p_industry,p_website,p_notes) on conflict(user_id) do nothing;
 insert into public.waas_orders(user_id,plan) values(p_user,p_plan) on conflict(user_id) do nothing;
 insert into public.waas_projects(user_id) values(p_user) on conflict(user_id) do nothing;
 select id into oid from public.waas_orders where user_id=p_user;
 return oid;
end;$$;
revoke all on function public.waas_signup(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.waas_signup(uuid,text,text,text,text,text,text) to service_role;
create or replace function public.waas_apply_event(p_event text,p_created bigint,p_order uuid,p_customer text,p_subscription text,p_status text,p_stage text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.waas_orders%rowtype;
begin
 select * into o from public.waas_orders where id=p_order for update;
 if not found or o.stripe_customer_id is distinct from p_customer or (o.stripe_subscription_id is not null and o.stripe_subscription_id is distinct from p_subscription) then raise exception 'Order mapping mismatch'; end if;
 insert into public.waas_webhook_events(id) values(p_event) on conflict do nothing;
 if not found then return false; end if;
 if p_created>=o.last_event_created then
 update public.waas_orders set stripe_subscription_id=p_subscription,stripe_status=p_status,stage=p_stage,last_event_created=p_created where id=p_order;
 end if;
 return true;
end;$$;
revoke all on function public.waas_apply_event(text,bigint,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.waas_apply_event(text,bigint,uuid,text,text,text,text) to service_role;
-- Private assets: defer upload/download activation until malware scanning and retention are tested.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('waas-private','waas-private',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
-- No client storage policies by design. 
commit;
