import { useEffect, useState } from 'react';
import { useT } from '../../hooks/useT';
import { loadHouseholdCategories } from '../../lib/queries';
import type { Category } from '../../types/expense';

interface CategoryQuickPickerProps {
  householdId: string;
  onSave: (category: string) => void | Promise<void>;
  busy?: boolean;
}

/**
 * Inline "no category yet? pick one now" control shown on any reconciliation
 * candidate row missing a category — saves immediately via set_expense_category,
 * independent of whether/when that candidate ends up matched (see the RPC's
 * migration comment for why immediate-save beats bundling into match confirm).
 */
export function CategoryQuickPicker({ householdId, onSave, busy }: CategoryQuickPickerProps) {
  const { t } = useT();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    loadHouseholdCategories(householdId).then(setCategories);
  }, [householdId]);

  return (
    <select
      defaultValue=""
      disabled={busy}
      onChange={(e) => { if (e.target.value) onSave(e.target.value); }}
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 w-full px-2 py-1 bg-white border border-dashed border-slate-300 rounded-md text-[11px] text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
    >
      <option value="" disabled>{t('labs.cc.categorize.placeholder')}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.name}>{c.name}</option>
      ))}
    </select>
  );
}
