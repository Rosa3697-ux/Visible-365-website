-- Additive sandbox-only intake fields; existing accounts remain drafts.
begin;
alter table public.waas_accounts
 add column intake_answers jsonb not null default '{}'::jsonb check(jsonb_typeof(intake_answers)='object' and octet_length(intake_answers::text)<=24000),
 add column intake_brief jsonb check(intake_brief is null or (jsonb_typeof(intake_brief)='object' and octet_length(intake_brief::text)<=32000)),
 add column intake_state text not null default 'draft' check(intake_state in ('draft','submitted')),
 add column intake_revision integer not null default 0 check(intake_revision>=0),
 add column intake_submitted_at timestamptz,
 add constraint waas_intake_submission_consistency check((intake_state='draft' and intake_brief is null and intake_submitted_at is null) or (intake_state='submitted' and intake_brief is not null and intake_submitted_at is not null));
commit;
