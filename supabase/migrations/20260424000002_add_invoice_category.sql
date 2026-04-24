-- Add category_id to contractor_invoices so super-admins can categorize
-- submitted invoices (e.g. Plumbing, Materials, Utilities). Categories are
-- global or scoped to households via the category_households table, so we
-- keep this as a nullable FK and let the UI enforce which category is
-- valid for the invoice's household.

alter table contractor_invoices
  add column if not exists category_id uuid
  references categories(id) on delete set null;

create index if not exists contractor_invoices_category_id_idx
  on contractor_invoices(category_id);

-- Admin-only RPC to set/clear a category on an invoice. Security definer so
-- it bypasses RLS after verifying the caller is a full admin.
create or replace function admin_set_invoice_category(
  p_invoice_id  uuid,
  p_category_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  update contractor_invoices
  set category_id = p_category_id,
      updated_at  = now()
  where id = p_invoice_id;
end;
$$;

grant execute on function admin_set_invoice_category(uuid, uuid) to authenticated;
