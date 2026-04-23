-- Add payment tracking to the expenses table
-- paid_at: when set, the expense has been marked as paid by an admin

alter table expenses
  add column if not exists paid_at timestamptz;

-- SECURITY DEFINER RPC: admin toggles paid status on any expense
create or replace function admin_mark_expense_paid(
  p_expense_id uuid,
  p_paid       boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update expenses
  set paid_at    = case when p_paid then now() else null end,
      updated_at = now()
  where id = p_expense_id;
end;
$$;
grant execute on function admin_mark_expense_paid(uuid, boolean) to authenticated;
