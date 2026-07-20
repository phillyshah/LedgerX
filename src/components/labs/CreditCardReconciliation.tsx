import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useAuth } from '../../contexts/AuthContext';
import { useReconciliationCandidates } from '../../hooks/useReconciliationCandidates';
import { loadAllHouseholds } from '../../lib/queries';
import type { Household } from '../../types/expense';
import { StatementList, type StatementSummary } from './StatementList';
import { StatementUpload } from './StatementUpload';
import { StatementReconcile } from './StatementReconcile';

const ReconciliationReport = lazy(() => import('./ReconciliationReport').then((m) => ({ default: m.ReconciliationReport })));

interface CreditCardReconciliationProps {
  openLineItemId?: string | null;
  onLineItemHandled?: () => void;
}

type View = 'list' | 'upload' | { reconcile: StatementSummary };

export function CreditCardReconciliation({ openLineItemId, onLineItemHandled }: CreditCardReconciliationProps) {
  const { t } = useT();
  const { isAdmin } = useAuth();
  const [statements, setStatements] = useState<StatementSummary[]>([]);
  const [allHouseholds, setAllHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [showReport, setShowReport] = useState(false);

  // Labs-enrolled households an admin can tag a statement with (same source
  // + filter StatementUpload uses for its upload-time picker).
  useEffect(() => {
    loadAllHouseholds().then((hh) =>
      setAllHouseholds(hh.filter((h) => h.features_enabled?.labs_cc_reconciliation))
    );
  }, []);

  // Candidate pool spans every participating property (all households for a
  // full admin; every Labs-flagged household for a household admin) UNLESS
  // the open statement has one or more assigned households (statement_households,
  // set at upload time), in which case the RPC narrows to just those — loaded
  // via a SECURITY DEFINER RPC since matching generally can't be scoped to the
  // reconciling admin's own households alone. candidatesRefreshKey bumps after
  // an inbox-sourced match creates a brand new expense, so it shows up here
  // (vendor/undo UI) without a full remount.
  const [candidatesRefreshKey, setCandidatesRefreshKey] = useState(0);
  const currentStatementId = typeof view === 'object' ? view.reconcile.id : null;
  const { candidates: candidateExpenses } = useReconciliationCandidates(true, currentStatementId, candidatesRefreshKey);

  const loadStatements = useCallback(async () => {
    setLoading(true);
    const [{ data: rows }, { data: itemCounts }, { data: householdLinks }] = await Promise.all([
      supabase.from('credit_card_statements').select('*').order('created_at', { ascending: false }),
      supabase.from('statement_line_items').select('statement_id, matched_expense_id'),
      supabase.from('statement_households').select('statement_id, household_id, households(name)'),
    ]);

    const counts = new Map<string, { total: number; matched: number }>();
    for (const item of itemCounts ?? []) {
      const entry = counts.get(item.statement_id) ?? { total: 0, matched: 0 };
      entry.total += 1;
      if (item.matched_expense_id) entry.matched += 1;
      counts.set(item.statement_id, entry);
    }

    // Two parallel maps off the same join: names for the "Scoped to" label,
    // ids to seed the edit-households modal.
    const householdNames = new Map<string, string[]>();
    const householdIds = new Map<string, string[]>();
    for (const link of householdLinks ?? []) {
      const name = (link.households as unknown as { name: string } | null)?.name;
      if (name) {
        const list = householdNames.get(link.statement_id) ?? [];
        list.push(name);
        householdNames.set(link.statement_id, list);
      }
      const idList = householdIds.get(link.statement_id) ?? [];
      idList.push(link.household_id);
      householdIds.set(link.statement_id, idList);
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
        householdNames: householdNames.get(r.id) ?? [],
        householdIds: householdIds.get(r.id) ?? [],
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatements();
  }, [loadStatements]);

  // Deep-link from a comment notification: resolve the line item's statement,
  // then open its reconcile view (StatementReconcile then preselects the line
  // item and opens its comments).
  useEffect(() => {
    if (!openLineItemId || statements.length === 0) return;
    let cancelled = false;
    supabase
      .from('statement_line_items')
      .select('statement_id')
      .eq('id', openLineItemId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const s = statements.find((x) => x.id === data.statement_id);
        if (s) setView({ reconcile: s });
      });
    return () => { cancelled = true; };
  }, [openLineItemId, statements]);

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

  // Retag which properties a statement covers. statement_households has a
  // composite PK (statement_id, household_id) and admin-write RLS, so the
  // clean pattern is delete-all-for-statement then insert the new set.
  const handleEditHouseholds = async (statementId: string, householdIds: string[]): Promise<boolean> => {
    const { error: delErr } = await supabase.from('statement_households').delete().eq('statement_id', statementId);
    if (delErr) return false;
    if (householdIds.length > 0) {
      const { error: insErr } = await supabase.from('statement_households').insert(
        householdIds.map((household_id) => ({ statement_id: statementId, household_id }))
      );
      if (insErr) return false;
    }
    await loadStatements();
    return true;
  };

  const priorCardLabels = [...new Set(statements.map((s) => s.card_label))];

  return (
    <div>
      {loading ? (
        <div className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      ) : view === 'list' ? (
        <StatementList
          statements={statements}
          isAdmin={isAdmin}
          allHouseholds={allHouseholds}
          onUpload={() => setView('upload')}
          onReconcile={(s) => setView({ reconcile: s })}
          onDelete={handleDelete}
          onRename={handleRename}
          onEditHouseholds={handleEditHouseholds}
          onOpenReport={isAdmin ? () => setShowReport(true) : undefined}
        />
      ) : typeof view === 'object' ? (
        <StatementReconcile
          statementId={view.reconcile.id}
          cardLabel={view.reconcile.card_label}
          scopedHouseholdNames={view.reconcile.householdNames}
          candidateExpenses={candidateExpenses}
          onBack={() => { setView('list'); loadStatements(); onLineItemHandled?.(); }}
          openLineItemId={openLineItemId}
          isAdmin={isAdmin}
          onCandidateCreated={() => setCandidatesRefreshKey((k) => k + 1)}
        />
      ) : null}

      {showReport && (
        <Suspense fallback={null}>
          <ReconciliationReport onClose={() => setShowReport(false)} />
        </Suspense>
      )}

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
