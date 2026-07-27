-- Assertion suite for the tax migration. Every check RAISEs on failure, so a
-- clean run to "ALL TESTS PASSED" is the pass condition.

\set ON_ERROR_STOP on

create or replace function assert(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'FAILED: %', p_label; end if;
  raise notice '  ok: %', p_label;
end; $$;

-- ── Seed ─────────────────────────────────────────────────────────────────

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- admin
  ('00000000-0000-0000-0000-0000000000c1'),  -- contractor: individual, big
  ('00000000-0000-0000-0000-0000000000c2'),  -- contractor: S-corp
  ('00000000-0000-0000-0000-0000000000c3'),  -- contractor: unknown entity
  ('00000000-0000-0000-0000-0000000000c4');  -- contractor: under threshold

insert into user_profiles (id, username) values
  ('00000000-0000-0000-0000-0000000000c1','grosse'),
  ('00000000-0000-0000-0000-0000000000c2','acmecorp'),
  ('00000000-0000-0000-0000-0000000000c3','mystery'),
  ('00000000-0000-0000-0000-0000000000c4','smalljob');

insert into user_roles (user_id, is_contractor) values
  ('00000000-0000-0000-0000-0000000000c1', true),
  ('00000000-0000-0000-0000-0000000000c2', true),
  ('00000000-0000-0000-0000-0000000000c3', true),
  ('00000000-0000-0000-0000-0000000000c4', true);

insert into households (id, name) values
  ('00000000-0000-0000-0000-0000000000b1','Grant'),
  ('00000000-0000-0000-0000-0000000000b2','Morton');

-- Operational categories carry NO tax data — that's the whole point of the
-- split. The mapping lives in its own table below.
insert into categories (id, name, household_id) values
  ('00000000-0000-0000-0000-0000000000e1','Materials',     null),
  ('00000000-0000-0000-0000-0000000000e2','Service/labor', null),
  ('00000000-0000-0000-0000-0000000000e3','Mystery Cat',   null);

-- Two mapped, one deliberately left unmapped.
insert into category_schedule_e_map (category_id, schedule_e_line_id)
select '00000000-0000-0000-0000-0000000000e1', id from schedule_e_lines where code = 'supplies';
insert into category_schedule_e_map (category_id, schedule_e_line_id)
select '00000000-0000-0000-0000-0000000000e2', id from schedule_e_lines where code = 'repairs';

-- Vendor catalog, for the Layer-2 fallback
insert into vendor_category_map (vendor_name, category_name, household_id)
values ('Lowe''s', 'Materials', null);

-- ── Schedule E fixtures ──────────────────────────────────────────────────

insert into expenses (household_id, expense_date, vendor, total, category) values
  -- Layer 1: direct category -> supplies
  ('00000000-0000-0000-0000-0000000000b1','2026-03-01','Home Depot', 100, 'Materials'),
  -- case/whitespace variance must still map
  ('00000000-0000-0000-0000-0000000000b1','2026-03-02','Home Depot',  50, '  materials  '),
  -- Layer 2: no category, vendor resolves via catalog -> Materials -> supplies
  ('00000000-0000-0000-0000-0000000000b1','2026-03-03','Lowe''s',     25, null),
  -- mapped to repairs
  ('00000000-0000-0000-0000-0000000000b2','2026-03-04','Handyman',   300, 'Service/labor'),
  -- unmapped category -> line IS NULL, must still appear
  ('00000000-0000-0000-0000-0000000000b2','2026-03-05','Who',         77, 'Mystery Cat'),
  -- different tax year, must be excluded
  ('00000000-0000-0000-0000-0000000000b1','2025-03-01','Home Depot', 999, 'Materials');

insert into contractor_invoices
  (created_by, household_id, amount, description, status, paid_at, category_id, payment_method) values
  -- paid 2026, category -> repairs
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   5000,'Deck rebuild','paid','2026-06-01 12:00:00-04','00000000-0000-0000-0000-0000000000e2','check'),
  -- CASH BASIS: Dec-2026 work paid Jan-2027 -> belongs to 2027
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   1234,'Dec work','paid','2027-01-05 12:00:00-05','00000000-0000-0000-0000-0000000000e2','check'),
  -- pending, never counted
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   9999,'Not paid yet','pending',null,'00000000-0000-0000-0000-0000000000e2','check'),
  -- TIMEZONE EDGE: 8pm ET Dec 31 2026 == 01:00 UTC Jan 1 2027. Must be 2026.
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   700,'NYE settle','paid','2026-12-31 20:00:00-05','00000000-0000-0000-0000-0000000000e2','check'),
  -- credit card -> excluded from 1099 (processor files 1099-K)
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   400,'Card job','paid','2026-05-01 12:00:00-04',null,'credit'),
  -- venmo -> ambiguous
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   300,'Venmo job','paid','2026-05-02 12:00:00-04',null,'venmo'),
  -- null method -> reportable, but flagged
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
   200,'Unknown method','paid','2026-05-03 12:00:00-04',null,null),
  -- S-corp contractor, over threshold but exempt
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b1',
   8000,'Corp job','paid','2026-05-04 12:00:00-04',null,'ach'),
  -- unknown entity type, over threshold -> must still REQUIRE a 1099
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b1',
   3000,'Mystery job','paid','2026-05-05 12:00:00-04',null,'zelle'),
  -- under threshold
  ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b1',
   150,'Small job','paid','2026-05-06 12:00:00-04',null,'check');

-- No contractor profile table exists. Everything below is computed from the
-- payments alone — that's the whole point.

-- ── Tests ────────────────────────────────────────────────────────────────

do $$
declare
  v_supplies numeric; v_repairs numeric; v_unmapped numeric;
  v_n int; v_rec record; v_err text;
begin
  raise notice '--- tax_year_of / timezone ---';
  perform assert(tax_year_of('2026-12-31 20:00:00-05'::timestamptz) = 2026,
    'Dec 31 8pm ET is tax year 2026 (not 2027 via UTC)');
  perform assert(tax_year_of('2027-01-01 10:00:00-05'::timestamptz) = 2027,
    'Jan 1 ET is tax year 2027');

  raise notice '--- schedule_e_report: category mapping ---';
  select sum(total) into v_supplies from schedule_e_report(2026) where line_code = 'supplies';
  -- 100 direct + 50 case/space variance + 25 vendor fallback
  perform assert(v_supplies = 175,
    'supplies = 175 (direct + normalized-name + vendor fallback), got ' || coalesce(v_supplies::text,'null'));

  select sum(total) into v_repairs from schedule_e_report(2026) where line_code = 'repairs';
  -- 300 expense + 5000 invoice + 700 NYE invoice
  perform assert(v_repairs = 6000,
    'repairs = 6000 (300 expense + 5000 + 700 invoices), got ' || coalesce(v_repairs::text,'null'));

  -- A mapped-but-unmapped CATEGORY surfaces as line IS NULL rather than being
  -- dropped, so the admin knows what to go map.
  select sum(total) into v_unmapped from schedule_e_report(2026)
   where line_code is null and source = 'expense';
  perform assert(v_unmapped = 77,
    'expense with an unmapped category surfaces as line IS NULL, got ' || coalesce(v_unmapped::text,'null'));

  -- Invoices carrying no category_id at all also land in unmapped. This is
  -- correct (nothing is silently dropped) and is what the UI warns about:
  -- 400+300+200+8000+3000+150 = 12050.
  select sum(total) into v_unmapped from schedule_e_report(2026)
   where line_code is null and source = 'invoice';
  perform assert(v_unmapped = 12050,
    'uncategorized invoices surface as unmapped, got ' || coalesce(v_unmapped::text,'null'));

  -- Nothing is lost: every dollar in the year is represented exactly once.
  select sum(total) into v_unmapped from schedule_e_report(2026);
  perform assert(v_unmapped = 175 + 6000 + 77 + 12050,
    'report is complete and non-double-counting, got ' || coalesce(v_unmapped::text,'null'));

  raise notice '--- schedule_e_report: cash basis + status ---';
  select coalesce(sum(total),0) into v_repairs from schedule_e_report(2027) where line_code = 'repairs';
  perform assert(v_repairs = 1234, 'Dec-2026 work paid Jan-2027 lands in 2027, got ' || v_repairs);

  perform assert(
    not exists (select 1 from schedule_e_report(2026) where total = 9999),
    'pending invoice never appears in the report');
  perform assert(
    not exists (select 1 from schedule_e_report(2026) where total = 999),
    'prior-year expense excluded from 2026');

  raise notice '--- capital review queue ---';
  -- threshold 2500: only the 5000 invoice qualifies in 2026 (700/400/300/200
  -- are below it, 8000 and 3000 belong to other contractors but ARE >= 2500)
  select count(*) into v_n from list_capital_review_queue(2026);
  perform assert(v_n = 3, 'queue holds the three >= $2,500 unreviewed 2026 items, got ' || v_n);
  perform assert(
    not exists (select 1 from list_capital_review_queue(2026) where amount < 2500),
    'nothing below the de minimis threshold enters the queue');

  -- largest first
  select amount into v_supplies from list_capital_review_queue(2026) limit 1;
  perform assert(v_supplies = 8000, 'queue is ordered largest-dollar first, got ' || v_supplies);

  -- The queue carries the resolved Schedule E line so the client suggester
  -- can use the "routine upkeep category" signal, not just amount+keywords.
  perform assert(
    exists (select 1 from list_capital_review_queue(2026)
             where amount = 5000 and line_code = 'repairs'),
    'queue resolves the Schedule E line for a categorized invoice');
  perform assert(
    exists (select 1 from list_capital_review_queue(2026)
             where amount = 8000 and line_code is null),
    'uncategorized invoice yields a null line rather than erroring');

  raise notice '--- admin_set_capital_treatment ---';
  select id into v_rec from contractor_invoices where description = 'Deck rebuild';
  perform admin_set_capital_treatment('invoice', v_rec.id, 'improvement');
  perform assert(
    (select capital_treatment from contractor_invoices where id = v_rec.id) = 'improvement',
    'treatment persisted');
  perform assert(
    (select capital_reviewed_at is not null from contractor_invoices where id = v_rec.id),
    'reviewed_at stamped');
  select count(*) into v_n from list_capital_review_queue(2026);
  perform assert(v_n = 2, 'reviewed item leaves the queue, got ' || v_n);

  -- treatment now flows through to the report
  perform assert(
    exists (select 1 from schedule_e_report(2026)
             where line_code = 'repairs' and treatment = 'improvement' and total = 5000),
    'reviewed invoice reports under its capital treatment');

  begin
    perform admin_set_capital_treatment('bogus', v_rec.id, 'repair');
    perform assert(false, 'unknown kind should raise');
  exception when others then
    perform assert(sqlerrm like '%unknown kind%', 'unknown kind rejected');
  end;

  raise notice '--- form_1099_summary: payment-method rules ---';
  select * into v_rec from form_1099_summary(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c1';
  -- reportable: 5000 check + 700 NYE check + 200 null-method = 5900
  perform assert(v_rec.reportable_total = 5900,
    'check + NYE + null-method are reportable = 5900, got ' || v_rec.reportable_total);
  perform assert(v_rec.excluded_total = 400,  'credit-card payment excluded (1099-K)');
  perform assert(v_rec.ambiguous_total = 300, 'venmo flagged ambiguous');
  perform assert(v_rec.unknown_method_total = 200, 'null payment method surfaced for review');
  perform assert(v_rec.crosses_threshold,     'c1 crosses the $2,000 threshold');
  perform assert(v_rec.methods like '%check%', 'methods column lists what was used: ' || v_rec.methods);
  perform assert(v_rec.methods like '%unrecorded%',
    'a null payment method surfaces as "unrecorded" on the worksheet');

  raise notice '--- conservative listing: no entity data is consulted ---';
  -- c2 would be an S-corp in reality and therefore exempt, but the app never
  -- asks. It lists them and lets the accountant strike corporations —
  -- over-listing is recoverable, a missed filing is not.
  select * into v_rec from form_1099_summary(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c2';
  perform assert(v_rec.reportable_total = 8000, 'c2 paid 8000');
  perform assert(v_rec.crosses_threshold,
    'every contractor over the threshold is listed, incorporated or not');

  select * into v_rec from form_1099_summary(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c3';
  perform assert(v_rec.crosses_threshold, 'c3 listed with zero setup required');

  raise notice '--- form_1099_summary: under threshold ---';
  select * into v_rec from form_1099_summary(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c4';
  perform assert(not v_rec.crosses_threshold, 'c4 under $2,000, not listed');

  raise notice '--- threshold is config-driven, not hard-coded ---';
  -- Drop to the pre-2026 $600 rule; c3 (3000) stays over, c4 (150) stays under,
  -- but a hypothetical 700 payment would flip. Prove the RPC reads the config.
  perform admin_update_tax_settings(2500.00, 600.00);
  select * into v_rec from form_1099_summary(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c4';
  perform assert(v_rec.threshold = 600, 'threshold is read from tax_settings');
  perform assert(not v_rec.crosses_threshold, 'c4 (150) is under $600 too');

  -- Now raise it above c3's 3000 and confirm c3 flips off.
  perform admin_update_tax_settings(2500.00, 5000.00);
  select * into v_rec from form_1099_summary(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c3';
  perform assert(v_rec.threshold = 5000, 'raised threshold applied');
  perform assert(not v_rec.crosses_threshold,
    'c3 (3000) falls below a 5000 threshold — proves no hard-coded constant');

  -- restore the real 2026 value
  perform admin_update_tax_settings(2500.00, 2000.00);

  raise notice '--- list_contractor_tax_status (the ManageUsers badge) ---';
  select * into v_rec from list_contractor_tax_status(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c3';
  perform assert(v_rec.paid_ytd = 3000, 'c3 YTD = 3000');
  perform assert(v_rec.crosses_threshold, 'c3 badge flags the 1099 threshold');

  select * into v_rec from list_contractor_tax_status(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c1';
  -- credit-card payments are excluded from the YTD badge too
  perform assert(v_rec.paid_ytd = 6200,
    'badge YTD excludes the 400 card payment (5000+700+300+200), got ' || v_rec.paid_ytd);

  select * into v_rec from list_contractor_tax_status(2026)
   where contractor_id = '00000000-0000-0000-0000-0000000000c4';
  perform assert(not v_rec.crosses_threshold, 'c4 under threshold, no flag');

  raise notice '--- there is nothing to enter, and nothing stored (by design) ---';
  -- No profile table at all: no names, no entity types, no W-9 dates, no
  -- identifiers, no documents. Zero data entry, zero sensitive storage.
  perform assert(
    to_regclass('public.contractor_tax_profiles') is null,
    'contractor_tax_profiles table does not exist');
  perform assert(
    not exists (select 1 from pg_type where typname = 'tax_entity_type'),
    'tax_entity_type enum is gone');
  perform assert(
    not exists (select 1 from pg_proc where proname = 'admin_upsert_contractor_tax_profile'),
    'there is no contractor-profile write path at all');
  perform assert(
    not exists (select 1 from storage.buckets where id = 'tax-docs'),
    'the tax-docs bucket does not exist');
  perform assert(
    not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and column_name ~* '(^|_)(tin|ssn)($|_)'),
    'no TIN/SSN column anywhere in the schema');

  raise notice '--- Schedule E lines are decoupled and editable ---';
  -- The operational categories table must carry no tax data at all.
  perform assert(
    not exists (
      select 1 from information_schema.columns
       where table_name = 'categories' and column_name like '%schedule_e%'),
    'categories carries no schedule_e column — the concepts are separate');
  perform assert(
    not exists (select 1 from pg_type where typname = 'schedule_e_line'),
    'the old schedule_e_line enum is gone — lines are rows, not a type');
  perform assert(
    (select relkind from pg_class where relname = 'category_schedule_e_map') = 'r',
    'category_schedule_e_map is a real table, not the old view');
  perform assert(
    (select count(*) from schedule_e_lines) = 15, 'the 15 IRS lines are seeded');
  perform assert(
    (select label from schedule_e_lines where code = 'auto_travel') = 'Auto & Travel',
    'seeded with the owner''s own wording, not generic IRS phrasing');
  perform assert(
    (select line_number from schedule_e_lines where code = 'other') = 19,
    'official Schedule E line numbers are stored (Other = 19)');
  perform assert(
    (select count(*) from schedule_e_lines where line_number between 5 and 19) = 15,
    'all 15 carry a line number in the 5-19 range');
  perform assert(
    (select description from schedule_e_lines where code = 'depreciation')
      = '27.5-year residential property depreciation',
    'descriptions are stored for the mapping screen');
  perform assert(
    (select line_number from schedule_e_report(2026) where line_code = 'repairs' limit 1) = 14,
    'the report carries the line number through');

  -- Editable: rename a seeded line and confirm the report follows.
  perform admin_upsert_schedule_e_line(
    (select id from schedule_e_lines where code = 'repairs'),
    null, 'Repairs & upkeep', null, true, null);
  perform assert(
    exists (select 1 from schedule_e_report(2026)
             where line_code = 'repairs' and line_label = 'Repairs & upkeep'),
    'renaming a line flows straight through to the report');

  -- Add a custom line, map a category to it, confirm it rolls up.
  select id into v_rec from schedule_e_lines where code = 'repairs';
  perform admin_upsert_schedule_e_line(null, null, 'HOA dues', 160, true, 'Association dues');
  perform assert(
    exists (select 1 from schedule_e_lines where code = 'hoa_dues' and not is_system),
    'a custom line can be added, with a slugged code');
  perform assert(
    (select line_number is null from schedule_e_lines where code = 'hoa_dues'),
    'a custom line has no IRS line number');
  perform assert(
    (select description from schedule_e_lines where code = 'hoa_dues') = 'Association dues',
    'a custom line keeps its description');

  perform admin_set_category_schedule_e_line(
    '00000000-0000-0000-0000-0000000000e3',
    (select id from schedule_e_lines where code = 'hoa_dues'));
  perform assert(
    exists (select 1 from schedule_e_report(2026)
             where line_code = 'hoa_dues' and total = 77),
    'mapping the previously-unmapped category routes its 77 to the new line');

  -- Guard rails on deletion.
  begin
    perform admin_delete_schedule_e_line((select id from schedule_e_lines where code = 'hoa_dues'));
    perform assert(false, 'deleting a mapped line should raise');
  exception when others then
    perform assert(sqlerrm like '%still mapped%', 'cannot delete a line categories point at');
  end;

  begin
    perform admin_delete_schedule_e_line((select id from schedule_e_lines where code = 'repairs'));
    perform assert(false, 'deleting a built-in line should raise');
  exception when others then
    perform assert(sqlerrm like '%built-in%', 'built-in lines cannot be deleted, only deactivated');
  end;

  -- Unmap, then delete the custom line cleanly.
  perform admin_set_category_schedule_e_line('00000000-0000-0000-0000-0000000000e3', null);
  perform admin_delete_schedule_e_line((select id from schedule_e_lines where code = 'hoa_dues'));
  perform assert(
    not exists (select 1 from schedule_e_lines where code = 'hoa_dues'),
    'an unmapped custom line deletes cleanly');

  -- Deactivating a line makes its categories read as unmapped, not vanish.
  perform admin_upsert_schedule_e_line(
    (select id from schedule_e_lines where code = 'supplies'), null, 'Supplies', null, false, null);
  perform assert(
    not exists (select 1 from schedule_e_report(2026) where line_code = 'supplies'),
    'a deactivated line stops resolving');
  perform assert(
    (select sum(total) from schedule_e_report(2026) where line_code is null) = 12050 + 77 + 175,
    'its money moves to unmapped rather than disappearing');
  perform admin_upsert_schedule_e_line(
    (select id from schedule_e_lines where code = 'supplies'), null, 'Supplies', null, true, null);

  raise notice '--- list_category_mappings (the mapping screen) ---';
  perform assert(
    (select count(*) from list_category_mappings()) = 3,
    'every operational category is listed, mapped or not');
  select * into v_rec from list_category_mappings() where category_name = 'Materials';
  perform assert(v_rec.line_code = 'supplies', 'mapped category reports its line');
  perform assert(v_rec.txn_count = 3, 'usage count helps prioritise, got ' || v_rec.txn_count);
  select * into v_rec from list_category_mappings() where category_name = 'Mystery Cat';
  perform assert(v_rec.line_id is null, 'unmapped category reports null line');
end $$;

-- ── Authorization: every RPC must refuse a non-admin ──────────────────────

update _test_ctx set admin = false;

do $$
declare v_n int := 0;
begin
  raise notice '--- authorization (non-admin) ---';
  begin perform get_tax_settings();                exception when others then v_n := v_n + 1; end;
  begin perform admin_update_tax_settings(1,1);    exception when others then v_n := v_n + 1; end;
  begin perform schedule_e_report(2026);           exception when others then v_n := v_n + 1; end;
  begin perform list_capital_review_queue(2026);   exception when others then v_n := v_n + 1; end;
  begin perform admin_set_capital_treatment('expense', gen_random_uuid(), 'repair');
        exception when others then v_n := v_n + 1; end;
  begin perform form_1099_summary(2026);           exception when others then v_n := v_n + 1; end;
  begin perform list_contractor_tax_status(2026);  exception when others then v_n := v_n + 1; end;
  begin perform list_schedule_e_lines();           exception when others then v_n := v_n + 1; end;
  begin perform admin_upsert_schedule_e_line(null,'x','X',1,true,null);
        exception when others then v_n := v_n + 1; end;
  begin perform admin_delete_schedule_e_line(gen_random_uuid());
        exception when others then v_n := v_n + 1; end;
  begin perform list_category_mappings();          exception when others then v_n := v_n + 1; end;
  begin perform admin_set_category_schedule_e_line(gen_random_uuid(), null);
        exception when others then v_n := v_n + 1; end;

  perform assert(v_n = 12, 'all 12 RPCs refuse a non-admin caller, got ' || v_n);
end $$;

update _test_ctx set admin = true;

select 'ALL TESTS PASSED' as result;
