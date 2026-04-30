import { supabase } from './supabase';
import type { Household, Category } from '../types/expense';

// Households the user is a member of, via household_members.
export async function loadUserHouseholds(userId: string): Promise<Household[]> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id, households(id, name)')
    .eq('user_id', userId);

  return (data || [])
    .map((row) => row.households)
    .filter(Boolean) as unknown as Household[];
}

// All households (admin view).
export async function loadAllHouseholds(): Promise<Household[]> {
  const { data } = await supabase
    .from('households')
    .select('id, name')
    .order('name');
  return (data as Household[]) || [];
}

// Categories visible for a given household: junction-assigned + global (household_id IS NULL).
export async function loadHouseholdCategories(householdId: string): Promise<Category[]> {
  const [junctionRes, globalRes] = await Promise.all([
    supabase
      .from('category_households')
      .select('categories(id, name)')
      .eq('household_id', householdId),
    supabase
      .from('categories')
      .select('id, name')
      .is('household_id', null)
      .order('name'),
  ]);

  const junctionCats = (junctionRes.data || [])
    .map((r) => r.categories)
    .filter(Boolean) as unknown as Category[];
  const globalCats = (globalRes.data as Category[]) || [];

  const seen = new Set<string>();
  return [...junctionCats, ...globalCats]
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
