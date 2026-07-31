-- Assertions for 20260717000000_whatsapp_integration.sql.
--
-- Run against a database that has already had whatsapp_harness.sql and then
-- the migration applied (twice — idempotency is one of the things under test).
--
-- Each block RAISEs on failure, so a clean run that prints only the NOTICE
-- lines means everything passed.

\set ON_ERROR_STOP on

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),   -- recipient
  ('aaaaaaaa-0000-0000-0000-000000000002');   -- actor
insert into user_profiles (id, username, preferred_language) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'recipient', 'pt-BR'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'actor', 'en');
insert into households (id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Oak House');

-- ── 1. Schema landed ────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.tables
      where table_schema = 'public'
        and table_name in ('user_phone_numbers','whatsapp_sessions',
                           'whatsapp_inbound_dedup','whatsapp_outbox')) <> 4 then
    raise exception 'expected all four whatsapp tables';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'user_profiles' and column_name = 'notify_channel') then
    raise exception 'user_profiles.notify_channel missing';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('resolve_sender_phone','touch_phone_inbound',
                          'reset_channel_on_phone_removal','set_notify_channel',
                          'enqueue_whatsapp_notification','claim_whatsapp_outbox',
                          'finish_whatsapp_outbox','purge_whatsapp_dedup',
                          'whatsapp_bot_context')) <> 9 then
    raise exception 'expected all nine whatsapp functions';
  end if;

  if (select count(*) from pg_trigger
      where tgname in ('phone_removal_resets_channel','notifications_enqueue_whatsapp')) <> 2 then
    raise exception 'expected both whatsapp triggers';
  end if;
  raise notice 'PASS 1 — schema, functions and triggers all present after two runs';
end $$;

-- ── 2. The cron drain is NOT scheduled here, and that is the point ──────────
-- This local database has no pg_cron, so section 10 takes its first early
-- RETURN. Everything above it still applied — which is exactly the failure
-- mode the loud WARNING now exists to make visible.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'harness assumption broken: pg_cron is installed';
  end if;
  raise notice 'PASS 2 — migration completed with the drain unscheduled (the silent-skip path)';
end $$;

-- ── 3. E.164 constraint ─────────────────────────────────────────────────────
do $$
begin
  begin
    insert into user_phone_numbers (user_id, phone)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '4155551234');
    raise exception 'a non-E.164 phone was accepted';
  exception when check_violation then null;
  end;

  insert into user_phone_numbers (user_id, phone, label)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '+14155551234', 'Personal');

  begin
    insert into user_phone_numbers (user_id, phone)
    values ('aaaaaaaa-0000-0000-0000-000000000002', '+14155551234');
    raise exception 'the same phone was linked to two users';
  exception when unique_violation then null;
  end;
  raise notice 'PASS 3 — phone format enforced and numbers are globally unique';
end $$;

-- ── 4. resolve_sender_phone / touch_phone_inbound ──────────────────────────
do $$
declare v_uid uuid; v_before timestamptz; v_after timestamptz;
begin
  if resolve_sender_phone('+14155551234') <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'resolve_sender_phone did not find the linked user';
  end if;
  if resolve_sender_phone('+19998887777') is not null then
    raise exception 'resolve_sender_phone resolved an unlinked number';
  end if;

  select last_inbound_at into v_before from user_phone_numbers where phone = '+14155551234';
  perform touch_phone_inbound('+14155551234');
  select last_inbound_at into v_after from user_phone_numbers where phone = '+14155551234';
  if v_before is not null or v_after is null then
    raise exception 'touch_phone_inbound did not stamp last_inbound_at';
  end if;
  raise notice 'PASS 4 — sender resolution and the 24h-window stamp both work';
end $$;

-- ── 5. set_notify_channel guards ────────────────────────────────────────────
do $$
begin
  update _test_ctx set uid = 'aaaaaaaa-0000-0000-0000-000000000001';

  begin
    perform set_notify_channel('carrier-pigeon');
    raise exception 'an invalid channel was accepted';
  exception when others then
    if sqlerrm not like 'Invalid channel%' then raise; end if;
  end;

  perform set_notify_channel('whatsapp');
  if (select notify_channel from user_profiles
      where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 'whatsapp' then
    raise exception 'set_notify_channel did not persist';
  end if;

  -- User 2 has no linked phone, so 'whatsapp' (email fully suppressed) must
  -- be refused — otherwise they would be unreachable on every channel.
  update _test_ctx set uid = 'aaaaaaaa-0000-0000-0000-000000000002';
  begin
    perform set_notify_channel('whatsapp');
    raise exception 'whatsapp-only was allowed with no linked phone';
  exception when others then
    if sqlerrm not like 'No WhatsApp number linked%' then raise; end if;
  end;
  perform set_notify_channel('both');   -- allowed: email still flows
  raise notice 'PASS 5 — channel validation, and whatsapp-only needs a linked phone';
end $$;

-- ── 6. Fan-out trigger ──────────────────────────────────────────────────────
do $$
declare v_payload jsonb;
begin
  insert into notifications (user_id, actor_id, kind, entity_type, entity_id, household_id, title)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
          'invoice_created', 'contractor_invoice', gen_random_uuid(),
          'bbbbbbbb-0000-0000-0000-000000000001', 'INV-42');

  select payload into v_payload from whatsapp_outbox
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

  if v_payload is null then
    raise exception 'notification did not fan out to whatsapp_outbox';
  end if;
  if v_payload->>'kind' <> 'invoice_created' or v_payload->>'title' <> 'INV-42' then
    raise exception 'payload lost kind/title: %', v_payload;
  end if;
  if v_payload->>'actor_username' <> 'actor' then
    raise exception 'payload should carry the username, got: %', v_payload->>'actor_username';
  end if;
  if v_payload->>'lang' <> 'pt-BR' then
    raise exception 'payload should carry the recipient language, got: %', v_payload->>'lang';
  end if;
  raise notice 'PASS 6 — notifications fan out with kind, title, username and language';
end $$;

-- ── 7. Email-only users are never queued ────────────────────────────────────
do $$
declare v_count int;
begin
  update user_profiles set notify_channel = 'email'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into v_count from whatsapp_outbox;
  insert into notifications (user_id, kind, title)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'invoice_paid', 'INV-43');

  if (select count(*) from whatsapp_outbox) <> v_count then
    raise exception 'an email-only user was queued for WhatsApp';
  end if;

  update user_profiles set notify_channel = 'whatsapp'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  -- …and 'both' with no phone must not queue either: there is nowhere to send.
  select count(*) into v_count from whatsapp_outbox;
  insert into notifications (user_id, kind, title)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'invoice_paid', 'INV-44');
  if (select count(*) from whatsapp_outbox) <> v_count then
    raise exception 'a user with no linked phone was queued';
  end if;
  raise notice 'PASS 7 — email-only and phone-less users are never queued';
end $$;

-- ── 8. claim / finish lifecycle ─────────────────────────────────────────────
do $$
declare v_id uuid; v_status text; v_attempts int; v_next timestamptz;
begin
  select id into v_id from whatsapp_outbox where status = 'pending' order by created_at limit 1;

  perform claim_whatsapp_outbox(10);
  select attempts, next_attempt_at into v_attempts, v_next from whatsapp_outbox where id = v_id;
  if v_attempts <> 1 then raise exception 'claim did not increment attempts'; end if;
  if v_next <= now() then raise exception 'claim did not lease the row forward'; end if;

  -- A first failure requeues rather than giving up.
  perform finish_whatsapp_outbox(v_id, 'failed', 'Twilio 500');
  select status into v_status from whatsapp_outbox where id = v_id;
  if v_status <> 'pending' then raise exception 'an early failure should requeue, got %', v_status; end if;
  if (select last_error from whatsapp_outbox where id = v_id) <> 'Twilio 500' then
    raise exception 'last_error was not recorded';
  end if;

  -- 'skipped' is terminal immediately — outside the 24h window is not a
  -- transient error and must never be retried into oblivion.
  perform finish_whatsapp_outbox(v_id, 'skipped', 'outside 24h window');
  if (select status from whatsapp_outbox where id = v_id) <> 'skipped' then
    raise exception 'skipped should be terminal on the first call';
  end if;

  begin
    perform finish_whatsapp_outbox(v_id, 'pending');
    raise exception 'finish_whatsapp_outbox accepted a non-terminal status';
  exception when others then
    if sqlerrm not like 'Invalid outbox status%' then raise; end if;
  end;
  raise notice 'PASS 8 — lease, backoff, terminal skipped, and status validation';
end $$;

-- ── 9. Attempt cap ──────────────────────────────────────────────────────────
do $$
declare v_id uuid;
begin
  insert into whatsapp_outbox (user_id, phone, payload, attempts, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '+14155551234', '{"kind":"x"}'::jsonb, 5, 'pending')
  returning id into v_id;

  if exists (select 1 from claim_whatsapp_outbox(10) c where c.id = v_id) then
    raise exception 'a row at the attempt cap was re-claimed';
  end if;
  raise notice 'PASS 9 — rows at 5 attempts are never claimed again';
end $$;

-- ── 10. Removing the last phone resets the channel ──────────────────────────
do $$
begin
  update user_profiles set notify_channel = 'whatsapp'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  delete from user_phone_numbers where phone = '+14155551234';

  if (select notify_channel from user_profiles
      where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 'email' then
    raise exception 'unlinking the last phone left the user on whatsapp-only';
  end if;
  raise notice 'PASS 10 — unlinking the last number falls back to email';
end $$;

-- ── 11. whatsapp_bot_context ────────────────────────────────────────────────
do $$
declare v_ctx jsonb;
begin
  insert into user_roles (user_id, is_admin) values ('aaaaaaaa-0000-0000-0000-000000000002', true);
  insert into household_members (user_id, household_id)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001');

  v_ctx := whatsapp_bot_context('aaaaaaaa-0000-0000-0000-000000000002');
  if (v_ctx->>'is_admin')::boolean is not true then raise exception 'is_admin not reported'; end if;
  if v_ctx->>'username' <> 'actor' then raise exception 'username not reported'; end if;
  if v_ctx->'households'->0->>'name' <> 'Oak House' then
    raise exception 'households not reported: %', v_ctx->'households';
  end if;
  -- No real email anywhere in the context (CLAUDE.md rule).
  if v_ctx::text like '%@%' then raise exception 'bot context leaked an email address'; end if;
  raise notice 'PASS 11 — bot context carries roles/households and no email address';
end $$;

-- ── 12. Admin-only visibility on the outbox (the delivery log's backing) ────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'whatsapp_outbox' and cmd = 'SELECT' and qual like '%is_admin%'
  ) then
    raise exception 'whatsapp_outbox is missing its admin-select policy';
  end if;
  if exists (
    select 1 from pg_policies
    where tablename = 'whatsapp_outbox' and cmd <> 'SELECT'
  ) then
    raise exception 'whatsapp_outbox should have no client write policy';
  end if;
  raise notice 'PASS 12 — the delivery log reads through an admin-only SELECT policy, no client writes';
end $$;
