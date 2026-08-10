-- Minimal stand-in for the parts of the LedgerX/Supabase schema that
-- 20260717000000_whatsapp_integration.sql touches, so the migration can be
-- exercised for real on a local Postgres 16.
--
-- Only what the migration reads or writes is modelled. Notably absent:
-- pg_cron and pg_net. That is deliberate — section 10's early-RETURN path is
-- exactly what these tests are here to pin down, since a silent skip there
-- leaves WhatsApp looking installed and sending nothing.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
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

create table household_members (
  user_id      uuid not null,
  household_id uuid not null references households(id) on delete cascade,
  primary key (user_id, household_id)
);

create table user_roles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  is_admin           boolean not null default false,
  is_household_admin boolean not null default false,
  is_contractor      boolean not null default false
);

-- user_profiles WITHOUT notify_channel — the migration adds it, and an
-- ADD COLUMN IF NOT EXISTS that silently no-ops would hide a regression.
create table user_profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text not null,
  preferred_language text
);

-- notifications, as the v11.5 notify_* triggers write it. The whatsapp
-- fan-out trigger hangs off AFTER INSERT here.
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  kind         text not null,
  entity_type  text,
  entity_id    uuid,
  household_id uuid references households(id) on delete set null,
  title        text,
  created_at   timestamptz not null default now()
);
