import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { loadAllHouseholds } from '../../lib/queries';
import { parseExpenseDate } from '../../lib/dateUtils';
import { reuploadInboxImages } from '../../lib/inboxImages';
import {
  rankCandidates,
  isHighConfidence,
  inboxCandidateToExpense,
  type StatementLineItem,
  type MatchCandidate,
  type InboxCandidate,
} from '../../lib/statementMatching';
import type { Expense, Household } from '../../types/expense';

interface AutoReconcileProps {
  onBack: () => void;
  /** Bumped after anything is applied so the parent reloads statement counters. */
  onApplied?: () => void;
}

/** An unmatched charge from any statement the caller can see. */
interface OpenLineItem extends StatementLineItem {
  statement_id: string;
  card_label: string;
  currency: string;
  /** Households this charge's statement is tagged to. Empty = untagged. */
  household_ids: string[];
}

interface Proposal {
  item: OpenLineItem;
  candidate: MatchCandidate;
  /** Inbox rows aren't expenses yet and need a household before they can be filed. */
  source: 'expense' | 'inbox';
  /**
   * For inbox-sourced rows: the household implied by the statement's tags when
   * it covers exactly one property. Null when the statement is untagged or
   * spans several — then the user has to choose.
   */
  inferredHouseholdId: string | null;
}

/**
 * Global Auto Reconcile.
 *
 * The per-statement screen only ever considers one statement's open charges
 * against that statement's scoped pool, so clearing a backlog meant opening
 * every card in turn. This sweeps everything at once: every unmatched charge
 * across every visible statement, against every expense not yet linked to any
 * statement PLUS every pending forwarded receipt.
 *
 * Scoring is `statementMatching.ts`, untouched — the same 0.9 floor and 0.15
 * runner-up margin as the per-statement path, so both routes give the same
 * answer for the same pair.
 *
 * The one thing this can do that the per-statement flow can't: DERIVE a
 * household for a forwarded receipt. An email_inbox row carries no household,
 * but if the charge it matches sits on a statement tagged to exactly one
 * property, that property is implied — which is what makes "match it to a
 * household and a statement" a single step rather than two.
 */
export function AutoReconcile({ onBack, onApplied }: AutoReconcileProps) {
  const { t, locale } = useT();
  const [openItems, setOpenItems] = useState<OpenLineItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [inboxRows, setInboxRows] = useState<InboxCandidate[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);

  // Line-item ids the user has ticked. Seeded to everything actionable.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Manual household choice for inbox rows whose statement didn't imply one.
  const [householdChoice, setHouseholdChoice] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [itemsRes, expensesRes, inboxRes] = await Promise.all([
        supabase.rpc('list_open_statement_line_items' as never),
        supabase.rpc('list_unlinked_expenses' as never),
        supabase.rpc('list_reconciliation_inbox_candidates' as never),
      ]);

      if (itemsRes.error) {
        console.error('[auto-reconcile] open line items failed', itemsRes.error);
        setError(t('labs.cc.auto.loadError'));
        return;
      }

      setOpenItems(
        ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          statement_id: r.statement_id as string,
          card_label: r.card_label as string,
          line_date: r.line_date as string,
          description: r.description as string,
          amount: Number(r.amount),
          currency: (r.currency as string) ?? 'USD',
          matched_expense_id: null,
          household_ids: (r.household_ids as string[]) ?? [],
        })),
      );

      // A failure on either candidate source degrades the sweep rather than
      // breaking it — matching against the half that did load is still useful.
      if (expensesRes.error) {
        console.error('[auto-reconcile] unlinked expenses failed', expensesRes.error);
      }
      setExpenses(
        ((expensesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          expense_date: r.expense_date as string,
          vendor: (r.vendor as string) ?? null,
          total: Number(r.total),
          currency: (r.currency as string) ?? 'USD',
          category: (r.category as string) ?? null,
          notes: (r.notes as string) ?? null,
          transcript: (r.transcript as string) ?? null,
          household_id: (r.household_id as string) ?? null,
          household_name: (r.household_name as string) ?? undefined,
          image_path: (r.image_path as string) ?? null,
          image_mime: (r.image_mime as string) ?? null,
          image_width: (r.image_width as number) ?? null,
          image_height: (r.image_height as number) ?? null,
          created_by: r.created_by as string,
          submitter_username: (r.submitter_username as string) ?? undefined,
          paid_at: (r.paid_at as string) ?? null,
        })) as Expense[],
      );

      // Household admins only see inbox rows from their own household members;
      // a non-eligible caller gets an empty list rather than an error.
      if (inboxRes.error) {
        console.error('[auto-reconcile] inbox candidates failed', inboxRes.error);
      }
      // Mapped field-by-field with explicit numeric coercion, matching
      // useReconciliationInboxCandidates.ts's treatment of this exact RPC —
      // a raw cast trusts the RPC's numeric columns to already be JS numbers,
      // which PostgREST does not always guarantee.
      setInboxRows(
        ((inboxRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          from_email: r.from_email as string,
          subject: (r.subject as string | null) ?? null,
          received_at: r.received_at as string,
          attachment_paths: ((r.attachment_paths as string[] | null) ?? []) as string[],
          vendor: (r.vendor as string | null) ?? null,
          total: Number(r.total),
          expense_date: r.expense_date as string,
          notes: (r.notes as string | null) ?? null,
          submitter_user_id: r.submitter_user_id as string,
          submitter_username: (r.submitter_username as string | null) ?? null,
        })),
      );
    } catch (e) {
      // A genuinely thrown/rejected promise (network failure, a JWT causing
      // supabase-js to throw instead of resolving with an error object) used
      // to propagate out of the fire-and-forget `void load()` in the effect
      // below as an unhandled rejection — setLoading(false) was never
      // reached, so the screen was stuck on the loading skeleton forever
      // with no visible signal at all. This degrades it to the same banner
      // every other failure path already shows.
      console.error('[auto-reconcile] load failed', e);
      setError(t('labs.cc.auto.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { loadAllHouseholds().then(setHouseholds); }, []);

  const inboxById = useMemo(
    () => new Map(inboxRows.map((r) => [r.id, r])),
    [inboxRows],
  );

  // One pool, duck-typed: inbox rows are shaped into Expense so the existing
  // scorer handles both without a second code path.
  const pool = useMemo<Expense[]>(
    () => [...expenses, ...inboxRows.map(inboxCandidateToExpense)],
    [expenses, inboxRows],
  );

  const { proposals, unmatchedItems, contested } = useMemo(() => {
    const scored: Array<{ item: OpenLineItem; candidate: MatchCandidate }> = [];
    for (const item of openItems) {
      const ranked = rankCandidates(item, pool);
      if (isHighConfidence(ranked)) scored.push({ item, candidate: ranked[0] });
    }

    // Going global multiplies collisions: the same expense can be the best
    // match for charges on two different cards. The DB would reject the loser
    // (unique index on matched_expense_id) and the UI would show nothing about
    // it, so resolve here — strongest score claims the expense, the rest fall
    // through to manual review and are reported as contested.
    scored.sort((a, b) => b.candidate.score - a.candidate.score);
    const claimed = new Set<string>();
    const accepted: Proposal[] = [];
    const contestedItems: OpenLineItem[] = [];

    for (const s of scored) {
      const expenseId = s.candidate.expense.id;
      if (claimed.has(expenseId)) {
        contestedItems.push(s.item);
        continue;
      }
      claimed.add(expenseId);
      const isInbox = inboxById.has(expenseId);
      accepted.push({
        item: s.item,
        candidate: s.candidate,
        source: isInbox ? 'inbox' : 'expense',
        inferredHouseholdId:
          isInbox && s.item.household_ids.length === 1 ? s.item.household_ids[0] : null,
      });
    }

    const proposedIds = new Set(accepted.map((p) => p.item.id));
    return {
      proposals: accepted,
      contested: contestedItems,
      unmatchedItems: openItems.filter((i) => !proposedIds.has(i.id)),
    };
  }, [openItems, pool, inboxById]);

  // Resolve the household a proposal will file into: explicit choice wins,
  // then the statement-implied one.
  const householdFor = useCallback(
    (p: Proposal): string | null => {
      if (p.source === 'expense') return p.candidate.expense.household_id ?? null;
      return householdChoice.get(p.item.id) ?? p.inferredHouseholdId;
    },
    [householdChoice],
  );

  // Default every actionable proposal to ticked. An inbox row with no household
  // yet is deliberately left unticked — it can't be applied until one is chosen,
  // and pre-ticking it would make "Apply 6" silently apply 5.
  useEffect(() => {
    setSelected(new Set(proposals.filter((p) => householdFor(p) !== null).map((p) => p.item.id)));
  }, [proposals, householdFor]);

  const selectedProposals = proposals.filter((p) => selected.has(p.item.id));
  const applicable = selectedProposals.filter((p) => householdFor(p) !== null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = proposals.length > 0 && selected.size === proposals.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(proposals.map((p) => p.item.id)));

  const apply = async () => {
    if (applicable.length === 0) return;
    setApplying(true);
    setError('');
    setNotice('');

    const expenseSourced = applicable.filter((p) => p.source === 'expense');
    const inboxSourced = applicable.filter((p) => p.source === 'inbox');
    let applied = 0;
    const problems: string[] = [];

    // Real expenses go in one round trip.
    if (expenseSourced.length > 0) {
      const { data, error: rpcError } = await supabase.rpc('bulk_match_statement_line_items', {
        p_matches: expenseSourced.map((p) => ({
          line_item_id: p.item.id,
          expense_id: p.candidate.expense.id,
        })),
      });
      if (rpcError) {
        problems.push(rpcError.message);
      } else {
        const result = data as { matched?: number; skipped?: Array<{ reason: string }> } | null;
        applied += result?.matched ?? 0;
        const skipped = result?.skipped?.length ?? 0;
        // The RPC reports partial failure per pair; discarding it would make a
        // half-applied batch look complete.
        if (skipped > 0) problems.push(t('labs.cc.autoMatchSkipped', { count: String(skipped) }));
      }
    }

    // Inbox rows go one at a time: each has to have its attachments re-uploaded
    // under the destination household before the RPC can create the expense.
    for (const p of inboxSourced) {
      const inboxRow = inboxById.get(p.candidate.expense.id);
      const householdId = householdFor(p);
      if (!inboxRow || !householdId) continue;
      try {
        const images = await reuploadInboxImages(inboxRow.attachment_paths, householdId);
        const { error: rpcError } = await supabase.rpc('match_inbox_item_to_line_item', {
          p_line_item_id: p.item.id,
          p_inbox_id: inboxRow.id,
          p_household_id: householdId,
          p_category: null,
          p_images: images,
        });
        if (rpcError) throw rpcError;
        applied += 1;
      } catch (e) {
        problems.push(`${inboxRow.vendor ?? inboxRow.subject ?? inboxRow.id}: ${(e as Error).message}`);
      }
    }

    setApplying(false);
    setNotice(t('labs.cc.auto.applied', { count: String(applied) }));
    if (problems.length > 0) setError(problems.join(' · '));
    onApplied?.();
    await load();
  };

  const formatAmount = (amount: number, currency = 'USD') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  const formatDate = (dateString: string) =>
    parseExpenseDate(dateString).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const householdName = (id: string | null) =>
    households.find((h) => h.id === id)?.name ?? '';

  if (loading) {
    return <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">{t('labs.cc.auto.title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('labs.cc.auto.scanned', {
              charges: String(openItems.length),
              receipts: String(pool.length),
            })}
          </p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{t('labs.cc.auto.noneFound')}</p>
          {openItems.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">
              {t('labs.cc.auto.stillOpen', { count: String(openItems.length) })}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 rounded accent-emerald-600"
              />
              {t('labs.cc.auto.selectAll', { count: String(proposals.length) })}
            </label>
            <button
              onClick={apply}
              disabled={applying || applicable.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {t('labs.cc.auto.apply', { count: String(applicable.length) })}
            </button>
          </div>

          {/* Wide content scrolls inside its own container so the page body
              never scrolls sideways on a narrow screen. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="w-10 px-4 py-2" />
                  <th className="px-3 py-2 font-semibold">{t('labs.cc.auto.colCharge')}</th>
                  <th className="px-3 py-2 font-semibold">{t('labs.cc.auto.colCard')}</th>
                  <th className="px-3 py-2 font-semibold">{t('labs.cc.auto.colMatch')}</th>
                  <th className="px-3 py-2 font-semibold">{t('labs.cc.auto.colHousehold')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t('labs.cc.auto.colConfidence')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proposals.map((p) => {
                  const resolved = householdFor(p);
                  const needsHousehold = p.source === 'inbox' && !resolved;
                  return (
                    <tr
                      key={p.item.id}
                      className={needsHousehold ? 'bg-amber-50/50' : 'hover:bg-slate-50/60 transition-colors'}
                    >
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(p.item.id)}
                          onChange={() => toggle(p.item.id)}
                          disabled={needsHousehold}
                          className="w-4 h-4 rounded accent-emerald-600 disabled:opacity-40"
                          aria-label={p.item.description}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-slate-900 leading-snug">{p.item.description}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatDate(p.item.line_date)} · {formatAmount(p.item.amount, p.item.currency)}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-slate-600">{p.item.card_label}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="text-slate-900 leading-snug">
                          {p.candidate.expense.vendor || t('labs.cc.auto.noVendor')}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatDate(p.candidate.expense.expense_date)} ·{' '}
                          {formatAmount(Number(p.candidate.expense.total), p.candidate.expense.currency)}
                        </div>
                        {p.source === 'inbox' && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                            {t('labs.cc.auto.fromInbox')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {p.source === 'expense' ? (
                          <span className="text-slate-600">
                            {p.candidate.expense.household_name ?? householdName(resolved)}
                          </span>
                        ) : needsHousehold ? (
                          <select
                            value={householdChoice.get(p.item.id) ?? ''}
                            onChange={(e) =>
                              setHouseholdChoice((prev) => new Map(prev).set(p.item.id, e.target.value))
                            }
                            className="w-full max-w-[180px] px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">{t('labs.cc.inbox.pickHousehold')}</option>
                            {households.map((h) => (
                              <option key={h.id} value={h.id}>{h.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-600">
                            {householdName(resolved)}
                            {p.inferredHouseholdId && !householdChoice.has(p.item.id) && (
                              <span
                                className="block text-[10px] text-emerald-600 mt-0.5"
                                title={t('labs.cc.auto.inferredHint')}
                              >
                                {t('labs.cc.auto.inferred')}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="w-3.5 h-3.5" />
                          {Math.round(p.candidate.score * 100)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* What the sweep could NOT place. Reporting this is the difference
          between "here's what I did" and "here's where you actually stand". */}
      {(unmatchedItems.length > 0 || contested.length > 0) && (
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowUnmatched((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
          >
            <span className="text-sm font-semibold text-slate-700">
              {t('labs.cc.auto.unmatchedTitle', { count: String(unmatchedItems.length) })}
            </span>
            {showUnmatched ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {showUnmatched && (
            <div className="border-t border-slate-100">
              {contested.length > 0 && (
                <p className="px-4 py-2.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                  {t('labs.cc.auto.contestedNote', { count: String(contested.length) })}
                </p>
              )}
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {unmatchedItems.map((i) => (
                  <li key={i.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800 truncate">{i.description}</span>
                      <span className="block text-xs text-slate-400">
                        {formatDate(i.line_date)} · {i.card_label}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-slate-600">
                      {formatAmount(i.amount, i.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
