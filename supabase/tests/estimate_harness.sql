-- Minimal stand-in for the parts of the LedgerX/Supabase schema that
-- 20260803000000_estimate_completion_and_links.sql touches, so the
-- migration and its RPCs can be exercised for real on a local Postgres.
--
-- Only the columns the migration reads or writes are modelled. Column
-- types match the real DDL where the test depends on them (notably the
-- estimates status CHECK and contractor_invoices.invoice_number, which
-- the link listing reads).

-- Supabase provides these roles; a bare Postgres does not.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

create schema if not exists auth;

create table auth.users (id uuid primary key);

-- auth.uid() / is_admin() stubs the tests drive directly.
create table _test_ctx (uid uuid, admin boolean);
insert into _test_ctx values (null, true);

create or replace function auth.uid() returns uuid
language sql stable as $$ select uid from _test_ctx limit 1 $$;

create or replace function is_admin() returns boolean
language sql stable as $$ select coalesce((select admin from _test_ctx limit 1), false) $$;

create table households (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete set null,
  created_by   uuid,
  expense_date date not null,
  vendor       text,
  total        numeric(12,2) not null default 0,
  currency     text not null default 'USD',
  category     text,
  notes        text
);

create table contractor_invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text not null,
  created_by         uuid,
  household_id       uuid references households(id) on delete set null,
  amount             numeric(12,2) not null check (amount >= 0),
  currency           text not null default 'USD',
  description        text not null,
  service_date_start date not null,
  service_date_end   date not null,
  status             text not null default 'pending',
  paid_at            timestamptz
);

-- estimates, as created by 20260701000000 + the billing_type column from
-- 20260703000000. The migration under test alters the status CHECK and
-- adds amount/currency, so this must start WITHOUT them.
create table estimates (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null,
  household_id uuid references households(id) on delete set null,
  title        text not null,
  description  text,
  status       text not null default 'open'
               constraint estimates_status_check
               check (status in ('open', 'accepted', 'rejected')),
  admin_notes  text,
  billing_type text not null default 'total'
               check (billing_type in ('total', 'labor_only')),
  file_path    text,
  file_mime    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The pre-existing 6-arg signature, so the migration's DROP FUNCTION has
-- something real to remove (proving the overload gotcha is handled).
create or replace function admin_update_estimate(
  p_estimate_id  uuid,
  p_title        text,
  p_description  text,
  p_billing_type text,
  p_household_id uuid,
  p_admin_notes  text
) returns void language plpgsql as $$
begin
  raise exception 'stale 6-arg overload should have been dropped';
end;
$$;

-- Test helper.
create or replace function assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
end;
$$;
