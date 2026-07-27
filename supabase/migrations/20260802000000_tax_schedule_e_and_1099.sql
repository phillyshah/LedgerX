-- Tax features: Schedule E classification + 1099-NEC readiness (v13.15)
--
-- Both features are FULL ADMIN ONLY. Every RPC below re-checks is_admin();
-- the client-side gate in AdminLayout is convenience, this is the boundary.
--
-- Design notes that aren't obvious from the DDL — see
-- .claude/SPEC-tax-features.md for the full rationale:
--
--  * NOTHING here stores a TIN, an SSN, or any document containing one.
--    The owner's accountant does the actual 1099 filing and holds the W-9s.
--    This app only answers "who crossed the threshold, and have we collected
--    their W-9 yet" — so it keeps a legal name, an entity type (those two
--    decide whether a 1099 is required at all), and a date. No documents, no
--    addresses, no identifiers.
--  * Thresholds live in tax_settings, not in code. The 1099 threshold rose
--    from $600 to $2,000 for payments after 2025-12-31 and is now indexed
--    for inflation, so it will keep moving.
--  * expenses.category is free text while contractor_invoices.category_id is
--    a real FK. The Schedule E rollup therefore joins expenses by normalized
--    NAME and invoices by ID. Getting this wrong yields two different totals.
--  * Cash basis throughout: expenses use expense_date, invoices use paid_at
--    (not service dates), so work done in December but paid in January lands
--    in the correct — later — tax year.

-- ── Enums ────────────────────────────────────────────────────────────────

-- The 15 expense lines of Schedule E Part I (Form 1040). Form 8825, used by
-- multi-member LLCs, has near-identical lines, so one mapping drives both.
do $$ begin
  create type schedule_e_line as enum (
    'advertising','auto_travel','cleaning_maintenance','commissions',
    'insurance','legal_professional','management_fees','mortgage_interest',
    'other_interest','repairs','supplies','taxes','utilities',
    'depreciation','other'
  );
exception when duplicate_object then null; end $$;

-- Currently-deductible repair vs. capitalize-and-depreciate improvement.
-- NULL means "not yet reviewed" and is what the review queue selects on.
do $$ begin
  create type capital_treatment as enum ('repair','improvement');
exception when duplicate_object then null; end $$;

-- Drives 1099 exemption: corporations are generally exempt.
do $$ begin
  create type tax_entity_type as enum (
    'individual','sole_prop','partnership','c_corp','s_corp','llc','other'
  );
exception when duplicate_object then null; end $$;

-- ── Category → Schedule E line mapping ───────────────────────────────────

alter table categories
  add column if not exists schedule_e_line schedule_e_line;

comment on column categories.schedule_e_line is
  'Schedule E Part I / Form 8825 expense line this category rolls up to. '
  'Mapped once by a full admin; every expense then classifies itself.';

-- ── Per-transaction capital treatment ────────────────────────────────────

alter table expenses
  add column if not exists capital_treatment   capital_treatment,
  add column if not exists capital_reviewed_at timestamptz,
  add column if not exists capital_reviewed_by uuid references auth.users(id) on delete set null;

alter table contractor_invoices
  add column if not exists capital_treatment   capital_treatment,
  add column if not exists capital_reviewed_at timestamptz,
  add column if not exists capital_reviewed_by uuid references auth.users(id) on delete set null;

-- Partial indexes: the review queue only ever asks for un-reviewed rows, so
-- indexing the NULLs keeps that scan small even as reviewed history grows.
create index if not exists expenses_capital_unreviewed_idx
  on expenses (expense_date) where capital_treatment is null;

create index if not exists contractor_invoices_capital_unreviewed_idx
  on contractor_invoices (paid_at) where capital_treatment is null;

-- ── Tax settings (singleton) ─────────────────────────────────────────────

create table if not exists tax_settings (
  id                     int primary key default 1 check (id = 1),
  -- $2,500 without an applicable financial statement (the LLC's situation).
  -- $5,000 only applies to taxpayers with audited financials.
  de_minimis_threshold   numeric(12,2) not null default 2500.00,
  -- $600 through tax year 2025; $2,000 for payments after 2025-12-31,
  -- inflation-indexed thereafter. Config, never a constant.
  form_1099_threshold    numeric(12,2) not null default 2000.00,
  updated_at             timestamptz   not null default now(),
  updated_by             uuid references auth.users(id) on delete set null
);

insert into tax_settings (id) values (1) on conflict (id) do nothing;

alter table tax_settings enable row level security;

drop policy if exists "tax_settings admin read"  on tax_settings;
drop policy if exists "tax_settings admin write" on tax_settings;

create policy "tax_settings admin read"
  on tax_settings for select to authenticated using (is_admin());

create policy "tax_settings admin write"
  on tax_settings for update to authenticated using (is_admin()) with check (is_admin());

-- ── Contractor tax profiles (1099 status tracking) ───────────────────────
--
-- Deliberately minimal. The accountant files the 1099s and holds the W-9s;
-- this table exists only so the app can answer "who crossed the threshold,
-- and have we collected their W-9 yet". It therefore stores:
--
--   legal_name / entity_type  -> decide whether a 1099 is required at all
--   w9_received_at            -> a date, meaning "collected, filed elsewhere"
--   is_exempt_payee / notes   -> manual overrides and free text
--
-- It stores NO TIN, NO SSN, NO address, and NO uploaded document. A signed
-- W-9 has the TIN printed on it, so keeping the file would be keeping the
-- number — the whole point is that neither lives here.

create table if not exists contractor_tax_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  legal_name       text,
  entity_type      tax_entity_type,
  w9_received_at   date,
  is_exempt_payee  boolean not null default false,
  notes            text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);

comment on table contractor_tax_profiles is
  'Per-contractor 1099 status. Stores NO TIN/SSN, no address, and no W-9 '
  'document — the accountant holds those. See .claude/SPEC-tax-features.md.';

-- Cleanup for anyone who applied an earlier draft of this migration, which
-- did create W-9 document storage. Re-running now removes it, so the end
-- state is the same either way and no file with a TIN on it is left behind.
drop function if exists admin_upsert_contractor_tax_profile(
  uuid, text, tax_entity_type, text, text, text, text, text, date, text, boolean, text);

alter table contractor_tax_profiles
  drop column if exists w9_doc_path,
  drop column if exists address_line1,
  drop column if exists address_line2,
  drop column if exists city,
  drop column if exists state,
  drop column if exists postal_code;

alter table contractor_tax_profiles enable row level security;

drop policy if exists "contractor_tax_profiles admin all" on contractor_tax_profiles;

create policy "contractor_tax_profiles admin all"
  on contractor_tax_profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- ── No document storage, by design ───────────────────────────────────────
--
-- An earlier draft created a private `tax-docs` bucket for signed W-9 PDFs.
-- That was dropped: a W-9 has the TIN printed on it, so storing the file is
-- storing the number. Tear down anything that draft created.

drop policy if exists "tax-docs admin select" on storage.objects;
drop policy if exists "tax-docs admin insert" on storage.objects;
drop policy if exists "tax-docs admin update" on storage.objects;
drop policy if exists "tax-docs admin delete" on storage.objects;

delete from storage.objects where bucket_id = 'tax-docs';
delete from storage.buckets where id = 'tax-docs';

-- ── Helper: tax year of a payment timestamp ──────────────────────────────
--
-- contractor_invoices.paid_at is timestamptz, so a naive extract(year ...)
-- resolves in the server's zone — UTC on Supabase. An invoice marked paid
-- at 8pm ET on Dec 31 is 01:00 UTC on Jan 1, which would silently push that
-- deduction into the following tax year. Year-end is exactly when invoice
-- settling clusters, so this is a realistic failure, not a theoretical one.
-- Anchored to the LLC's tax home; this is the one constant to change if
-- that home ever differs.
--
-- STABLE, not IMMUTABLE: AT TIME ZONE depends on the tz database.
create or replace function tax_year_of(p_ts timestamptz)
returns int
language sql stable set search_path = public, pg_temp as $$
  select extract(year from (p_ts at time zone 'America/New_York'))::int
$$;

grant execute on function tax_year_of(timestamptz) to authenticated;

-- ── Helper: normalized category name → Schedule E line ───────────────────
--
-- Categories can be global (household_id IS NULL) or household-scoped, and
-- two rows can share a name. DISTINCT ON with this ORDER BY prefers a row
-- that actually HAS a mapping, then prefers household-scoped over global,
-- so a deliberate per-property override wins over an unmapped duplicate.

create or replace view category_schedule_e_map as
  select distinct on (lower(btrim(name)))
         lower(btrim(name)) as category_key,
         schedule_e_line
    from categories
   order by lower(btrim(name)),
            (schedule_e_line is null),      -- mapped rows first
            (household_id is null);         -- then household-scoped over global

-- ── Settings RPCs ────────────────────────────────────────────────────────

create or replace function get_tax_settings()
returns tax_settings
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row tax_settings;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  select * into v_row from tax_settings ts where ts.id = 1;
  return v_row;
end;
$$;

create or replace function admin_update_tax_settings(
  p_de_minimis numeric,
  p_1099       numeric
) returns tax_settings
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row tax_settings;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if p_de_minimis is null or p_de_minimis < 0 or p_1099 is null or p_1099 < 0 then
    raise exception 'thresholds must be non-negative';
  end if;

  update tax_settings
     set de_minimis_threshold = p_de_minimis,
         form_1099_threshold  = p_1099,
         updated_at           = now(),
         updated_by           = auth.uid()
   where id = 1
   returning * into v_row;

  return v_row;
end;
$$;

-- ── Schedule E rollup ────────────────────────────────────────────────────
--
-- Returns one row per (household, line, treatment). line IS NULL means the
-- source category has no mapping yet — surfaced so the admin knows what to
-- go map rather than silently dropping the money from the report.

create or replace function schedule_e_report(p_tax_year int)
returns table (
  household_id   uuid,
  household_name text,
  line           schedule_e_line,
  treatment      capital_treatment,
  total          numeric,
  txn_count      bigint,
  source         text
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  return query
  with expense_rows as (
    select e.household_id,
           -- Layer 1: the expense's own category. Layer 2: fall back to the
           -- vendor catalog so rows that were never categorized still land
           -- on a line instead of dropping into "unmapped".
           coalesce(direct.schedule_e_line, via_vendor.schedule_e_line) as line,
           e.capital_treatment,
           e.total,
           'expense'::text as source
      from expenses e
      left join category_schedule_e_map direct
             on direct.category_key = lower(btrim(e.category))
      left join vendor_category_map vcm
             on e.category is null
            and lower(btrim(vcm.vendor_name)) = lower(btrim(e.vendor))
            and (vcm.household_id = e.household_id or vcm.household_id is null)
      left join category_schedule_e_map via_vendor
             on via_vendor.category_key = lower(btrim(vcm.category_name))
     where extract(year from e.expense_date) = p_tax_year
  ),
  invoice_rows as (
    select ci.household_id,
           m.schedule_e_line as line,
           ci.capital_treatment,
           ci.amount as total,
           'invoice'::text as source
      from contractor_invoices ci
      left join categories c on c.id = ci.category_id
      left join category_schedule_e_map m on m.category_key = lower(btrim(c.name))
     where ci.status = 'paid'
       and ci.paid_at is not null
       and tax_year_of(ci.paid_at) = p_tax_year
  ),
  combined as (
    select * from expense_rows
    union all
    select * from invoice_rows
  )
  select cb.household_id,
         h.name,
         cb.line,
         cb.capital_treatment,
         sum(cb.total)::numeric,
         count(*)::bigint,
         cb.source
    from combined cb
    left join households h on h.id = cb.household_id
   group by cb.household_id, h.name, cb.line, cb.capital_treatment, cb.source
   order by h.name nulls last, cb.line nulls last;
end;
$$;

-- ── Capital-treatment review queue ───────────────────────────────────────
--
-- Everything at or above the de minimis threshold that hasn't been reviewed.
-- Below-threshold items are currently deductible under the safe harbor and
-- don't need a per-item judgment, so they're excluded to keep the queue to
-- what actually requires a human.

create or replace function list_capital_review_queue(p_tax_year int)
returns table (
  kind           text,
  id             uuid,
  household_id   uuid,
  household_name text,
  txn_date       date,
  vendor         text,
  description    text,
  category       text,
  -- Lets the client suggester use the category signal ("routine upkeep")
  -- instead of relying on amount and description keywords alone.
  line           schedule_e_line,
  amount         numeric,
  currency       text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_threshold numeric;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  -- tax_settings.id qualified: a bare `id` would collide with this
  -- function's own RETURNS TABLE output parameter of the same name.
  select ts.de_minimis_threshold into v_threshold
    from tax_settings ts where ts.id = 1;
  v_threshold := coalesce(v_threshold, 2500.00);

  -- Union wrapped in a subquery so the sort can name a column rather than
  -- use a positional index, which silently points at the wrong column the
  -- moment the select list changes.
  return query
  select q.kind, q.id, q.household_id, q.household_name, q.txn_date,
         q.vendor, q.description, q.category, q.line, q.amount, q.currency
    from (
      select 'expense'::text  as kind,
             e.id             as id,
             e.household_id   as household_id,
             h.name           as household_name,
             e.expense_date   as txn_date,
             e.vendor         as vendor,
             e.notes          as description,
             e.category       as category,
             m.schedule_e_line as line,
             e.total          as amount,
             e.currency       as currency
        from expenses e
        left join households h on h.id = e.household_id
        left join category_schedule_e_map m on m.category_key = lower(btrim(e.category))
       where e.capital_treatment is null
         and e.total >= v_threshold
         and extract(year from e.expense_date) = p_tax_year

      union all

      select 'invoice'::text,
             ci.id,
             ci.household_id,
             h.name,
             ci.paid_at::date,
             up.username,
             ci.description,
             c.name,
             m.schedule_e_line,
             ci.amount,
             ci.currency
        from contractor_invoices ci
        left join households h on h.id = ci.household_id
        left join categories c on c.id = ci.category_id
        left join category_schedule_e_map m on m.category_key = lower(btrim(c.name))
        left join user_profiles up on up.id = ci.created_by
       where ci.capital_treatment is null
         and ci.status = 'paid'
         and ci.paid_at is not null
         and ci.amount >= v_threshold
         and tax_year_of(ci.paid_at) = p_tax_year
    ) q
   -- Largest dollars first: biggest tax impact gets reviewed first.
   order by q.amount desc;
end;
$$;

create or replace function admin_set_capital_treatment(
  p_kind      text,
  p_id        uuid,
  p_treatment capital_treatment
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  if p_kind = 'expense' then
    update expenses
       set capital_treatment   = p_treatment,
           capital_reviewed_at = case when p_treatment is null then null else now() end,
           capital_reviewed_by = case when p_treatment is null then null else auth.uid() end
     where id = p_id;
  elsif p_kind = 'invoice' then
    update contractor_invoices
       set capital_treatment   = p_treatment,
           capital_reviewed_at = case when p_treatment is null then null else now() end,
           capital_reviewed_by = case when p_treatment is null then null else auth.uid() end
     where id = p_id;
  else
    raise exception 'unknown kind: %', p_kind;
  end if;
end;
$$;

-- ── 1099-NEC summary ─────────────────────────────────────────────────────
--
-- Cash basis on paid_at. Payment method decides who files:
--   credit          -> excluded, the card processor reports it on a 1099-K
--   venmo           -> ambiguous, depends on business-profile status
--   zelle/check/ach -> reportable (Zelle is bank-to-bank, issues no 1099-K)
--   null            -> reportable but counted separately so the UI can warn
--
-- Corporations are generally exempt. Unknown entity type is treated as
-- REQUIRED and flagged, never silently skipped.

create or replace function form_1099_summary(p_tax_year int)
returns table (
  contractor_id        uuid,
  username             text,
  legal_name           text,
  entity_type          tax_entity_type,
  reportable_total     numeric,
  excluded_total       numeric,
  ambiguous_total      numeric,
  unknown_method_total numeric,
  payment_count        bigint,
  threshold            numeric,
  crosses_threshold    boolean,
  w9_on_file           boolean,
  entity_exempt        boolean,
  requires_1099        boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_threshold numeric;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  select ts.form_1099_threshold into v_threshold from tax_settings ts where ts.id = 1;
  v_threshold := coalesce(v_threshold, 2000.00);

  return query
  with paid as (
    select ci.created_by as contractor_id,
           ci.amount,
           case
             when ci.payment_method = 'credit' then 'excluded'
             when ci.payment_method = 'venmo'  then 'ambiguous'
             else 'reportable'
           end as bucket,
           (ci.payment_method is null) as method_unknown
      from contractor_invoices ci
     where ci.status = 'paid'
       and ci.paid_at is not null
       and tax_year_of(ci.paid_at) = p_tax_year
  ),
  totals as (
    select p.contractor_id,
           sum(p.amount) filter (where p.bucket = 'reportable')     as reportable,
           sum(p.amount) filter (where p.bucket = 'excluded')       as excluded,
           sum(p.amount) filter (where p.bucket = 'ambiguous')      as ambiguous,
           sum(p.amount) filter (where p.method_unknown)            as unknown_method,
           count(*)                                                 as cnt
      from paid p
     group by p.contractor_id
  )
  select t.contractor_id,
         up.username,
         ctp.legal_name,
         ctp.entity_type,
         coalesce(t.reportable, 0)::numeric,
         coalesce(t.excluded, 0)::numeric,
         coalesce(t.ambiguous, 0)::numeric,
         coalesce(t.unknown_method, 0)::numeric,
         t.cnt,
         v_threshold,
         coalesce(t.reportable, 0) >= v_threshold,
         (ctp.w9_received_at is not null),
         -- Corporations exempt; explicit exempt-payee flag also honored.
         (coalesce(ctp.entity_type::text, '') in ('c_corp','s_corp') or coalesce(ctp.is_exempt_payee, false)),
         (
           coalesce(t.reportable, 0) >= v_threshold
           and coalesce(ctp.entity_type::text, '') not in ('c_corp','s_corp')
           and not coalesce(ctp.is_exempt_payee, false)
         )
    from totals t
    left join user_profiles up on up.id = t.contractor_id
    left join contractor_tax_profiles ctp on ctp.user_id = t.contractor_id
   order by coalesce(t.reportable, 0) desc;
end;
$$;

create or replace function admin_upsert_contractor_tax_profile(
  p_user_id         uuid,
  p_legal_name      text,
  p_entity_type     tax_entity_type,
  p_w9_received_at  date,
  p_is_exempt_payee boolean,
  p_notes           text
) returns contractor_tax_profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row contractor_tax_profiles;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  insert into contractor_tax_profiles (
    user_id, legal_name, entity_type, w9_received_at,
    is_exempt_payee, notes, updated_at, updated_by
  ) values (
    p_user_id, p_legal_name, p_entity_type, p_w9_received_at,
    coalesce(p_is_exempt_payee, false), p_notes, now(), auth.uid()
  )
  on conflict (user_id) do update set
    legal_name      = excluded.legal_name,
    entity_type     = excluded.entity_type,
    w9_received_at  = excluded.w9_received_at,
    is_exempt_payee = excluded.is_exempt_payee,
    notes           = excluded.notes,
    updated_at      = now(),
    updated_by      = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

-- Contractor list with YTD paid + W-9 status, for the badge on ManageUsers.
create or replace function list_contractor_tax_status(p_tax_year int)
returns table (
  contractor_id  uuid,
  username       text,
  legal_name     text,
  entity_type    tax_entity_type,
  paid_ytd       numeric,
  w9_on_file     boolean,
  needs_w9       boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_threshold numeric;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  select ts.form_1099_threshold into v_threshold from tax_settings ts where ts.id = 1;
  v_threshold := coalesce(v_threshold, 2000.00);

  return query
  select ur.user_id,
         up.username,
         ctp.legal_name,
         ctp.entity_type,
         coalesce(paid.total, 0)::numeric,
         (ctp.w9_received_at is not null),
         (
           coalesce(paid.total, 0) >= v_threshold
           and ctp.w9_received_at is null
           and coalesce(ctp.entity_type::text, '') not in ('c_corp','s_corp')
           and not coalesce(ctp.is_exempt_payee, false)
         )
    from user_roles ur
    left join user_profiles up on up.id = ur.user_id
    left join contractor_tax_profiles ctp on ctp.user_id = ur.user_id
    left join lateral (
      select sum(ci.amount) as total
        from contractor_invoices ci
       where ci.created_by = ur.user_id
         and ci.status = 'paid'
         and ci.paid_at is not null
         and tax_year_of(ci.paid_at) = p_tax_year
         and coalesce(ci.payment_method, '') <> 'credit'
    ) paid on true
   where ur.is_contractor = true
   order by coalesce(paid.total, 0) desc;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

grant execute on function get_tax_settings()                    to authenticated;
grant execute on function admin_update_tax_settings(numeric, numeric) to authenticated;
grant execute on function schedule_e_report(int)                to authenticated;
grant execute on function list_capital_review_queue(int)        to authenticated;
grant execute on function admin_set_capital_treatment(text, uuid, capital_treatment) to authenticated;
grant execute on function form_1099_summary(int)                to authenticated;
grant execute on function list_contractor_tax_status(int)       to authenticated;
grant execute on function admin_upsert_contractor_tax_profile(
  uuid, text, tax_entity_type, date, boolean, text
) to authenticated;
