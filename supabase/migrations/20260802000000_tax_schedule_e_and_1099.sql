-- Tax features: Schedule E classification + 1099-NEC readiness (v13.15)
--
-- Both features are FULL ADMIN ONLY. Every RPC below re-checks is_admin();
-- the client-side gate in AdminLayout is convenience, this is the boundary.
--
-- Design notes that aren't obvious from the DDL — see
-- .claude/SPEC-tax-features.md for the full rationale:
--
--  * The 1099 side stores NOTHING about contractors beyond the payments
--    already in contractor_invoices. No profile table, no legal names, no
--    entity types, no W-9 dates, no identifiers, no documents. The owner's
--    accountant collects W-9s and files the 1099s; the app's only job is to
--    say who was paid what, and to print a worksheet to hand over.
--    Everything else is a stated assumption, not a data-entry field.
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

-- ── No contractor profile data at all ────────────────────────────────────
--
-- Earlier drafts kept a contractor_tax_profiles table (legal name, entity
-- type, W-9 date) and a private bucket for signed W-9 PDFs. Both are gone.
--
-- The reason is friction, not just privacy: every one of those fields was
-- something the owner had to type in, and none of it changed what the app
-- could compute. The accountant already collects W-9s and knows which payees
-- are corporations. So the app assumes the conservative case — every
-- contractor may need a 1099 — reports the payment totals it genuinely
-- knows, and prints a W-9 worksheet for the accountant to complete.
--
-- Torn down in dependency order: functions first (their signatures reference
-- the enum), then the table, then the enum.

drop function if exists admin_upsert_contractor_tax_profile(
  uuid, text, tax_entity_type, text, text, text, text, text, date, text, boolean, text);
drop function if exists admin_upsert_contractor_tax_profile(
  uuid, text, tax_entity_type, date, boolean, text);
drop function if exists form_1099_summary(int);
drop function if exists list_contractor_tax_status(int);

drop table if exists contractor_tax_profiles;
drop type if exists tax_entity_type;

-- Same teardown for the W-9 document bucket an earlier draft created. A
-- signed W-9 has the TIN printed on it, so the file is the number.
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
-- Computed entirely from payments already in the system — no contractor
-- profile data exists, and none is asked for.
--
-- Cash basis on paid_at. Payment method decides who files:
--   credit          -> excluded, the card processor reports it on a 1099-K
--   venmo           -> ambiguous, depends on business-profile status
--   zelle/check/ach -> reportable (Zelle is bank-to-bank, issues no 1099-K)
--   null            -> reportable but counted separately so the UI can warn
--
-- Corporate payees are exempt from 1099-NEC, but the app has no way to know
-- which contractors are incorporated and deliberately doesn't ask. It
-- therefore reports the conservative case — everyone over the threshold is
-- listed — and the accountant strikes the corporations. Over-listing is
-- recoverable; under-listing is a missed filing.

create or replace function form_1099_summary(p_tax_year int)
returns table (
  contractor_id        uuid,
  username             text,
  reportable_total     numeric,
  excluded_total       numeric,
  ambiguous_total      numeric,
  unknown_method_total numeric,
  payment_count        bigint,
  methods              text,
  threshold            numeric,
  crosses_threshold    boolean
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
           coalesce(ci.payment_method, 'unrecorded') as method,
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
           sum(p.amount) filter (where p.bucket = 'reportable') as reportable,
           sum(p.amount) filter (where p.bucket = 'excluded')   as excluded,
           sum(p.amount) filter (where p.bucket = 'ambiguous')  as ambiguous,
           sum(p.amount) filter (where p.method_unknown)        as unknown_method,
           count(*)                                             as cnt,
           -- Distinct methods, for the worksheet the accountant receives.
           string_agg(distinct p.method, ', ' order by p.method) as methods
      from paid p
     group by p.contractor_id
  )
  select t.contractor_id,
         up.username,
         coalesce(t.reportable, 0)::numeric,
         coalesce(t.excluded, 0)::numeric,
         coalesce(t.ambiguous, 0)::numeric,
         coalesce(t.unknown_method, 0)::numeric,
         t.cnt,
         t.methods,
         v_threshold,
         coalesce(t.reportable, 0) >= v_threshold
    from totals t
    left join user_profiles up on up.id = t.contractor_id
   order by coalesce(t.reportable, 0) desc;
end;
$$;

-- Year-to-date paid per contractor, for the passive badge on ManageUsers.
-- Excludes card payments for the same 1099-K reason as above.
create or replace function list_contractor_tax_status(p_tax_year int)
returns table (
  contractor_id     uuid,
  username          text,
  paid_ytd          numeric,
  threshold         numeric,
  crosses_threshold boolean
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
         coalesce(paid.total, 0)::numeric,
         v_threshold,
         coalesce(paid.total, 0) >= v_threshold
    from user_roles ur
    left join user_profiles up on up.id = ur.user_id
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
