/*
  # Remove hardcoded admin claim function

  The `claim_admin_role()` function accepted a hardcoded secret code
  ('ledgerx-admin-2024') to grant admin privileges. Admin role assignment
  should only happen through `admin_update_user_role()` or the
  `admin-create-user` edge function.
*/

DROP FUNCTION IF EXISTS claim_admin_role(text);
