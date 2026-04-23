-- Relax contractor invoice fields
--
-- The product direction has shifted: contractors are submitting invoices to
-- stay organized, not to track payment due dates. And many short-form
-- invoices (handwritten, scanned receipts-as-invoices) don't carry a formal
-- invoice number, so requiring one blocks legitimate submissions.
--
-- 1. Drop the due_date column entirely (unused in UI after this change).
-- 2. Allow invoice_number to be NULL for submissions without one.

alter table contractor_invoices
  drop column if exists due_date;

alter table contractor_invoices
  alter column invoice_number drop not null;
