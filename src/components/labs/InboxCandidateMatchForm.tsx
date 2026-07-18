import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useT } from '../../hooks/useT';
import { loadAllHouseholds, loadHouseholdCategories } from '../../lib/queries';
import type { Household, Category } from '../../types/expense';

interface InboxCandidateMatchFormProps {
  onConfirm: (householdId: string, category: string) => void | Promise<void>;
  /** Omit to hide the Cancel button — some contexts (a fixed candidate row) have nothing to dismiss. */
  onCancel?: () => void;
  busy: boolean;
  error?: string;
}

/**
 * Household (required) + category (optional) mini-form shown whenever an
 * admin is about to confirm a match against a pending email-inbox receipt —
 * unlike a real expense, an inbox row carries no household yet, so this is
 * the one unavoidable extra step before it can become one. Used both inline
 * on an inbox-sourced candidate row and inside the auto-match preview.
 */
export function InboxCandidateMatchForm({ onConfirm, onCancel, busy, error }: InboxCandidateMatchFormProps) {
  const { t } = useT();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [householdId, setHouseholdId] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    loadAllHouseholds().then(setHouseholds);
  }, []);

  useEffect(() => {
    if (!householdId) {
      setCategories([]);
      return;
    }
    loadHouseholdCategories(householdId).then(setCategories);
  }, [householdId]);

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
      <select
        value={householdId}
        onChange={(e) => { setHouseholdId(e.target.value); setCategory(''); }}
        disabled={busy}
        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      >
        <option value="">{t('labs.cc.inbox.pickHousehold')}</option>
        {households.map((h) => (
          <option key={h.id} value={h.id}>{h.name}</option>
        ))}
      </select>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={busy || !householdId}
        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      >
        <option value="">{t('labs.cc.inbox.noCategory')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(householdId, category)}
          disabled={busy || !householdId}
          className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('labs.cc.inbox.confirmMatch')}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
