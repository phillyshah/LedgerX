-- ============================================================
-- Migration: Household members can post in estimate chats (v11.0)
-- ============================================================
--
-- Previously only admins, the estimate's creator, and explicitly-invited
-- participants could POST messages; everyone else who could see the estimate
-- via network membership was read-only.
--
-- New rule: every NON-CONTRACTOR user who belongs to the estimate's network
-- (shares a household with the creator) can now post too. This covers regular
-- household members and household admins. Other contractors in the same
-- household remain read-only (they can view but not post) unless they are the
-- creator or were explicitly invited.
--
-- SELECT / mark-read / message-list already allow network members, so this
-- only widens INSERT.

DROP POLICY IF EXISTS "Participants post estimate messages" ON estimate_messages;
CREATE POLICY "Participants post estimate messages"
  ON estimate_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_messages.estimate_id AND e.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM estimate_participants ep
        WHERE ep.estimate_id = estimate_messages.estimate_id AND ep.user_id = auth.uid()
      )
      OR (
        -- Non-contractor member sharing a household with the creator
        NOT is_contractor()
        AND EXISTS (
          SELECT 1 FROM estimates e
          JOIN household_members hm1 ON hm1.user_id = auth.uid()
          JOIN household_members hm2 ON hm2.user_id = e.created_by
            AND hm1.household_id = hm2.household_id
          WHERE e.id = estimate_messages.estimate_id
            AND hm1.user_id <> hm2.user_id
        )
      )
    )
  );
