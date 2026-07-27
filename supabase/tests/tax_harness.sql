-- Minimal stand-in for the parts of the LedgerX/Supabase schema the tax
-- migration touches, so the migration + RPCs can be exercised for real.

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (id uuid primary key);

create table storage.buckets (
  id text primary key, name text, public boolean
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text
);
alter table storage.objects enable row level security;

-- auth.uid() / is_admin() stubs we can drive from tests
create table _test_ctx (uid uuid, admin boolean);
insert into _test_ctx values (null, true);

create or replace function auth.uid() returns uuid
language sql stable as $$ select uid from _test_ctx limit 1 $$;

create or replace function is_admin() returns boolean
language sql stable as $$ select coalesce((select admin from _test_ctx limit 1), false) $$;

-- App tables (only the columns the migration/RPCs use)
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table user_profiles (
  id uuid primary key,
  username text
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  is_admin boolean default false,
  is_contractor boolean default false,
  is_household_admin boolean default false
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  household_id uuid
);

create table vendor_category_map (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  vendor_name text,
  category_name text
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  created_by uuid,
  expense_date date not null,
  vendor text,
  total numeric not null default 0,
  currency text default 'USD',
  category text,
  notes text
);

create table contractor_invoices (
  id uuid primary key default gen_random_uuid(),
  created_by uuid,
  household_id uuid,
  amount numeric not null,
  currency text default 'USD',
  description text,
  service_date_start date,
  service_date_end date,
  status text default 'pending',
  paid_at timestamptz,
  category_id uuid,
  payment_method text
);
