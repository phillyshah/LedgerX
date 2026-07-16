import { useRef, useState } from 'react';
import { CreditCard, Plus, Trash2, Edit2, Check, X, FileBarChart } from 'lucide-react';
import { useT } from '../../hooks/useT';

export interface StatementSummary {
  id: string;
  card_label: string;
  period_start: string | null;
  period_end: string | null;
  status: 'processing' | 'ready' | 'error';
  created_at: string;
  totalItems: number;
  matchedItems: number;
}

interface StatementListProps {
  statements: StatementSummary[];
  isAdmin: boolean;
  onUpload: () => void;
  onReconcile: (statement: StatementSummary) => void;
  onDelete: (statementId: string) => void;
  onRename: (statementId: string, newLabel: string) => Promise<boolean>;
  /** Super-admin only — opens the reconciliation report. Omitted for others. */
  onOpenReport?: () => void;
}

export function StatementList({ statements, isAdmin, onUpload, onReconcile, onDelete, onRename, onOpenReport }: StatementListProps) {
  const { t, locale } = useT();
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleDelete = (id: string) => {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setArmedDeleteId(null), 3000);
      return;
    }
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setArmedDeleteId(null);
    onDelete(id);
  };

  const startEdit = (s: StatementSummary) => {
    // Clear any armed two-tap delete on this row — otherwise canceling out
    // of edit mode can leave Trash2 already armed for an unintended
    // one-tap delete on the next click.
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setArmedDeleteId(null);
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
          {onOpenReport && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl transition-all font-medium"
            >
              <FileBarChart className="w-4 h-4" />
              {t('labs.cc.report.button')}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onUpload}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-all shadow-sm font-medium"
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
                      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                        <CreditCard className="w-5 h-5 text-violet-600" />
                      </div>
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
                        className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
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
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5 text-violet-600" />
                    </div>
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
                        onClick={() => startEdit(s)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-all shrink-0"
                        title={t('labs.cc.renameStatement')}
                      >
                        <Edit2 className="w-4 h-4 text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className={`p-2 rounded-lg transition-all shrink-0 ${
                          armedDeleteId === s.id ? 'bg-red-100' : 'hover:bg-red-50'
                        }`}
                        title={armedDeleteId === s.id ? t('labs.cc.confirmDelete') : undefined}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
