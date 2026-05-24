import { useState } from 'react';
import { useT } from '../hooks/useT';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, FileText, Tag, Trash2, FileSignature, Plus, Image as ImageIcon } from 'lucide-react';
import type { ContractorInvoice, InvoiceStatus, InvoiceImage } from '../types/invoice';

interface InvoiceListProps {
  invoices: ContractorInvoice[];
  loading: boolean;
  onReload: () => void;
  /** Optional CTA — when set, the empty state shows a primary "Submit invoice"
   *  button that calls this. Without it, the empty state stays static. */
  onAdd?: () => void;
}

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  // Prominent, solid-filled badges so the submitter can see status at a glance.
  const styles: Record<InvoiceStatus, string> = {
    pending: 'bg-amber-500 text-white ring-1 ring-amber-600/20',
    paid:    'bg-emerald-600 text-white ring-1 ring-emerald-700/20',
  };
  const dots: Record<InvoiceStatus, string> = {
    pending: 'bg-amber-200',
    paid:    'bg-emerald-200',
  };
  const labels: Record<InvoiceStatus, string> = {
    pending: t('invoice.statusPending'),
    paid:    t('invoice.statusPaid'),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

export function InvoiceList({ invoices, loading, onReload, onAdd }: InvoiceListProps) {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);

  // Detail panel state — same pattern as AdminInvoices, minus admin actions.
  const [detailInvoice, setDetailInvoice] = useState<ContractorInvoice | null>(null);
  const [detailImages, setDetailImages] = useState<InvoiceImage[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Safe date parsing — never `new Date(dateString)` directly (UTC off-by-one).
  const fmtDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };
  const fmtCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

  const openDetail = async (inv: ContractorInvoice) => {
    setDetailInvoice(inv);
    setDetailImages([]);
    setSignedUrls({});
    setLoadingDetail(true);

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

  // Submitter-only delete with two-tap confirm. RLS allows DELETE only when
  // auth.uid() = created_by (or the user is a full admin), so even if this
  // button were rendered for someone else, the row wouldn't actually go away.
  const [armedDelete, setArmedDelete] = useState(false);

  const deleteInvoice = async (inv: ContractorInvoice) => {
    if (!armedDelete) {
      setArmedDelete(true);
      setTimeout(() => setArmedDelete(false), 3000);
      return;
    }
    setArmedDelete(false);
    setDeleting(true);
    const { error } = await supabase.from('contractor_invoices').delete().eq('id', inv.id);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    setDetailInvoice(null);
    onReload();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-3 w-40 bg-slate-100 rounded" />
              </div>
              <div className="h-6 w-16 bg-slate-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 sm:p-12 shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-emerald-200/50">
          <FileSignature className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1.5">{t('invoice.noInvoicesYet')}</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">{t('invoice.noInvoicesHint')}</p>
        {onAdd && (
          <div className="mt-6">
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl transition-all shadow-sm font-medium active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              {t('invoice.emptyCta')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {invoices.map((inv) => (
          <button
            key={inv.id}
            type="button"
            onClick={() => openDetail(inv)}
            className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.995]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-slate-900 text-sm">
                    {inv.invoice_number || t('invoice.noNumberPlaceholder')}
                  </span>
                  {inv.household_name && inv.household_name !== '—' && (
                    <span className="text-xs text-slate-500 truncate">{inv.household_name}</span>
                  )}
                </div>

                <p className="text-xs text-slate-500 mt-1">
                  {fmtDate(inv.service_date_start)}
                  {inv.service_date_end !== inv.service_date_start && (
                    <> – {fmtDate(inv.service_date_end)}</>
                  )}
                </p>

                {inv.description && (
                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{inv.description}</p>
                )}

                {inv.category_name && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <Tag className="w-3 h-3" />
                    {inv.category_name}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="font-semibold text-slate-900 text-sm">
                  {fmtCurrency(inv.amount, inv.currency)}
                </span>
                <StatusBadge status={inv.status} t={t} />
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-3">
              {t('invoice.submittedOn')} {fmtDate(inv.created_at.split('T')[0])}
            </p>
          </button>
        ))}
      </div>

      {/* Detail panel — read-only for submitters. Attachments open in new tab. */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{t('invoice.detailTitle')}</h3>
              <button onClick={() => setDetailInvoice(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  {
                    label: t('invoice.detailInvoiceNumber'),
                    value: detailInvoice.invoice_number
                      ? <span className="font-mono">{detailInvoice.invoice_number}</span>
                      : <span className="text-slate-400">{t('invoice.noNumberPlaceholder')}</span>,
                  },
                  { label: t('invoice.detailProperty'), value: detailInvoice.household_name ?? '—' },
                  {
                    label: t('invoice.detailCategory'),
                    value: detailInvoice.category_name
                      ? detailInvoice.category_name
                      : <span className="text-slate-400">{t('invoice.detailNoCategory')}</span>,
                  },
                  { label: t('invoice.detailAmount'), value: fmtCurrency(detailInvoice.amount, detailInvoice.currency) },
                  { label: t('invoice.detailStatus'), value: <StatusBadge status={detailInvoice.status} t={t} /> },
                  { label: t('invoice.detailServicePeriod'), value: `${fmtDate(detailInvoice.service_date_start)} – ${fmtDate(detailInvoice.service_date_end)}` },
                  { label: t('invoice.detailSubmitted'), value: fmtDate(detailInvoice.created_at.split('T')[0]) },
                  ...(detailInvoice.paid_at
                    ? [{ label: t('invoice.detailPaidAt'), value: fmtDate(detailInvoice.paid_at.split('T')[0]) }]
                    : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {detailInvoice.description && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('invoice.detailDescription')}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailInvoice.description}</p>
                </div>
              )}

              {detailInvoice.admin_notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{t('invoice.detailAdminNotes')}</p>
                  <p className="text-sm text-amber-700 whitespace-pre-wrap">{detailInvoice.admin_notes}</p>
                </div>
              )}

              {(() => {
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
                      <span className="text-xs">{t('invoice.detailClickToOpen')}</span>
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
                      <p className="text-sm font-semibold text-slate-900 mb-3">{t('invoice.detailAttachments')}</p>
                      {loadingDetail ? (
                        <p className="text-sm text-slate-400">{t('invoice.detailLoadingImages')}</p>
                      ) : primaryPaths.length === 0 ? (
                        <p className="text-sm text-slate-400">{t('invoice.detailNoAttachments')}</p>
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
                            <ImageIcon className="w-4 h-4 text-amber-600" />
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

              <div className="flex flex-wrap justify-between gap-2 pt-2">
                {user && detailInvoice.created_by === user.id ? (
                  <button
                    onClick={() => deleteInvoice(detailInvoice)}
                    disabled={deleting}
                    className={
                      armedDelete
                        ? 'inline-flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 shadow-sm'
                        : 'inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-xl transition-all disabled:opacity-50'
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting ? t('common.deleting') : armedDelete ? t('common.tapAgainToConfirm') : t('invoice.detailDelete')}
                  </button>
                ) : <span />}
                <button
                  onClick={() => setDetailInvoice(null)}
                  className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-all"
                >
                  {t('invoice.detailClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
