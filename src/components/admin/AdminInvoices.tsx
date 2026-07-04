import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { X, ChevronDown, ChevronUp, FileText, Check, Tag, Trash2, Edit2 } from 'lucide-react';
import type { ContractorInvoice, InvoiceStatus, InvoiceImage } from '../../types/invoice';

interface HouseholdOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  household_ids: string[]; // empty array = global
}

interface AdminInvoiceRow extends ContractorInvoice {
  household_name: string;
  submitter_username: string;
  category_name: string | null;
}

type StatusFilter = InvoiceStatus | 'all';

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  const styles: Record<InvoiceStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid:    'bg-green-100 text-green-800',
  };
  const labels: Record<InvoiceStatus, string> = {
    pending: t('invoice.statusPending'),
    paid:    t('invoice.statusPaid'),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function AdminInvoices({ onAdd, openId, onOpenHandled }: {
  onAdd?: () => void;
  /** Notification deep-link: opens the matching invoice's detail once loaded. */
  openId?: string | null;
  onOpenHandled?: () => void;
}) {
  const { t, locale } = useT();
  const { isAdmin, user } = useAuth();
  // Only full admins mutate state (mark paid, assign category).
  const canMutateStatus = isAdmin;

  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit-invoice modal — single dialog for household, category, and admin
  // notes. Replaced the older category-only modal so admins can fix all three
  // editable fields without bouncing between modals.
  const [editModal, setEditModal] = useState<{ invoice: AdminInvoiceRow } | null>(null);
  const [editHouseholdPick, setEditHouseholdPick] = useState<string>('');
  const [editCategoryPick, setEditCategoryPick] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Filters + sort
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Mark-paid modal
  const [actionModal, setActionModal] = useState<{ invoice: AdminInvoiceRow } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Detail panel
  const [detailInvoice, setDetailInvoice] = useState<AdminInvoiceRow | null>(null);
  const [detailImages, setDetailImages] = useState<InvoiceImage[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [hhRes, invRes, catRes, catHhRes] = await Promise.all([
      supabase.from('households').select('id, name').order('name'),
      supabase.from('contractor_invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('category_households').select('category_id, household_id'),
    ]);

    const hhData = (hhRes.data || []) as HouseholdOption[];
    setHouseholds(hhData);
    const hhMap = new Map(hhData.map((h) => [h.id, h]));

    const catHhByCat = new Map<string, string[]>();
    for (const r of (catHhRes.data || []) as Array<{ category_id: string; household_id: string }>) {
      const arr = catHhByCat.get(r.category_id) || [];
      arr.push(r.household_id);
      catHhByCat.set(r.category_id, arr);
    }
    const catData: CategoryOption[] = ((catRes.data || []) as Array<{ id: string; name: string }>).map((c) => ({
      id: c.id, name: c.name, household_ids: catHhByCat.get(c.id) || [],
    }));
    setCategories(catData);
    const catNameMap = new Map(catData.map((c) => [c.id, c.name]));

    // admin_list_users is admin-only; household_admins fall back to user_profiles.
    let usernameMap = new Map<string, string>();
    if (isAdmin) {
      const { data: users } = await supabase.rpc('admin_list_users');
      usernameMap = new Map((users || []).map((u: { id: string; username: string }) => [u.id, u.username]));
    } else {
      const ids = Array.from(new Set(((invRes.data || []) as ContractorInvoice[]).map((i) => i.created_by)));
      if (ids.length) {
        const { data: profiles } = await supabase.from('user_profiles').select('id, username').in('id', ids);
        usernameMap = new Map((profiles || []).map((p: { id: string; username: string | null }) => [p.id, p.username || 'Unknown']));
      }
    }

    setInvoices(((invRes.data || []) as ContractorInvoice[]).map((inv) => ({
      ...inv,
      household_name: (inv.household_id && hhMap.get(inv.household_id)?.name) || '—',
      submitter_username: usernameMap.get(inv.created_by) ?? 'Unknown',
      category_name: inv.category_id ? catNameMap.get(inv.category_id) ?? null : null,
    })));
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const rows = invoices.filter((inv) =>
      (statusFilter === 'all' || inv.status === statusFilter) &&
      (householdFilter === 'all' || inv.household_id === householdFilter));
    const sign = sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => sign * a.created_at.localeCompare(b.created_at));
  }, [invoices, statusFilter, householdFilter, sortDir]);

  // Safe date formatting — never new Date(str) directly.
  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const fmtCurrency = (amt: number, ccy: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: ccy }).format(amt);

  const openActionModal = (invoice: AdminInvoiceRow) => {
    setActionModal({ invoice });
    setActionNotes('');
    setActionError(null);
  };

  const confirmAction = async () => {
    if (!actionModal) return;
    setActioning(true); setActionError(null);
    const { error } = await supabase.rpc('admin_update_invoice_status', {
      p_invoice_id: actionModal.invoice.id,
      p_status: 'paid',
      p_admin_notes: actionNotes.trim() || undefined,
    });
    if (error) setActionError(t('adminInvoices.failedAction'));
    else {
      const paidInvoiceId = actionModal.invoice.id;
      setActionModal(null);
      await loadData();
      // Fire-and-forget: notify submitter that invoice is paid
      supabase.functions.invoke('send-invoice-notification', {
        body: { type: 'paid', invoice_id: paidInvoiceId },
      }).catch(() => { /* non-critical */ });
      // Fire-and-forget: light "new activity" note to the household.
      if (user) {
        supabase.functions.invoke('send-household-activity', {
          body: { kind: 'invoice', event: 'paid', entity_id: paidInvoiceId, actor_id: user.id },
        }).catch(() => { /* non-critical */ });
      }
    }
    setActioning(false);
  };

  const openEditModal = (invoice: AdminInvoiceRow) => {
    setEditModal({ invoice });
    setEditHouseholdPick(invoice.household_id ?? '');
    setEditCategoryPick(invoice.category_id ?? '');
    setEditNotes(invoice.admin_notes ?? '');
    setEditError(null);
  };

  const confirmEdit = async () => {
    if (!editModal) return;
    setEditSaving(true);
    setEditError(null);
    const { error } = await supabase.rpc(
      'admin_update_invoice_details' as never,
      {
        p_invoice_id:   editModal.invoice.id,
        p_household_id: editHouseholdPick || null,
        p_category_id:  editCategoryPick || null,
        p_admin_notes:  editNotes.trim() ? editNotes.trim() : null,
      } as never,
    );
    if (error) {
      setEditError(t('adminInvoices.failedEdit'));
    } else {
      setEditModal(null);
      await loadData();
    }
    setEditSaving(false);
  };

  // Globals (no mappings) plus any explicitly mapped to this household.
  const categoriesForHousehold = (householdId: string | null): CategoryOption[] =>
    categories.filter((c) =>
      c.household_ids.length === 0 || (householdId !== null && c.household_ids.includes(householdId))
    );

  // Full-admin destructive action — superadmin can clear out an invoice
   // (creator-side delete is in InvoiceList). RLS gates this server-side too.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteInvoice = async (inv: AdminInvoiceRow) => {
    if (!confirm(t('invoice.confirmDelete'))) return;
    setDeletingId(inv.id);
    const { error } = await supabase.from('contractor_invoices').delete().eq('id', inv.id);
    setDeletingId(null);
    if (error) { alert(error.message); return; }
    setDetailInvoice(null);
    await loadData();
  };

  const openDetail = async (inv: AdminInvoiceRow) => {
    setDetailInvoice(inv); setDetailImages([]); setSignedUrls({}); setLoadingDetail(true);

    const { data: imgs } = await supabase
      .from('invoice_images').select('*').eq('invoice_id', inv.id).order('display_order');
    const images = (imgs || []) as InvoiceImage[];
    setDetailImages(images);

    const paths = Array.from(new Set(
      [inv.image_path, ...images.map((i) => i.image_path)].filter((p): p is string => !!p)
    ));
    const signed = await Promise.all(
      paths.map((p) => supabase.storage.from('receipts').createSignedUrl(p, 3600).then((r) => [p, r.data?.signedUrl] as const))
    );
    const urls: Record<string, string> = {};
    for (const [p, u] of signed) if (u) urls[p] = u;
    setSignedUrls(urls);
    setLoadingDetail(false);
  };

  // Deep-link from a notification: open the target invoice once it's loaded.
  // Matches against the full (unfiltered) list so an active status/household
  // filter never hides the deep-linked row.
  useEffect(() => {
    if (!openId) return;
    const match = invoices.find((inv) => inv.id === openId);
    if (match) {
      openDetail(match);
      onOpenHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, invoices]);

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('adminInvoices.title')}</h2>
          <p className="text-slate-500 mt-1">{t('adminInvoices.subtitle')}</p>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-[0.99]"
          >
            <FileText className="w-4 h-4" />
            {t('invoice.submitInvoice')}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
        >
          <option value="all">{t('adminInvoices.allStatuses')}</option>
          <option value="pending">{t('invoice.statusPending')}</option>
          <option value="paid">{t('invoice.statusPaid')}</option>
        </select>

        <select
          value={householdFilter}
          onChange={(e) => setHouseholdFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
        >
          <option value="all">{t('adminInvoices.allHouseholds')}</option>
          {households.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>

        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all"
        >
          {t('adminInvoices.colDate')}
          {sortDir === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse h-20" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">{t('adminInvoices.noInvoices')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('adminInvoices.noInvoicesHint')}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <button
                className="w-full text-left p-5 hover:bg-slate-50 transition-all"
                onClick={() => openDetail(inv)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono font-semibold text-slate-900 text-sm">{inv.invoice_number || t('invoice.noNumberPlaceholder')}</span>
                      <span className="text-xs text-slate-500">@{inv.submitter_username}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inv.household_name} · {fmtDate(inv.service_date_start)}
                      {inv.service_date_end !== inv.service_date_start && <> – {fmtDate(inv.service_date_end)}</>}
                    </p>
                    <div className="mt-1.5">
                      {inv.category_name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                          <Tag className="w-3 h-3" />
                          {inv.category_name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-500 border border-slate-200">
                          <Tag className="w-3 h-3" />
                          {t('adminInvoices.noCategory')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="font-semibold text-slate-900 text-sm">{fmtCurrency(inv.amount, inv.currency)}</span>
                    <StatusBadge status={inv.status} t={t} />
                  </div>
                </div>
              </button>

              {/* Admin actions — full admin only */}
              {canMutateStatus && (
                <div className="px-5 pb-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => openActionModal(inv)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all"
                    >
                      <Check className="w-3 h-3 inline mr-1" />
                      {t('adminInvoices.actionMarkPaid')}
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(inv)}
                    className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all"
                  >
                    <Edit2 className="w-3 h-3 inline mr-1" />
                    {t('adminInvoices.actionEdit')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Mark Paid Modal ── */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {t('adminInvoices.modalPaidTitle')}
              </h3>
              <button onClick={() => setActionModal(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminInvoices.detailInvoiceNumber')}</span>
                <span className="font-mono font-semibold">{actionModal.invoice.invoice_number || t('invoice.noNumberPlaceholder')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminInvoices.detailAmount')}</span>
                <span className="font-semibold">{fmtCurrency(actionModal.invoice.amount, actionModal.invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminInvoices.detailContractor')}</span>
                <span>@{actionModal.invoice.submitter_username}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('adminInvoices.modalNotesLabel')}
              </label>
              <textarea
                value={actionNotes}
                onChange={(e) => { setActionNotes(e.target.value); setActionError(null); }}
                rows={3}
                placeholder={t('adminInvoices.modalNotesPlaceholder')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent resize-none"
              />
              {actionError && <p className="mt-1 text-sm text-red-600">{actionError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setActionModal(null)}
                disabled={actioning}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {t('adminInvoices.modalCancel')}
              </button>
              <button
                onClick={confirmAction}
                disabled={actioning}
                className="flex-1 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {actioning ? '...' : t('adminInvoices.modalConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Panel ── */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{t('adminInvoices.detailTitle')}</h3>
              <button onClick={() => setDetailInvoice(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: t('adminInvoices.detailInvoiceNumber'), value: detailInvoice.invoice_number ? <span className="font-mono">{detailInvoice.invoice_number}</span> : <span className="text-slate-400">{t('invoice.noNumberPlaceholder')}</span> },
                  { label: t('adminInvoices.detailContractor'), value: `@${detailInvoice.submitter_username}` },
                  { label: t('adminInvoices.detailProperty'), value: detailInvoice.household_name },
                  { label: t('adminInvoices.detailCategory'), value: detailInvoice.category_name ? detailInvoice.category_name : <span className="text-slate-400">{t('adminInvoices.noCategory')}</span> },
                  { label: t('adminInvoices.detailAmount'), value: fmtCurrency(detailInvoice.amount, detailInvoice.currency) },
                  { label: t('adminInvoices.detailStatus'), value: <StatusBadge status={detailInvoice.status} t={t} /> },
                  { label: t('adminInvoices.detailServicePeriod'), value: `${fmtDate(detailInvoice.service_date_start)} – ${fmtDate(detailInvoice.service_date_end)}` },
                  { label: t('adminInvoices.detailSubmitted'), value: fmtDate(detailInvoice.created_at.split('T')[0]) },
                  ...(detailInvoice.paid_at ? [{ label: t('adminInvoices.detailPaidAt'), value: fmtDate(detailInvoice.paid_at.split('T')[0]) }] : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">{t('adminInvoices.detailDescription')}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailInvoice.description}</p>
              </div>

              {detailInvoice.admin_notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{t('adminInvoices.detailAdminNotes')}</p>
                  <p className="text-sm text-amber-700">{detailInvoice.admin_notes}</p>
                </div>
              )}

              {(() => {
                // Split attachments into primary (the invoice itself) vs.
                // work-evidence photos (contractor work-in-progress shots).
                // The legacy `image_path` on the invoice row is always
                // treated as primary even when no image_row record exists.
                const primaryPaths: string[] = [];
                const workEvidencePaths: string[] = [];
                const seen = new Set<string>();
                for (const img of detailImages) {
                  if (seen.has(img.image_path)) continue;
                  seen.add(img.image_path);
                  if (img.is_work_evidence) workEvidencePaths.push(img.image_path);
                  else primaryPaths.push(img.image_path);
                }
                if (detailInvoice.image_path && !seen.has(detailInvoice.image_path)) {
                  primaryPaths.unshift(detailInvoice.image_path);
                }
                const renderTile = (path: string, isEvidence: boolean) => {
                  const url = signedUrls[path];
                  if (!url) return null;
                  const isPdf = path.toLowerCase().endsWith('.pdf') ||
                    detailImages.find((i) => i.image_path === path)?.image_mime === 'application/pdf' ||
                    (!isEvidence && detailInvoice.image_mime === 'application/pdf');
                  return isPdf ? (
                    <a
                      key={path}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center h-32 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all gap-1 text-slate-500"
                    >
                      <FileText className="w-8 h-8 text-red-400" />
                      <span className="text-xs">{t('adminInvoices.detailClickToOpen')}</span>
                    </a>
                  ) : (
                    <a
                      key={path}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className={`block rounded-xl overflow-hidden border ${isEvidence ? 'border-amber-200' : 'border-slate-200'} hover:opacity-90 transition-all`}
                    >
                      <img src={url} alt={isEvidence ? 'Work evidence' : 'Invoice attachment'} className="w-full h-32 object-cover" />
                    </a>
                  );
                };
                return (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 mb-3">{t('adminInvoices.detailAttachments')}</p>
                      {loadingDetail ? (
                        <p className="text-sm text-slate-400">{t('adminInvoices.loadingImages')}</p>
                      ) : primaryPaths.length === 0 ? (
                        <p className="text-sm text-slate-400">{t('adminInvoices.detailNoAttachments')}</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {primaryPaths.map((p) => renderTile(p, false))}
                        </div>
                      )}
                    </div>

                    {workEvidencePaths.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-slate-900 mb-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Tag className="w-4 h-4 text-amber-600" />
                            {t('workEvidence.detailHeader')}
                          </span>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-amber-50/40 border border-amber-200 rounded-xl">
                          {workEvidencePaths.map((p) => renderTile(p, true))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="flex flex-wrap gap-3 pt-2">
                {canMutateStatus && detailInvoice.status === 'pending' && (
                  <button
                    onClick={() => { openActionModal(detailInvoice); setDetailInvoice(null); }}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all"
                  >
                    {t('adminInvoices.actionMarkPaid')}
                  </button>
                )}
                {canMutateStatus && (
                  <button
                    onClick={() => { openEditModal(detailInvoice); setDetailInvoice(null); }}
                    className="px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all"
                  >
                    <Edit2 className="w-4 h-4 inline mr-1" />
                    {t('adminInvoices.actionEditDetails')}
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => deleteInvoice(detailInvoice)}
                    disabled={deletingId === detailInvoice.id}
                    className="ml-auto px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-xl transition-all inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingId === detailInvoice.id ? t('common.deleting') : t('adminInvoices.actionDelete')}
                  </button>
                )}
                <button
                  onClick={() => setDetailInvoice(null)}
                  className={`${isAdmin ? '' : 'ml-auto '}px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-all`}
                >
                  {t('adminInvoices.detailClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Invoice Modal — household + category + admin notes ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {t('adminInvoices.editTitle')}
              </h3>
              <button onClick={() => setEditModal(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminInvoices.detailInvoiceNumber')}</span>
                <span className="font-mono font-semibold">{editModal.invoice.invoice_number || t('invoice.noNumberPlaceholder')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminInvoices.detailContractor')}</span>
                <span>@{editModal.invoice.submitter_username}</span>
              </div>
            </div>

            {/* Household */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('adminInvoices.editHousehold')}
              </label>
              <select
                value={editHouseholdPick}
                onChange={(e) => {
                  setEditHouseholdPick(e.target.value);
                  // Category list is filtered by household — clear the pick
                  // if it's no longer valid under the newly selected one.
                  if (editCategoryPick) {
                    const validUnderNew = categoriesForHousehold(e.target.value || null)
                      .some((c) => c.id === editCategoryPick);
                    if (!validUnderNew) setEditCategoryPick('');
                  }
                  setEditError(null);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              >
                {households.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {/* Category — filtered by the (possibly just-changed) household */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('adminInvoices.editCategory')}
              </label>
              <select
                value={editCategoryPick}
                onChange={(e) => { setEditCategoryPick(e.target.value); setEditError(null); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              >
                <option value="">{t('adminInvoices.editCategoryNone')}</option>
                {categoriesForHousehold(editHouseholdPick || null).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Admin notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('adminInvoices.editNotes')}
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => { setEditNotes(e.target.value); setEditError(null); }}
                rows={3}
                placeholder={t('adminInvoices.editNotesPlaceholder')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent resize-none"
              />
              <p className="mt-1 text-xs text-slate-500">{t('adminInvoices.editHint')}</p>
              {editError && <p className="mt-1 text-sm text-red-600">{editError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditModal(null)}
                disabled={editSaving}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {t('adminInvoices.modalCancel')}
              </button>
              <button
                onClick={confirmEdit}
                disabled={editSaving}
                className="flex-1 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {editSaving ? '...' : t('adminInvoices.modalConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
