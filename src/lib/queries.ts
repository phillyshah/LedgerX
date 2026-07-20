import { supabase } from './supabase';
import type { Household, Category } from '../types/expense';

// Households the user is a member of, via household_members. households.id is
// a random uuid with no natural ordering, so sort alphabetically by name here
// rather than relying on whatever order the join happens to return.
export async function loadUserHouseholds(userId: string): Promise<Household[]> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id, households(id, name, features_enabled)')
    .eq('user_id', userId);

  return ((data || [])
    .map((row) => row.households)
    .filter(Boolean) as unknown as Household[])
    .sort((a, b) => a.name.localeCompare(b.name));
}

// All households (admin view).
export async function loadAllHouseholds(): Promise<Household[]> {
  const { data } = await supabase
    .from('households')
    .select('id, name, features_enabled')
    .order('name');
  return ((data as unknown) as Household[]) || [];
}

// Categories visible for a given household via a SECURITY DEFINER RPC.
// The RPC bypasses RLS on category_households (which restricts users to
// their own households) and applies the correct server-side logic:
//   - categories explicitly mapped to this household via category_households
//   - truly global categories (zero entries in category_households)
export async function loadHouseholdCategories(householdId: string): Promise<Category[]> {
  // Cast required: get_household_categories is not yet in the generated Supabase types.
  const { data } = await supabase.rpc(
    'get_household_categories' as never,
    { p_household_id: householdId } as never,
  );
  return ((data as unknown) as Category[]) || [];
}
