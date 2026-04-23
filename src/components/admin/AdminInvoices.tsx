import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { X, ChevronDown, ChevronUp, FileText, Check } from 'lucide-react';
import type { ContractorInvoice, InvoiceStatus, InvoiceImage } from '../../types/invoice';

interface HouseholdOption {
  id: string;
  name: string;
}

interface AdminInvoiceRow extends ContractorInvoice {
  household_name: string;
  submitter_username: string;
}

type StatusFilter = InvoiceStatus | 'all';

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  const styles: Record<InvoiceStatus, string> = {
    pending:  'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    paid:     'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  const labels: Record<InvoiceStatus, string> = {
    pending:  t('invoice.statusPending'),
    approved: t('invoice.statusApproved'),
    paid:     t('invoice.statusPaid'),
    rejected: t('invoice.statusRejected'),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function AdminInvoices() {
  const { t, locale } = useT();

  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');

  // Action modal
  const [actionModal, setActionModal] = useState<{
    invoice: AdminInvoiceRow;
    action: 'approve' | 'reject' | 'paid';
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Detail panel
  const [detailInvoice, setDetailInvoice] = useState<AdminInvoiceRow | null>(null);
  const [detailImages, setDetailImages] = useState<InvoiceImage[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Sort
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [hhRes, invRes, usersRes] = await Promise.all([
      supabase.from('households').select('id, name').order('name'),
      supabase.from('contractor_invoices').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_users'),
    ]);

    const hhData: HouseholdOption[] = (hhRes.data || []).map((h: HouseholdOption) => ({
      id: h.id,
      name: h.name,
    }));
    setHouseholds(hhData);

    const hhMap = new Map(hhData.map((h) => [h.id, h]));
    const usernameMap = new Map<string, string>(
      (usersRes.data || []).map((u: { id: string; username: string }) => [u.id, u.username])
    );

    const rows: AdminInvoiceRow[] = (invRes.data || []).map((inv: ContractorInvoice) => {
      const hh = inv.household_id ? hhMap.get(inv.household_id) : null;
      return {
        ...inv,
        household_name: hh?.name ?? '—',
        submitter_username: usernameMap.get(inv.created_by) ?? 'Unknown',
      };
    });

    setInvoices(rows);
    setLoading(false);
  };

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let result = invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (householdFilter !== 'all' && inv.household_id !== householdFilter) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      const diff = a.created_at.localeCompare(b.created_at);
      return sortDir === 'desc' ? -diff : diff;
    });

    return result;
  }, [invoices, statusFilter, householdFilter, sortDir]);

  // Safe date formatting — never new Date(str) directly
  const fmtDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const fmtCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

  const openActionModal = (invoice: AdminInvoiceRow, action: 'approve' | 'reject' | 'paid') => {
    setActionModal({ invoice, action });
    setActionNotes('');
    setActionError(null);
  };

  const confirmAction = async () => {
    if (!actionModal) return;
    if (actionModal.action === 'reject' && !actionNotes.trim()) {
      setActionError(t('adminInvoices.modalNotesRequired'));
      return;
    }

    setActioning(true);
    setActionError(null);

    const statusMap: Record<'approve' | 'reject' | 'paid', InvoiceStatus> = {
      approve: 'approved',
      reject:  'rejected',
      paid:    'paid',
    };

    const { error } = await supabase.rpc('admin_update_invoice_status', {
      p_invoice_id:  actionModal.invoice.id,
      p_status:      statusMap[actionModal.action],
      p_admin_notes: actionNotes.trim() || undefined,
    });

    if (error) {
      setActionError(t('adminInvoices.failedAction'));
    } else {
      setActionModal(null);
      await loadData();
    }
    setActioning(false);
  };

  const openDetail = async (inv: AdminInvoiceRow) => {
    setDetailInvoice(inv);
    setDetailImages([]);
    setSignedUrls({});
    setLoadingDetail(true);

    const { data: imgs } = await supabase
      .from('invoice_images')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('display_order');

    const images: InvoiceImage[] = imgs || [];
    setDetailImages(images);

    // Collect all paths to sign
    const allPaths = [
      ...new Set([
        inv.image_path,
        ...images.map((i) => i.image_path),
      ].filter((p): p is string => !!p))
    ];

    const urls: Record<string, string> = {};
    for (const path of allPaths) {
      const { data } = await supabase.storage
        .from('receipts')
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) urls[path] = data.signedUrl;
    }
    setSignedUrls(urls);
    setLoadingDetail(false);
  };

  const actionModalTitle: Record<'approve' | 'reject' | 'paid', string> = {
    approve: t('adminInvoices.modalApproveTitle'),
    reject:  t('adminInvoices.modalRejectTitle'),
    paid:    t('adminInvoices.modalPaidTitle'),
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">{t('adminInvoices.title')}</h2>
        <p className="text-slate-500 mt-1">{t('adminInvoices.subtitle')}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
        >
          <option value="all">{t('adminInvoices.allStatuses')}</option>
          <option value="pending">{t('invoice.statusPending')}</option>
          <option value="approved">{t('invoice.statusApproved')}</option>
          <option value="paid">{t('invoice.statusPaid')}</option>
          <option value="rejected">{t('invoice.statusRejected')}</option>
        </select>

        {/* Household */}
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

        {/* Sort toggle */}
        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all"
        >
          {t('adminInvoices.colDate')}
          {sortDir === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse h-20" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">{t('adminInvoices.noInvoices')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('adminInvoices.noInvoicesHint')}</p>
        </div>
      )}

      {/* Invoice list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Main row */}
              <button
                className="w-full text-left p-5 hover:bg-slate-50 transition-all"
                onClick={() => openDetail(inv)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono font-semibold text-slate-900 text-sm">{inv.invoice_number}</span>
                      <span className="text-xs text-slate-500">@{inv.submitter_username}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inv.household_name} · {fmtDate(inv.service_date_start)}
                      {inv.service_date_end !== inv.service_date_start && <> – {fmtDate(inv.service_date_end)}</>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="font-semibold text-slate-900 text-sm">{fmtCurrency(inv.amount, inv.currency)}</span>
                    <StatusBadge status={inv.status} t={t} />
                  </div>
                </div>
              </button>

              {/* Action buttons */}
              {(inv.status === 'pending' || inv.status === 'approved') && (
                <div className="px-5 pb-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                  {inv.status === 'pending' && (
                    <>
                      <button
                        onClick={() => openActionModal(inv, 'approve')}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        {t('adminInvoices.actionApprove')}
                      </button>
                      <button
                        onClick={() => openActionModal(inv, 'reject')}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 hover:bg-red-50 rounded-lg transition-all"
                      >
                        {t('adminInvoices.actionReject')}
                      </button>
                    </>
                  )}
                  {inv.status === 'approved' && (
                    <button
                      onClick={() => openActionModal(inv, 'paid')}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all"
                    >
                      <Check className="w-3 h-3 inline mr-1" />
                      {t('adminInvoices.actionMarkPaid')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Action Modal ── */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {actionModalTitle[actionModal.action]}
              </h3>
              <button onClick={() => setActionModal(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Invoice summary */}
            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('adminInvoices.detailInvoiceNumber')}</span>
                <span className="font-mono font-semibold">{actionModal.invoice.invoice_number}</span>
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

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('adminInvoices.modalNotesLabel')}
                {actionModal.action === 'reject' && (
                  <span className="text-red-500 ml-1">*</span>
                )}
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
              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: t('adminInvoices.detailInvoiceNumber'), value: <span className="font-mono">{detailInvoice.invoice_number}</span> },
                  { label: t('adminInvoices.detailContractor'), value: `@${detailInvoice.submitter_username}` },
                  { label: t('adminInvoices.detailProperty'), value: detailInvoice.household_name },
                  { label: t('adminInvoices.detailAmount'), value: fmtCurrency(detailInvoice.amount, detailInvoice.currency) },
                  { label: t('adminInvoices.detailStatus'), value: <StatusBadge status={detailInvoice.status} t={t} /> },
                  { label: t('adminInvoices.detailServicePeriod'), value: `${fmtDate(detailInvoice.service_date_start)} – ${fmtDate(detailInvoice.service_date_end)}` },
                  { label: t('adminInvoices.detailDueDate'), value: detailInvoice.due_date ? fmtDate(detailInvoice.due_date) : <span className="text-slate-400">—</span> },
                  { label: t('adminInvoices.detailSubmitted'), value: fmtDate(detailInvoice.created_at.split('T')[0]) },
                  ...(detailInvoice.paid_at ? [{ label: t('adminInvoices.detailPaidAt'), value: fmtDate(detailInvoice.paid_at.split('T')[0]) }] : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('adminInvoices.detailDescription')}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailInvoice.description}</p>
              </div>

              {/* Admin notes */}
              {detailInvoice.admin_notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{t('adminInvoices.detailAdminNotes')}</p>
                  <p className="text-sm text-amber-700">{detailInvoice.admin_notes}</p>
                </div>
              )}

              {/* Attachments */}
              <div>
                <p className="text-sm font-semibold text-slate-900 mb-3">{t('adminInvoices.detailAttachments')}</p>
                {loadingDetail ? (
                  <p className="text-sm text-slate-400">{t('adminInvoices.loadingImages')}</p>
                ) : Object.keys(signedUrls).length === 0 ? (
                  <p className="text-sm text-slate-400">{t('adminInvoices.detailNoAttachments')}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(signedUrls).map(([path, url]) => {
                      const isPdf = path.toLowerCase().endsWith('.pdf') ||
                        detailImages.find((i) => i.image_path === path)?.image_mime === 'application/pdf' ||
                        detailInvoice.image_mime === 'application/pdf';
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
                        <a key={path} href={url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-all">
                          <img src={url} alt="Invoice attachment" className="w-full h-32 object-cover" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* In-detail action buttons */}
              <div className="flex gap-3 pt-2">
                {detailInvoice.status === 'pending' && (
                  <>
                    <button
                      onClick={() => { openActionModal(detailInvoice, 'approve'); setDetailInvoice(null); }}
                      className="px-4 py-2.5 text-sm font-medium text-blue-700 border border-blue-300 hover:bg-blue-50 rounded-xl transition-all"
                    >
                      {t('adminInvoices.actionApprove')}
                    </button>
                    <button
                      onClick={() => { openActionModal(detailInvoice, 'reject'); setDetailInvoice(null); }}
                      className="px-4 py-2.5 text-sm font-medium text-red-700 border border-red-300 hover:bg-red-50 rounded-xl transition-all"
                    >
                      {t('adminInvoices.actionReject')}
                    </button>
                  </>
                )}
                {detailInvoice.status === 'approved' && (
                  <button
                    onClick={() => { openActionModal(detailInvoice, 'paid'); setDetailInvoice(null); }}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all"
                  >
                    {t('adminInvoices.actionMarkPaid')}
                  </button>
                )}
                <button
                  onClick={() => setDetailInvoice(null)}
                  className="ml-auto px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-all"
                >
                  {t('adminInvoices.detailClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
