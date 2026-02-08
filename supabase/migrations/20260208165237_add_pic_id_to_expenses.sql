/*
  # Add pic_id field to expenses table

  1. Changes
    - Add `pic_id` column to expenses table (unique, generated automatically)
    - Add sequence for daily counter reset
    - Create trigger function to generate pic_id in format YYMMDD-XXXX
    - Backfill pic_id for existing expenses based on created_at date
  
  2. pic_id Format
    - YYMMDD-XXXX where:
      - YY = two-digit year
      - MM = two-digit month
      - DD = two-digit day
      - XXXX = four-digit sequential number for that day (0001, 0002, etc.)
  
  3. Notes
    - pic_id is generated automatically on insert
    - Each day starts counting from 0001
    - pic_id is unique across all expenses
*/

-- Add pic_id column to expenses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'pic_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN pic_id text UNIQUE;
  END IF;
END $$;

-- Create function to generate pic_id
CREATE OR REPLACE FUNCTION generate_pic_id(expense_date date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  date_prefix text;
  daily_count integer;
  new_pic_id text;
BEGIN
  -- Format: YYMMDD
  date_prefix := to_char(expense_date, 'YYMMDD');
  
  -- Get count of expenses for this date
  SELECT COUNT(*) + 1
  INTO daily_count
  FROM expenses
  WHERE pic_id LIKE date_prefix || '-%';
  
  -- Generate pic_id with 4-digit counter
  new_pic_id := date_prefix || '-' || lpad(daily_count::text, 4, '0');
  
  -- Check for uniqueness and increment if needed
  WHILE EXISTS (SELECT 1 FROM expenses WHERE pic_id = new_pic_id) LOOP
    daily_count := daily_count + 1;
    new_pic_id := date_prefix || '-' || lpad(daily_count::text, 4, '0');
  END LOOP;
  
  RETURN new_pic_id;
END;
$$;

-- Create trigger function to auto-generate pic_id
CREATE OR REPLACE FUNCTION set_pic_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only generate if pic_id is not already set
  IF NEW.pic_id IS NULL THEN
    NEW.pic_id := generate_pic_id(NEW.expense_date::date);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_set_pic_id ON expenses;
CREATE TRIGGER trigger_set_pic_id
  BEFORE INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION set_pic_id();

-- Backfill pic_id for existing expenses (ordered by created_at to maintain chronology)
DO $$
DECLARE
  expense_record RECORD;
BEGIN
  FOR expense_record IN 
    SELECT id, expense_date::date as exp_date
    FROM expenses
    WHERE pic_id IS NULL
    ORDER BY created_at
  LOOP
    UPDATE expenses
    SET pic_id = generate_pic_id(expense_record.exp_date)
    WHERE id = expense_record.id;
  END LOOP;
END $$;