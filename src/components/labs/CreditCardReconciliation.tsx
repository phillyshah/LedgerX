import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useAuth } from '../../contexts/AuthContext';
import { useLabsAccess } from '../../hooks/useLabsAccess';
import { useReconciliationCandidates } from '../../hooks/useReconciliationCandidates';
import { StatementList, type StatementSummary } from './StatementList';
import { StatementUpload } from './StatementUpload';
import { StatementReconcile } from './StatementReconcile';
import { LabsBadge } from './LabsBadge';

interface CreditCardReconciliationProps {
  onBack: () => void;
}

type View = 'list' | 'upload' | { reconcile: StatementSummary };

export function CreditCardReconciliation({ onBack }: CreditCardReconciliationProps) {
  const { t } = useT();
  const { isAdmin } = useAuth();
  const { labsHouseholds } = useLabsAccess();
  const [statements, setStatements] = useState<StatementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');

  // Candidate pool spans every household the caller is authorized to match
  // against (all households for a full admin; the caller's Labs-flagged
  // households for a household admin) — NOT just useExpenses()'s
  // membership-scoped set, which would hide expenses in households the
  // reconciling admin doesn't personally belong to (the whole point: a
  // statement covers multiple properties).
  const labsHouseholdIds = useMemo(() => labsHouseholds.map((h) => h.id), [labsHouseholds]);
  const { candidates: candidateExpenses } = useReconciliationCandidates(true, labsHouseholdIds);

  const loadStatements = useCallback(async () => {
    setLoading(true);
    const [{ data: rows }, { data: itemCounts }] = await Promise.all([
      supabase.from('credit_card_statements').select('*').order('created_at', { ascending: false }),
      supabase.from('statement_line_items').select('statement_id, matched_expense_id'),
    ]);

    const counts = new Map<string, { total: number; matched: number }>();
    for (const item of itemCounts ?? []) {
      const entry = counts.get(item.statement_id) ?? { total: 0, matched: 0 };
      entry.total += 1;
      if (item.matched_expense_id) entry.matched += 1;
      counts.set(item.statement_id, entry);
    }

    setStatements(
      (rows ?? []).map((r) => ({
        id: r.id,
        card_label: r.card_label,
        period_start: r.period_start,
        period_end: r.period_end,
        status: r.status,
        created_at: r.created_at,
        totalItems: counts.get(r.id)?.total ?? 0,
        matchedItems: counts.get(r.id)?.matched ?? 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatements();
  }, [loadStatements]);

  const handleDelete = async (statementId: string) => {
    await supabase.from('credit_card_statements').delete().eq('id', statementId);
    await loadStatements();
  };

  const handleRename = async (statementId: string, newLabel: string): Promise<boolean> => {
    const { error } = await supabase.from('credit_card_statements').update({ card_label: newLabel }).eq('id', statementId);
    if (error) return false;
    await loadStatements();
    return true;
  };

  const priorCardLabels = [...new Set(statements.map((s) => s.card_label))];

  return (
    <div>
      {view === 'list' && (
        <div className="mb-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <LabsBadge />
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      ) : view === 'list' ? (
        <StatementList
          statements={statements}
          isAdmin={isAdmin}
          onUpload={() => setView('upload')}
          onReconcile={(s) => setView({ reconcile: s })}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      ) : typeof view === 'object' ? (
        <StatementReconcile
          statementId={view.reconcile.id}
          cardLabel={view.reconcile.card_label}
          candidateExpenses={candidateExpenses}
          onBack={() => { setView('list'); loadStatements(); }}
        />
      ) : null}

      {view === 'upload' && (
        <StatementUpload
          priorCardLabels={priorCardLabels}
          onClose={() => setView('list')}
          onSaved={() => { setView('list'); loadStatements(); }}
        />
      )}

      {statements.length === 0 && !loading && view === 'list' && !isAdmin && (
        <p className="mt-4 text-xs text-slate-400 text-center">{t('labs.cc.waitForAdmin')}</p>
      )}
    </div>
  );
}
