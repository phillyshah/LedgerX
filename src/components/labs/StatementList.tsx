import { useState } from 'react';
import { CreditCard, Plus, Edit2, Check, X, FileBarChart, Building2, Wand2 } from 'lucide-react';
import { useT } from '../../hooks/useT';
import type { Household } from '../../types/expense';
import { StatementHouseholdsModal } from './StatementHouseholdsModal';
import { DeleteButton } from '../shared/DeleteButton';

// A ring around the card icon showing match completion at a glance, so the
// list scans without reading each "X of Y matched" line individually. Colored
// by how done it is — slate at zero, amber mid-way, emerald once complete —
// with the percentage sitting right on the icon rather than off to the side.
function MatchProgressRing({ matched, total }: { matched: number; total: number }) {
  const percent = total > 0 ? Math.round((matched / total) * 100) : null;
  if (percent === null) {
    return (
      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
        <CreditCard className="w-5 h-5 text-emerald-600" />
      </div>
    );
  }

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  const ringColor = percent === 100 ? '#059669' : percent === 0 ? '#94a3b8' : '#d97706';

  return (
    <div className="relative w-10 h-10 shrink-0">
      <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="#d1fae5" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={radius} fill="none"
          stroke={ringColor} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <CreditCard className="w-4 h-4 text-emerald-600" />
      </div>
      <span
        className="absolute -bottom-1 -right-1 min-w-[22px] px-1 h-[16px] rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none shadow-sm"
        style={{ backgroundColor: ringColor }}
      >
        {percent}%
      </span>
    </div>
  );
}

export interface StatementSummary {
  id: string;
  card_label: string;
  period_start: string | null;
  period_end: string | null;
  status: 'processing' | 'ready' | 'error';
  created_at: string;
  totalItems: number;
  matchedItems: number;
  /** Households this statement was tagged with (empty = matches every enrolled property, as before). */
  householdNames: string[];
  householdIds: string[];
}

interface StatementListProps {
  statements: StatementSummary[];
  isAdmin: boolean;
  /** Labs-enrolled households an admin can tag a statement with. */
  allHouseholds: Household[];
  onUpload: () => void;
  onReconcile: (statement: StatementSummary) => void;
  onDelete: (statementId: string) => void;
  onRename: (statementId: string, newLabel: string) => Promise<boolean>;
  onEditHouseholds: (statementId: string, householdIds: string[]) => Promise<boolean>;
  /** Opens the global sweep across every statement. Available to household admins and above. */
  onAutoReconcile: () => void;
  /** Super-admin only — opens the reconciliation report. Omitted for others. */
  onOpenReport?: () => void;
}

export function StatementList({ statements, isAdmin, allHouseholds, onUpload, onReconcile, onDelete, onRename, onEditHouseholds, onAutoReconcile, onOpenReport }: StatementListProps) {
  const { t, locale } = useT();
  // Bumped to force any armed DeleteButton back to its idle state — see
  // startEdit below.
  const [disarmSignal, setDisarmSignal] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [householdsFor, setHouseholdsFor] = useState<StatementSummary | null>(null);

  const startEdit = (s: StatementSummary) => {
    // Clear any armed two-tap delete on this row — otherwise canceling out
    // of edit mode can leave the trash already armed for an unintended
    // one-tap delete on the next click.
    setDisarmSignal((n) => n + 1);
    setRenameError('');
    setEditingId(s.id);
    setEditValue(s.card_label);
  };

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) return;
    setSaving(true);
    setRenameError('');
    const ok = await onRename(editingId, editValue.trim());
    setSaving(false);
    if (ok) {
      setEditingId(null);
    } else {
      setRenameError(t('labs.cc.renameError'));
    }
  };

  const formatPeriod = (s: StatementSummary) => {
    if (!s.period_start && !s.period_end) return null;
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const start = s.period_start ? new Date(s.period_start + 'T00:00:00').toLocaleDateString(locale, opts) : '';
    const end = s.period_end ? new Date(s.period_end + 'T00:00:00').toLocaleDateString(locale, opts) : '';
    return [start, end].filter(Boolean).join(' – ');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t('labs.cc.title')}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t('labs.cc.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Still experimental (has had real bugs live) — kept admin-only,
              same as it would be under the old "Labs" area, rather than
              exposed to every household admin who can reach this screen. */}
          {statements.length > 0 && isAdmin && (
            <button
              onClick={onAutoReconcile}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all font-medium"
            >
              <Wand2 className="w-4 h-4" />
              {t('labs.cc.auto.button')}
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 rounded">
                {t('labs.cc.auto.labsBadge')}
              </span>
            </button>
          )}
          {onOpenReport && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all font-medium"
            >
              <FileBarChart className="w-4 h-4" />
              {t('labs.cc.report.button')}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onUpload}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('labs.cc.uploadStatement')}
            </button>
          )}
        </div>
      </div>

      {statements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t('labs.cc.noStatements')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {statements.map((s) => {
            const period = formatPeriod(s);
            const isEditing = editingId === s.id;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4"
              >
                {isEditing ? (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      {s.status === 'ready' ? (
                        <MatchProgressRing matched={s.matchedItems} total={s.totalItems} />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                          <CreditCard className="w-5 h-5 text-emerald-600" />
                        </div>
                      )}
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={t('labs.cc.cardLabelPlaceholder')}
                        autoFocus
                        disabled={saving}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') { setEditingId(null); setRenameError(''); }
                        }}
                        className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                      />
                    </div>
                    {renameError && (
                      <p className="text-xs text-red-600 mt-1.5 ml-[3.25rem]">{renameError}</p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => onReconcile(s)}
                    className="flex-1 text-left flex items-center gap-3 min-w-0"
                  >
                    {s.status === 'ready' ? (
                      <MatchProgressRing matched={s.matchedItems} total={s.totalItems} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <CreditCard className="w-5 h-5 text-emerald-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{s.card_label}</p>
                      <p className="text-xs text-slate-500">
                        {period ? `${period} · ` : ''}
                        {s.status === 'processing'
                          ? t('labs.cc.statusProcessing')
                          : s.status === 'error'
                          ? t('labs.cc.statusError')
                          : t('labs.cc.matchProgress', { matched: String(s.matchedItems), total: String(s.totalItems) })}
                      </p>
                      {s.householdNames.length > 0 && (
                        <p className="text-[11px] text-emerald-600 font-medium truncate mt-0.5">
                          {t('labs.cc.scopedTo', { households: s.householdNames.join(', ') })}
                        </p>
                      )}
                    </div>
                  </button>
                )}
                {isAdmin && (
                  isEditing ? (
                    <>
                      <button onClick={saveEdit} disabled={saving} className="p-2 hover:bg-green-50 rounded-lg transition-all shrink-0 disabled:opacity-50">
                        <Check className="w-4 h-4 text-green-600" />
                      </button>
                      <button onClick={() => { setEditingId(null); setRenameError(''); }} disabled={saving} className="p-2 hover:bg-slate-100 rounded-lg transition-all shrink-0 disabled:opacity-50">
                        <X className="w-4 h-4 text-slate-500" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setHouseholdsFor(s)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-all shrink-0"
                        title={t('labs.cc.editHouseholds')}
                      >
                        <Building2 className="w-4 h-4 text-slate-500" />
                      </button>
                      <button
                        onClick={() => startEdit(s)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-all shrink-0"
                        title={t('labs.cc.renameStatement')}
                      >
                        <Edit2 className="w-4 h-4 text-slate-500" />
                      </button>
                      <DeleteButton
                        variant="icon"
                        disarmSignal={disarmSignal}
                        onDelete={() => onDelete(s.id)}
                        className="shrink-0"
                      />
                    </>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {householdsFor && (
        <StatementHouseholdsModal
          cardLabel={householdsFor.card_label}
          initialHouseholdIds={householdsFor.householdIds}
          allHouseholds={allHouseholds}
          onSave={(ids) => onEditHouseholds(householdsFor.id, ids)}
          onClose={() => setHouseholdsFor(null)}
        />
      )}
    </div>
  );
}
