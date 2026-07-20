import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import type { Household } from '../../types/expense';

interface StatementHouseholdsModalProps {
  cardLabel: string;
  /** Households the statement is currently tagged with. */
  initialHouseholdIds: string[];
  /** Labs-enrolled households the admin can choose from. */
  allHouseholds: Household[];
  onSave: (householdIds: string[]) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Edit which properties an EXISTING statement covers. Mirrors the chip-toggle
 * multi-select from StatementUpload, but for a statement already on file —
 * writes flow through onSave (delete-then-insert on statement_households).
 * Leaving none selected reverts the statement to the broad, all-properties
 * matching pool.
 */
export function StatementHouseholdsModal({ cardLabel, initialHouseholdIds, allHouseholds, onSave, onClose }: StatementHouseholdsModalProps) {
  const { t } = useT();
  useEscapeClose(onClose);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialHouseholdIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const ok = await onSave(selectedIds);
    setSaving(false);
    if (ok) onClose();
    else setError(t('labs.cc.editHouseholdsError'));
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">{t('labs.cc.editHouseholds')}</p>
            <p className="font-semibold text-slate-900 truncate">{cardLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all shrink-0">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-slate-500">{t('labs.cc.householdsHint')}</p>
          {allHouseholds.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">{t('labs.cc.noStatements')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allHouseholds.map((h) => {
                const selected = selectedIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => toggle(h.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                    }`}
                  >
                    {h.name}
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('common.save')}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
