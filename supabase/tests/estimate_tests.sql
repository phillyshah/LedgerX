-- Assertions for 20260803000000_estimate_completion_and_links.sql.
-- Run against estimate_harness.sql + the migration. Any failure raises.

\set ON_ERROR_STOP on

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

insert into households (id, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Beach House'),
  ('00000000-0000-0000-0000-0000000000b2', 'Mountain Cabin');

insert into estimates (id, created_by, household_id, title, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b1', 'Deck rebuild', 'accepted'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2', 'Roof patch', 'open'),
  -- No household: candidate scoping must fall back to "everything".
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1',
   null, 'Unassigned job', 'accepted');

insert into expenses (id, household_id, created_by, expense_date, vendor, total, category) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1', '2026-07-10', 'Lumber Yard', 1200.00, 'Repairs'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1', '2026-07-12', '   ', 40.00, null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000a1', '2026-07-14', 'Other Property', 99.00, 'Repairs');

insert into contractor_invoices
  (id, invoice_number, created_by, household_id, amount, description, service_date_start, service_date_end)
values
  ('00000000-0000-0000-0000-0000000000d1', 'INV-1', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000b1', 5000.00, 'Deck labor', '2026-07-01', '2026-07-20'),
  ('00000000-0000-0000-0000-0000000000d2', '  ', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000b2', 300.00, 'Roof labor', '2026-07-05', '2026-07-06');

-- ── 1. The status CHECK ─────────────────────────────────────────────────────
do $$
begin
  update estimates set status = 'completed' where id = '00000000-0000-0000-0000-0000000000e1';
  perform assert(
    (select status from estimates where id = '00000000-0000-0000-0000-0000000000e1') = 'completed',
    'CHECK accepts completed');
  -- put it back for the rest of the suite
  update estimates set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000e1';
end $$;

do $$
begin
  begin
    update estimates set status = 'finished' where id = '00000000-0000-0000-0000-0000000000e1';
    perform assert(false, 'CHECK still rejects an unknown status');
  exception when check_violation then null;
  end;
end $$;

-- ── 2. amount / currency columns ────────────────────────────────────────────
do $$
begin
  perform assert(
    exists (select 1 from information_schema.columns
            where table_name = 'estimates' and column_name = 'amount'
              and data_type = 'numeric'),
    'estimates.amount exists and is numeric');
  perform assert(
    (select column_default from information_schema.columns
     where table_name = 'estimates' and column_name = 'currency') like '%USD%',
    'estimates.currency defaults to USD');
  perform assert(
    (select amount from estimates where id = '00000000-0000-0000-0000-0000000000e1') is null,
    'existing estimates read as no-quoted-amount, not zero');
end $$;

-- ── 3. admin_set_estimate_status whitelist ──────────────────────────────────
do $$
begin
  perform admin_set_estimate_status('00000000-0000-0000-0000-0000000000e1', 'completed');
  perform assert(
    (select status from estimates where id = '00000000-0000-0000-0000-0000000000e1') = 'completed',
    'RPC accepts completed');
  perform admin_set_estimate_status('00000000-0000-0000-0000-0000000000e1', 'accepted');

  begin
    perform admin_set_estimate_status('00000000-0000-0000-0000-0000000000e1', 'finished');
    perform assert(false, 'RPC rejects an unknown status');
  exception when others then
    perform assert(sqlerrm like 'invalid status%', 'rejection message names the status');
  end;
end $$;

-- ── 4. admin_update_estimate: old overload gone, amount round-trips ─────────
do $$
begin
  perform assert(
    (select count(*) from pg_proc where proname = 'admin_update_estimate') = 1,
    'exactly one admin_update_estimate remains (stale 6-arg overload dropped)');

  perform admin_update_estimate(
    '00000000-0000-0000-0000-0000000000e1', 'Deck rebuild', 'desc', 'total',
    '00000000-0000-0000-0000-0000000000b1', null, 5000.00);
  perform assert(
    (select amount from estimates where id = '00000000-0000-0000-0000-0000000000e1') = 5000.00,
    'amount round-trips through admin_update_estimate');

  -- Clearing back to "not quoted" must be possible.
  perform admin_update_estimate(
    '00000000-0000-0000-0000-0000000000e1', 'Deck rebuild', 'desc', 'total',
    '00000000-0000-0000-0000-0000000000b1', null, null);
  perform assert(
    (select amount from estimates where id = '00000000-0000-0000-0000-0000000000e1') is null,
    'amount can be cleared back to NULL');

  perform admin_update_estimate(
    '00000000-0000-0000-0000-0000000000e1', 'Deck rebuild', 'desc', 'total',
    '00000000-0000-0000-0000-0000000000b1', null, 5000.00);

  begin
    perform admin_update_estimate(
      '00000000-0000-0000-0000-0000000000e1', 'Deck rebuild', null, 'total',
      '00000000-0000-0000-0000-0000000000b1', null, -1);
    perform assert(false, 'negative amount rejected');
  exception when others then
    perform assert(sqlerrm like '%negative%', 'negative amount message');
  end;
end $$;

-- ── 5. estimate_links: exactly-one-of, and linking works ────────────────────
do $$
declare v_link uuid;
begin
  begin
    insert into estimate_links (estimate_id) values ('00000000-0000-0000-0000-0000000000e1');
    perform assert(false, 'CHECK rejects a link with neither target');
  exception when check_violation then null;
  end;

  begin
    insert into estimate_links (estimate_id, expense_id, invoice_id)
    values ('00000000-0000-0000-0000-0000000000e1',
            '00000000-0000-0000-0000-0000000000c1',
            '00000000-0000-0000-0000-0000000000d1');
    perform assert(false, 'CHECK rejects a link with both targets');
  exception when check_violation then null;
  end;

  v_link := link_estimate_item('00000000-0000-0000-0000-0000000000e1',
                               '00000000-0000-0000-0000-0000000000c1', null);
  perform assert(v_link is not null, 'link_estimate_item returns the new id');
  perform assert(
    (select count(*) from estimate_links where estimate_id = '00000000-0000-0000-0000-0000000000e1') = 1,
    'one link recorded');
  perform assert(
    (select linked_by from estimate_links where id = v_link) is not distinct from auth.uid(),
    'linked_by stamped server-side');

  perform link_estimate_item('00000000-0000-0000-0000-0000000000e1', null,
                             '00000000-0000-0000-0000-0000000000d1');
  perform link_estimate_item('00000000-0000-0000-0000-0000000000e1',
                             '00000000-0000-0000-0000-0000000000c2', null);
end $$;

-- ── 6. Double-linking is impossible ─────────────────────────────────────────
do $$
begin
  begin
    perform link_estimate_item('00000000-0000-0000-0000-0000000000e2',
                               '00000000-0000-0000-0000-0000000000c1', null);
    perform assert(false, 'a transaction cannot be linked to a second estimate');
  exception when others then
    perform assert(sqlerrm like '%already linked%', 'friendly already-linked message for a transaction');
  end;

  begin
    perform link_estimate_item('00000000-0000-0000-0000-0000000000e2', null,
                               '00000000-0000-0000-0000-0000000000d1');
    perform assert(false, 'an invoice cannot be linked to a second estimate');
  exception when others then
    perform assert(sqlerrm like '%already linked%', 'friendly already-linked message for an invoice');
  end;
end $$;

-- ── 7. Bad arguments ────────────────────────────────────────────────────────
do $$
begin
  begin
    perform link_estimate_item('00000000-0000-0000-0000-0000000000e2', null, null);
    perform assert(false, 'neither target rejected at the RPC');
  exception when others then
    perform assert(sqlerrm like '%exactly one%', 'exactly-one-of message');
  end;

  begin
    perform link_estimate_item('00000000-0000-0000-0000-0000000000e2',
                               '00000000-0000-0000-0000-0000000000c3',
                               '00000000-0000-0000-0000-0000000000d2');
    perform assert(false, 'both targets rejected at the RPC');
  exception when others then
    perform assert(sqlerrm like '%exactly one%', 'exactly-one-of message (both)');
  end;

  begin
    perform link_estimate_item('00000000-0000-0000-0000-00000000dead',
                               '00000000-0000-0000-0000-0000000000c3', null);
    perform assert(false, 'unknown estimate rejected');
  exception when others then
    perform assert(sqlerrm like '%estimate not found%', 'estimate-not-found message');
  end;

  begin
    perform link_estimate_item('00000000-0000-0000-0000-0000000000e2',
                               '00000000-0000-0000-0000-00000000dead', null);
    perform assert(false, 'unknown transaction rejected');
  exception when others then
    perform assert(sqlerrm like '%transaction not found%', 'transaction-not-found message');
  end;
end $$;

-- ── 8. list_estimate_links ──────────────────────────────────────────────────
do $$
declare r record;
begin
  perform assert(
    (select count(*) from list_estimate_links('00000000-0000-0000-0000-0000000000e1')) = 3,
    'all three links listed');
  perform assert(
    (select count(*) from list_estimate_links('00000000-0000-0000-0000-0000000000e1')
     where kind = 'invoice') = 1,
    'invoices and expenses interleaved with a kind discriminator');
  perform assert(
    (select sum(amount) from list_estimate_links('00000000-0000-0000-0000-0000000000e1')) = 6240.00,
    'matched total sums expenses + invoices (1200 + 40 + 5000)');

  -- Newest first.
  select occurred_on into r from list_estimate_links('00000000-0000-0000-0000-0000000000e1') limit 1;
  perform assert(r.occurred_on = date '2026-07-12', 'links ordered newest first');

  -- Blank vendor / invoice number fall back to an em dash rather than
  -- rendering an empty cell.
  perform assert(
    (select label from list_estimate_links('00000000-0000-0000-0000-0000000000e1')
     where item_id = '00000000-0000-0000-0000-0000000000c2') = '—',
    'blank vendor falls back to a dash');
end $$;

-- ── 9. list_estimate_link_candidates ────────────────────────────────────────
do $$
begin
  -- e2 is Mountain Cabin: only that household's unlinked rows.
  perform assert(
    (select count(*) from list_estimate_link_candidates('00000000-0000-0000-0000-0000000000e2')) = 2,
    'candidates scoped to the estimate household');
  perform assert(
    (select count(*) from list_estimate_link_candidates('00000000-0000-0000-0000-0000000000e2')
     where item_id = '00000000-0000-0000-0000-0000000000c1') = 0,
    'already-linked rows excluded from candidates');
  perform assert(
    (select count(*) from list_estimate_link_candidates('00000000-0000-0000-0000-0000000000e2')
     where kind = 'invoice') = 1,
    'invoices appear as candidates too');

  -- e3 has no household, so nothing is filtered out by household.
  perform assert(
    (select count(*) from list_estimate_link_candidates('00000000-0000-0000-0000-0000000000e3')) = 2,
    'an estimate with no household sees every unlinked row');
end $$;

-- ── 10. unlink ──────────────────────────────────────────────────────────────
do $$
declare v_link uuid;
begin
  select link_id into v_link from list_estimate_links('00000000-0000-0000-0000-0000000000e1')
   where kind = 'invoice';
  perform unlink_estimate_item(v_link);
  perform assert(
    (select count(*) from list_estimate_links('00000000-0000-0000-0000-0000000000e1')) = 2,
    'unlink removes exactly one row');
  perform assert(
    (select sum(amount) from list_estimate_links('00000000-0000-0000-0000-0000000000e1')) = 1240.00,
    'matched total recomputes after an unlink');

  -- Idempotent: unlinking again is a no-op, not an error.
  perform unlink_estimate_item(v_link);

  -- And the invoice becomes available again.
  perform assert(
    (select count(*) from list_estimate_link_candidates('00000000-0000-0000-0000-0000000000e1')
     where item_id = '00000000-0000-0000-0000-0000000000d1') = 1,
    'unlinked invoice returns to the candidate pool');
end $$;

-- ── 11. Cascades ────────────────────────────────────────────────────────────
do $$
begin
  delete from expenses where id = '00000000-0000-0000-0000-0000000000c2';
  perform assert(
    (select count(*) from estimate_links where expense_id = '00000000-0000-0000-0000-0000000000c2') = 0,
    'deleting a transaction removes its link');

  delete from estimates where id = '00000000-0000-0000-0000-0000000000e1';
  perform assert(
    (select count(*) from estimate_links
     where estimate_id = '00000000-0000-0000-0000-0000000000e1') = 0,
    'deleting an estimate cascades its links');
end $$;

-- ── 12. Every new RPC refuses a non-admin ───────────────────────────────────
update _test_ctx set admin = false, uid = '00000000-0000-0000-0000-0000000000a1';

do $$
declare
  fn text;
  fns text[] := array[
    $q$select link_estimate_item('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',null)$q$,
    $q$select unlink_estimate_item('00000000-0000-0000-0000-00000000dead')$q$,
    $q$select admin_set_estimate_status('00000000-0000-0000-0000-0000000000e2','completed')$q$,
    $q$select admin_update_estimate('00000000-0000-0000-0000-0000000000e2','t',null,'total',null,null,1)$q$
  ];
begin
  foreach fn in array fns loop
    begin
      execute fn;
      perform assert(false, 'non-admin blocked: ' || fn);
    exception when others then
      perform assert(sqlerrm = 'not authorized', 'guard message for ' || fn || ' was: ' || sqlerrm);
    end;
  end loop;

  -- The two read RPCs are SECURITY DEFINER but gate on is_admin() inside
  -- the query, so a non-admin gets zero rows rather than an error.
  perform assert(
    (select count(*) from list_estimate_links('00000000-0000-0000-0000-0000000000e2')) = 0,
    'non-admin sees no links');
  perform assert(
    (select count(*) from list_estimate_link_candidates('00000000-0000-0000-0000-0000000000e2')) = 0,
    'non-admin sees no candidates');
end $$;

update _test_ctx set admin = true, uid = null;

-- ── 13. RLS shape: no client write policy exists ────────────────────────────
do $$
begin
  perform assert(
    (select relrowsecurity from pg_class where relname = 'estimate_links'),
    'RLS enabled on estimate_links');
  perform assert(
    (select count(*) from pg_policies where tablename = 'estimate_links'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0,
    'no client INSERT/UPDATE/DELETE policy — RPC-only mutation');
  perform assert(
    (select count(*) from pg_policies where tablename = 'estimate_links' and cmd = 'SELECT') = 1,
    'exactly one SELECT policy');
end $$;

select 'estimate tests passed' as result;
