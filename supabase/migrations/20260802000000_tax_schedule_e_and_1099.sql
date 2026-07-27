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
--  * Schedule E lines live in their OWN tables and are fully editable. They
--    are deliberately NOT a column on `categories` and NOT a Postgres enum:
--    the operational categories a contractor picks ("Materials",
--    "Service/labor") are a different concern from the tax lines they roll
--    up to, and the tax side has to be changeable without a migration.
--    `categories` is left completely untouched by this migration.
--  * expenses.category is free text while contractor_invoices.category_id is
--    a real FK. The rollup therefore resolves expenses by normalized NAME and
--    invoices by ID. Getting this wrong yields two different totals.
--  * Cash basis throughout: expenses use expense_date, invoices use paid_at
--    (not service dates), so work done in December but paid in January lands
--    in the correct — later — tax year.

-- ── Enums ────────────────────────────────────────────────────────────────

-- Currently-deductible repair vs. capitalize-and-depreciate improvement.
-- NULL means "not yet reviewed" and is what the review queue selects on.
do $$ begin
  create type capital_treatment as enum ('repair','improvement');
exception when duplicate_object then null; end $$;

-- ── Teardown of the earlier coupled design ───────────────────────────────
--
-- An earlier draft hung a `schedule_e_line` enum column directly off
-- `categories`, and exposed the lookup as a VIEW named category_schedule_e_map
-- — the same name the mapping TABLE below uses. This must run first:
-- `create table if not exists` matches any relation of that name, so a
-- leftover view would make the table creation silently no-op.

drop function if exists schedule_e_report(int);
drop function if exists list_capital_review_queue(int);
-- `drop view if exists` tolerates absence but NOT a name that now belongs to
-- a table — it raises "is not a view". On a re-run the table below already
-- exists under this name, so the drop has to be conditional on relkind.
do $$ begin
  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'category_schedule_e_map'
       and c.relkind = 'v'
  ) then
    execute 'drop view category_schedule_e_map';
  end if;
end $$;
alter table categories drop column if exists schedule_e_line;
drop type if exists schedule_e_line;

-- ── Schedule E lines (their own table, editable) ─────────────────────────
--
-- Seeded with the 15 expense lines of Schedule E Part I (Form 1040). Form
-- 8825, used by multi-member LLCs, has near-identical lines, so one list
-- serves both.
--
-- A table rather than an enum because the owner needs to rename, reorder,
-- deactivate, or add lines without a migration. `code` is the stable key the
-- suggestion logic matches on; `label` is free display text the admin owns.
-- Seeded rows are marked is_system: they can be renamed or deactivated but
-- not deleted, so a rollup can never lose its target by accident.

create table if not exists schedule_e_lines (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  -- Official Schedule E Part I line number (5-19). NULL for custom lines the
  -- admin adds, which have no IRS counterpart.
  line_number int,
  -- Short "what belongs here" hint, shown under the label on the mapping
  -- screen so the right line is obvious without opening the instructions.
  description text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Added after the first draft, so existing installs pick them up.
alter table schedule_e_lines
  add column if not exists line_number int,
  add column if not exists description text;

comment on table schedule_e_lines is
  'Schedule E Part I / Form 8825 expense lines. Editable by full admins; '
  'deliberately separate from the operational `categories` table.';

-- Labels, line numbers and descriptions are the owner's own wording for
-- their rental portfolio — not generic IRS phrasing — so the mapping screen
-- reads the way they think about it.
insert into schedule_e_lines (code, label, line_number, description, sort_order, is_system) values
  ('advertising',          'Advertising',                5,  'Online listings, yard signs, newspaper ads',                    50,  true),
  ('auto_travel',          'Auto & Travel',              6,  'Mileage ($0.70/mile in 2025), property visits',                 60,  true),
  ('cleaning_maintenance', 'Cleaning & Maintenance',     7,  'Lawn care, pest control, routine repairs',                      70,  true),
  ('commissions',          'Commissions',                8,  'Tenant finder fees, leasing agent fees',                        80,  true),
  ('insurance',            'Insurance',                  9,  'Property, liability, flood insurance premiums',                 90,  true),
  ('legal_professional',   'Legal & Professional Fees',  10, 'CPA costs, attorney fees, property management software',        100, true),
  ('management_fees',      'Management Fees',            11, 'Property manager commissions (typically 8-12%)',                110, true),
  ('mortgage_interest',    'Mortgage Interest',          12, 'Interest portion of mortgage payments only',                    120, true),
  ('other_interest',       'Other Interest',             13, 'Credit card interest for property expenses',                    130, true),
  ('repairs',              'Repairs',                    14, 'Fixing broken items without improving property value',          140, true),
  ('supplies',             'Supplies',                   15, 'Office supplies, maintenance tools, cleaning materials',        150, true),
  ('taxes',                'Taxes',                      16, 'Property taxes, occupancy taxes, licensing fees',               160, true),
  ('utilities',            'Utilities',                  17, 'Gas, electric, water, internet (if landlord-paid)',             170, true),
  ('depreciation',         'Depreciation',               18, '27.5-year residential property depreciation',                   180, true),
  ('other',                'Other',                      19, 'HOA fees, association dues, miscellaneous expenses',            190, true)
on conflict (code) do nothing;

-- Anyone who applied the first draft has the old generic labels and no line
-- numbers. Backfill them — but ONLY where the label is still the untouched
-- default, so a deliberate rename is never clobbered by a re-run.
update schedule_e_lines l set
  label       = v.label,
  line_number = v.line_number,
  description = v.description,
  sort_order  = v.sort_order,
  updated_at  = now()
from (values
  ('advertising',          'Advertising',               'Advertising',                        5,  'Online listings, yard signs, newspaper ads',             50),
  ('auto_travel',          'Auto and travel',           'Auto & Travel',                      6,  'Mileage ($0.70/mile in 2025), property visits',          60),
  ('cleaning_maintenance', 'Cleaning and maintenance',  'Cleaning & Maintenance',             7,  'Lawn care, pest control, routine repairs',               70),
  ('commissions',          'Commissions',               'Commissions',                        8,  'Tenant finder fees, leasing agent fees',                 80),
  ('insurance',            'Insurance',                 'Insurance',                          9,  'Property, liability, flood insurance premiums',          90),
  ('legal_professional',   'Legal and other professional fees', 'Legal & Professional Fees',  10, 'CPA costs, attorney fees, property management software', 100),
  ('management_fees',      'Management fees',           'Management Fees',                    11, 'Property manager commissions (typically 8-12%)',         110),
  ('mortgage_interest',    'Mortgage interest',         'Mortgage Interest',                  12, 'Interest portion of mortgage payments only',              120),
  ('other_interest',       'Other interest',            'Other Interest',                     13, 'Credit card interest for property expenses',              130),
  ('repairs',              'Repairs',                   'Repairs',                            14, 'Fixing broken items without improving property value',    140),
  ('supplies',             'Supplies',                  'Supplies',                           15, 'Office supplies, maintenance tools, cleaning materials',  150),
  ('taxes',                'Taxes',                     'Taxes',                              16, 'Property taxes, occupancy taxes, licensing fees',         160),
  ('utilities',            'Utilities',                 'Utilities',                          17, 'Gas, electric, water, internet (if landlord-paid)',       170),
  ('depreciation',         'Depreciation',              'Depreciation',                       18, '27.5-year residential property depreciation',             180),
  ('other',                'Other',                     'Other',                              19, 'HOA fees, association dues, miscellaneous expenses',      190)
) as v(code, old_label, label, line_number, description, sort_order)
where l.code = v.code
  and l.is_system
  and l.label = v.old_label;

alter table schedule_e_lines enable row level security;
drop policy if exists "schedule_e_lines admin all" on schedule_e_lines;
create policy "schedule_e_lines admin all"
  on schedule_e_lines for all to authenticated
  using (is_admin()) with check (is_admin());

-- ── Category → line mapping (its own table) ──────────────────────────────
--
-- One row per operational category that has a tax line. Categories with no
-- row simply don't roll up yet, and surface in the report's "unmapped"
-- warning. `categories` itself gains no columns — the two concepts stay
-- independent, and deleting a mapping never touches the category.
--
-- on delete restrict for the line: you cannot delete a tax line that
-- categories still point at.

create table if not exists category_schedule_e_map (
  category_id        uuid primary key references categories(id) on delete cascade,
  schedule_e_line_id uuid not null references schedule_e_lines(id) on delete restrict,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);

create index if not exists category_schedule_e_map_line_idx
  on category_schedule_e_map(schedule_e_line_id);

alter table category_schedule_e_map enable row level security;
drop policy if exists "category_schedule_e_map admin all" on category_schedule_e_map;
create policy "category_schedule_e_map admin all"
  on category_schedule_e_map for all to authenticated
  using (is_admin()) with check (is_admin());

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
--
-- BEST EFFORT, and it has to be. Supabase installs a storage.protect_delete()
-- trigger that rejects direct DELETE from storage tables ("Use the Storage
-- API instead"), and the storage schema is owned by supabase_storage_admin,
-- so policy drops can hit permission errors too. Neither should abort this
-- migration: the shipped version never creates that bucket, so for a normal
-- install this block is a pure no-op. It only matters for someone who ran an
-- intermediate draft — and for them, a NOTICE plus a manual dashboard delete
-- is the correct outcome, not a failed migration.
do $$
begin
  begin
    execute 'drop policy if exists "tax-docs admin select" on storage.objects';
    execute 'drop policy if exists "tax-docs admin insert" on storage.objects';
    execute 'drop policy if exists "tax-docs admin update" on storage.objects';
    execute 'drop policy if exists "tax-docs admin delete" on storage.objects';
  exception when others then
    raise notice 'tax-docs policy cleanup skipped (%) — harmless.', sqlerrm;
  end;

  begin
    delete from storage.objects where bucket_id = 'tax-docs';
    delete from storage.buckets  where id = 'tax-docs';
  exception when others then
    raise notice 'tax-docs bucket cleanup skipped (%). If a "tax-docs" bucket exists in Storage, delete it from the dashboard — nothing in this app reads or writes it.', sqlerrm;
  end;
end $$;

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

-- ── Helper: resolve a category to its tax line ───────────────────────────
--
-- categories.name is globally unique, so keying on the normalized name is
-- safe and lets expenses (free-text category) and invoices (category_id)
-- resolve through the same place. Inactive lines drop out: deactivating a
-- line makes everything under it read as unmapped rather than vanishing.

create or replace view category_line_lookup as
  select c.id                   as category_id,
         lower(btrim(c.name))   as category_key,
         l.id                   as line_id,
         l.code                 as line_code,
         l.label                as line_label,
         l.line_number          as line_number,
         l.sort_order           as line_sort
    from categories c
    join category_schedule_e_map m on m.category_id = c.id
    join schedule_e_lines l        on l.id = m.schedule_e_line_id
   where l.is_active;

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
-- One row per (household, line, treatment). line_id NULL means the source
-- category has no mapping yet — surfaced so the admin knows what to go map,
-- rather than silently dropping the money from the report.

create or replace function schedule_e_report(p_tax_year int)
returns table (
  household_id   uuid,
  household_name text,
  line_id        uuid,
  line_code      text,
  line_label     text,
  line_number    int,
  line_sort      int,
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
           -- vendor catalog so rows that were never categorized still land on
           -- a line instead of dropping into "unmapped".
           coalesce(direct.line_id,    via_vendor.line_id)    as line_id,
           coalesce(direct.line_code,  via_vendor.line_code)  as line_code,
           coalesce(direct.line_label,  via_vendor.line_label)  as line_label,
           coalesce(direct.line_number, via_vendor.line_number) as line_number,
           coalesce(direct.line_sort,   via_vendor.line_sort)   as line_sort,
           e.capital_treatment,
           e.total,
           'expense'::text as source
      from expenses e
      left join category_line_lookup direct
             on direct.category_key = lower(btrim(e.category))
      left join vendor_category_map vcm
             on e.category is null
            and lower(btrim(vcm.vendor_name)) = lower(btrim(e.vendor))
            and (vcm.household_id = e.household_id or vcm.household_id is null)
      left join category_line_lookup via_vendor
             on via_vendor.category_key = lower(btrim(vcm.category_name))
     where extract(year from e.expense_date) = p_tax_year
  ),
  invoice_rows as (
    select ci.household_id,
           l.line_id, l.line_code, l.line_label, l.line_number, l.line_sort,
           ci.capital_treatment,
           ci.amount as total,
           'invoice'::text as source
      from contractor_invoices ci
      left join category_line_lookup l on l.category_id = ci.category_id
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
         cb.line_id,
         cb.line_code,
         cb.line_label,
         cb.line_number,
         cb.line_sort,
         cb.capital_treatment,
         sum(cb.total)::numeric,
         count(*)::bigint,
         cb.source
    from combined cb
    left join households h on h.id = cb.household_id
   group by cb.household_id, h.name, cb.line_id, cb.line_code, cb.line_label,
            cb.line_number, cb.line_sort, cb.capital_treatment, cb.source
   order by h.name nulls last, cb.line_sort nulls last;
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
  line_code      text,
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
         q.vendor, q.description, q.category, q.line_code, q.amount, q.currency
    from (
      select 'expense'::text  as kind,
             e.id             as id,
             e.household_id   as household_id,
             h.name           as household_name,
             e.expense_date   as txn_date,
             e.vendor         as vendor,
             e.notes          as description,
             e.category       as category,
             l.line_code      as line_code,
             e.total          as amount,
             e.currency       as currency
        from expenses e
        left join households h on h.id = e.household_id
        left join category_line_lookup l on l.category_key = lower(btrim(e.category))
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
             l.line_code,
             ci.amount,
             ci.currency
        from contractor_invoices ci
        left join households h on h.id = ci.household_id
        left join categories c on c.id = ci.category_id
        left join category_line_lookup l on l.category_id = ci.category_id
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

-- ── Schedule E line management ───────────────────────────────────────────

create or replace function list_schedule_e_lines(p_include_inactive boolean default false)
returns setof schedule_e_lines
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select * from schedule_e_lines l
     where p_include_inactive or l.is_active
     order by l.sort_order, l.label;
end;
$$;

create or replace function admin_upsert_schedule_e_line(
  p_id          uuid,
  p_code        text,
  p_label       text,
  p_sort_order  int,
  p_is_active   boolean,
  p_description text default null
) returns schedule_e_lines
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row schedule_e_lines;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if coalesce(btrim(p_label), '') = '' then
    raise exception 'label is required';
  end if;

  if p_id is null then
    -- New custom line. Codes are lowercase snake so the suggestion logic and
    -- any future export mapping have a stable key to match on.
    insert into schedule_e_lines (code, label, description, sort_order, is_active, is_system)
    values (
      coalesce(nullif(btrim(p_code), ''),
               regexp_replace(lower(btrim(p_label)), '[^a-z0-9]+', '_', 'g')),
      btrim(p_label), nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(p_sort_order, 999), coalesce(p_is_active, true), false
    )
    returning * into v_row;
  else
    -- Label / order / active are editable on every line, including seeded
    -- ones. `code` is deliberately immutable: it's the join key.
    update schedule_e_lines
       set label       = btrim(p_label),
           description = coalesce(nullif(btrim(coalesce(p_description, '')), ''), description),
           sort_order  = coalesce(p_sort_order, sort_order),
           is_active   = coalesce(p_is_active, is_active),
           updated_at  = now()
     where id = p_id
     returning * into v_row;

    if v_row.id is null then raise exception 'line not found'; end if;
  end if;

  return v_row;
end;
$$;

create or replace function admin_delete_schedule_e_line(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_system boolean; v_used int;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  select is_system into v_system from schedule_e_lines where id = p_id;
  if v_system is null then raise exception 'line not found'; end if;

  -- Seeded IRS lines stay: deactivate them instead, so historical rollups
  -- keep resolving and nobody deletes "Repairs" by accident.
  if v_system then
    raise exception 'built-in lines cannot be deleted — deactivate instead';
  end if;

  select count(*) into v_used from category_schedule_e_map where schedule_e_line_id = p_id;
  if v_used > 0 then
    raise exception 'line is still mapped to % categor%', v_used,
      case when v_used = 1 then 'y' else 'ies' end;
  end if;

  delete from schedule_e_lines where id = p_id;
end;
$$;

-- ── Category → line mapping ──────────────────────────────────────────────

-- Every operational category with its current mapping (NULL if unmapped).
-- Drives the mapping screen; deliberately reads `categories` without
-- modifying it.
create or replace function list_category_mappings()
returns table (
  category_id   uuid,
  category_name text,
  line_id       uuid,
  line_code     text,
  line_label    text,
  txn_count     bigint
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  return query
  select c.id,
         c.name,
         l.id,
         l.code,
         l.label,
         -- How much this category is actually used, so the admin can map the
         -- ones that matter first instead of working alphabetically.
         (select count(*) from expenses e where lower(btrim(e.category)) = lower(btrim(c.name)))
         + (select count(*) from contractor_invoices ci where ci.category_id = c.id)
    from categories c
    left join category_schedule_e_map m on m.category_id = c.id
    left join schedule_e_lines l on l.id = m.schedule_e_line_id
   order by c.name;
end;
$$;

create or replace function admin_set_category_schedule_e_line(
  p_category_id uuid,
  p_line_id     uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  if p_line_id is null then
    delete from category_schedule_e_map where category_id = p_category_id;
  else
    insert into category_schedule_e_map (category_id, schedule_e_line_id, updated_at, updated_by)
    values (p_category_id, p_line_id, now(), auth.uid())
    on conflict (category_id) do update
      set schedule_e_line_id = excluded.schedule_e_line_id,
          updated_at         = now(),
          updated_by         = auth.uid();
  end if;
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
grant execute on function list_schedule_e_lines(boolean)        to authenticated;
grant execute on function admin_upsert_schedule_e_line(uuid, text, text, int, boolean, text) to authenticated;
drop function if exists admin_upsert_schedule_e_line(uuid, text, text, int, boolean);
grant execute on function admin_delete_schedule_e_line(uuid)    to authenticated;
grant execute on function list_category_mappings()              to authenticated;
grant execute on function admin_set_category_schedule_e_line(uuid, uuid) to authenticated;
grant execute on function list_capital_review_queue(int)        to authenticated;
grant execute on function admin_set_capital_treatment(text, uuid, capital_treatment) to authenticated;
grant execute on function form_1099_summary(int)                to authenticated;
grant execute on function list_contractor_tax_status(int)       to authenticated;
