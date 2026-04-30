-- Feature: Transaction Templates (v6.8)
--
-- Save-as-template + template picker for both expenses and invoices.
-- Lets users one-tap-prefill recurring entries (rent, utilities, monthly
-- contractor retainers) without retyping. Templates are owner-scoped:
-- each user only sees their own. We don't share templates across a
-- household — sharing would invite "is this rent template the right
-- amount this month?" arguments. Per-user keeps responsibility clear.

CREATE TABLE IF NOT EXISTS transaction_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Templates are kind-tagged so the AddExpense picker doesn't show
  -- invoice templates (which have different fields) and vice versa.
  kind          text NOT NULL CHECK (kind IN ('expense', 'invoice')),
  name          text NOT NULL,
  household_id  uuid REFERENCES households(id) ON DELETE SET NULL,

  -- Common fields. Nullable because not every template needs every
  -- field (e.g., an expense template may set vendor + amount + category
  -- but leave the date for the user to fill in at use time).
  vendor        text,
  amount        numeric(12,2),
  currency      text NOT NULL DEFAULT 'USD',
  category      text,                  -- expense: free-text category name
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,  -- invoice: FK
  description   text,
  notes         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_templates_owner_idx
  ON transaction_templates(owner_id, kind, name);

ALTER TABLE transaction_templates ENABLE ROW LEVEL SECURITY;

-- Owner-only access. Templates aren't shared.
CREATE POLICY "Owners read own templates"
  ON transaction_templates FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners insert own templates"
  ON transaction_templates FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners update own templates"
  ON transaction_templates FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners delete own templates"
  ON transaction_templates FOR DELETE
  USING (auth.uid() = owner_id);
