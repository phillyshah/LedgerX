import { supabase } from './supabase';
import type { Household, Category } from '../types/expense';

// Households the user is a member of, via household_members.
export async function loadUserHouseholds(userId: string): Promise<Household[]> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id, households(id, name, features_enabled)')
    .eq('user_id', userId);

  return (data || [])
    .map((row) => row.households)
    .filter(Boolean) as unknown as Household[];
}

// All households (admin view).
export async function loadAllHouseholds(): Promise<Household[]> {
  const { data } = await supabase
    .from('households')
    .select('id, name, features_enabled')
    .order('name');
  return ((data as unknown) as Household[]) || [];
}

// Categories visible for a given household:
//   1. Categories explicitly mapped to this household via category_households
//   2. Truly global categories — defined as: NO entries in category_households at all.
// Note: the legacy `categories.household_id IS NULL` condition is no longer
// reliable for "global" — once an admin assigns a category to one or more
// households via the junction table, that category should disappear from
// other households even though `categories.household_id` is still NULL.
// This matches the definition used in admin UIs (ManageCategories, ExportData).
export async function loadHouseholdCategories(householdId: string): Promise<Category[]> {
  const [junctionRes, allCatRes, allChRes] = await Promise.all([
    supabase
      .from('category_households')
      .select('categories(id, name)')
      .eq('household_id', householdId),
    supabase
      .from('categories')
      .select('id, name')
      .order('name'),
    supabase
      .from('category_households')
      .select('category_id'),
  ]);

  // Any category with at least one entry in category_households is scoped — not global.
  const scopedIds = new Set(
    ((allChRes.data || []) as Array<{ category_id: string }>).map((r) => r.category_id),
  );

  const junctionCats = (junctionRes.data || [])
    .map((r) => r.categories)
    .filter(Boolean) as unknown as Category[];

  const trulyGlobal = (((allCatRes.data as unknown) as Category[]) || [])
    .filter((c) => !scopedIds.has(c.id));

  const seen = new Set<string>();
  return [...junctionCats, ...trulyGlobal]
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
