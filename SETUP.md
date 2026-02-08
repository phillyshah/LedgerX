# LedgerX Setup Guide

This guide will help you set up the database schema and storage bucket for LedgerX.

## Database Setup

Run the following SQL in your Supabase SQL Editor to create all necessary tables and Row Level Security policies:

```sql
-- Create households table
CREATE TABLE IF NOT EXISTS households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Create household_members table
CREATE TABLE IF NOT EXISTS household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_members_unique UNIQUE (household_id, user_id),
  CONSTRAINT household_members_role_check CHECK (role IN ('owner', 'member'))
);

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expense_date date NOT NULL,
  vendor text,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  category text,
  notes text,
  transcript text,
  image_path text,
  image_mime text,
  image_width int,
  image_height int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for expenses table
CREATE INDEX IF NOT EXISTS expenses_household_date_idx ON expenses(household_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_household_vendor_idx ON expenses(household_id, vendor);
CREATE INDEX IF NOT EXISTS expenses_household_category_idx ON expenses(household_id, category);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create exports table
CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT exports_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for households table
CREATE POLICY "Users can view households they are members of"
  ON households FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create households"
  ON households FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Household owners can update household"
  ON households FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
      AND household_members.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
      AND household_members.role = 'owner'
    )
  );

CREATE POLICY "Household owners can delete household"
  ON households FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
      AND household_members.role = 'owner'
    )
  );

-- RLS Policies for household_members table
CREATE POLICY "Users can view members of their households"
  ON household_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = household_members.household_id
      AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add themselves to households"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Household owners can update members"
  ON household_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = household_members.household_id
      AND hm.user_id = auth.uid()
      AND hm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = household_members.household_id
      AND hm.user_id = auth.uid()
      AND hm.role = 'owner'
    )
  );

CREATE POLICY "Users can remove themselves or owners can remove members"
  ON household_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = household_members.household_id
      AND hm.user_id = auth.uid()
      AND hm.role = 'owner'
    )
  );

-- RLS Policies for expenses table
CREATE POLICY "Household members can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = expenses.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can create expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = expenses.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = expenses.household_id
      AND household_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = expenses.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can delete expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = expenses.household_id
      AND household_members.user_id = auth.uid()
    )
  );

-- RLS Policies for exports table
CREATE POLICY "Household members can view exports"
  ON exports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = exports.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can create exports"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = exports.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can update exports"
  ON exports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = exports.household_id
      AND household_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = exports.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can delete exports"
  ON exports FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = exports.household_id
      AND household_members.user_id = auth.uid()
    )
  );
```

## Storage Setup

1. Go to Supabase Dashboard > Storage
2. Create a new bucket named `receipts`
3. Set the bucket to **Private** (not public)
4. Configure the following RLS policies for the `receipts` bucket:

### Upload Policy
```sql
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] IN (
    SELECT household_id::text FROM household_members WHERE user_id = auth.uid()
  )
);
```

### Read Policy
```sql
CREATE POLICY "Household members can view receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] IN (
    SELECT household_id::text FROM household_members WHERE user_id = auth.uid()
  )
);
```

### Delete Policy
```sql
CREATE POLICY "Household members can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] IN (
    SELECT household_id::text FROM household_members WHERE user_id = auth.uid()
  )
);
```

## Authentication Setup

The app uses Supabase email/password authentication. No additional configuration is needed - users can sign up directly through the app.

## Features

- Secure email/password authentication
- Create and manage multiple households
- Track expenses with receipts
- Upload and store receipt images securely
- Export expense data to CSV
- Full Row Level Security on all tables
- Beautiful, Apple-inspired design
