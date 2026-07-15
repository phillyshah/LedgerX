import { useRef, useState } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
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
}

export function StatementList({ statements, isAdmin, onUpload, onReconcile, onDelete }: StatementListProps) {
  const { t, locale } = useT();
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      {statements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t('labs.cc.noStatements')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {statements.map((s) => {
            const period = formatPeriod(s);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4"
              >
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
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(s.id)}
                    className={`p-2 rounded-lg transition-all shrink-0 ${
                      armedDeleteId === s.id ? 'bg-red-100' : 'hover:bg-red-50'
                    }`}
                    title={armedDeleteId === s.id ? t('labs.cc.confirmDelete') : undefined}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
