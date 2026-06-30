import { useState } from 'react';
import { useT } from '../hooks/useT';
import { supabase } from '../lib/supabase';
import { X, FileText, Plus, ClipboardList, MessageCircle } from 'lucide-react';
import type { Estimate, EstimateStatus, EstimateAttachment } from '../types/estimate';
import { EstimateChat } from './EstimateChat';

interface EstimateListProps {
  estimates: Estimate[];
  loading: boolean;
  onReload: () => void;
  /** Optional CTA shown in the empty state. */
  onAdd?: () => void;
}

export function EstimateStatusBadge({ status, t }: { status: EstimateStatus; t: (k: string) => string }) {
  const styles: Record<EstimateStatus, string> = {
    open:     'bg-amber-500 text-white ring-1 ring-amber-600/20',
    accepted: 'bg-emerald-600 text-white ring-1 ring-emerald-700/20',
    rejected: 'bg-slate-400 text-white ring-1 ring-slate-500/20',
  };
  const dots: Record<EstimateStatus, string> = {
    open: 'bg-amber-200', accepted: 'bg-emerald-200', rejected: 'bg-slate-200',
  };
  const labels: Record<EstimateStatus, string> = {
    open: t('estimate.statusOpen'),
    accepted: t('estimate.statusAccepted'),
    rejected: t('estimate.statusRejected'),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

export function EstimateList({ estimates, loading, onReload, onAdd }: EstimateListProps) {
  const { t, locale } = useT();

  const [detail, setDetail] = useState<Estimate | null>(null);
  const [attachments, setAttachments] = useState<EstimateAttachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const openDetail = async (est: Estimate) => {
    setDetail(est);
    setAttachments([]);
    setSignedUrls({});
    setLoadingDetail(true);

    const { data: atts } = await supabase
      .from('estimate_attachments').select('*').eq('estimate_id', est.id).order('display_order');
    const list = (atts || []) as EstimateAttachment[];
    setAttachments(list);

    const paths = Array.from(new Set(
      [est.file_path, ...list.map((a) => a.file_path)].filter((p): p is string => !!p)
    ));
    const signed = await Promise.all(
      paths.map((p) => supabase.storage.from('receipts').createSignedUrl(p, 3600).then((r) => [p, r.data?.signedUrl] as const))
    );
    const urls: Record<string, string> = {};
    for (const [p, u] of signed) if (u) urls[p] = u;
    setSignedUrls(urls);
    setLoadingDetail(false);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  if (estimates.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 sm:p-12 shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-emerald-200/50">
          <ClipboardList className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1.5">{t('estimate.noEstimatesYet')}</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">{t('estimate.noEstimatesHint')}</p>
        {onAdd && (
          <div className="mt-6">
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl transition-all shadow-sm font-medium active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              {t('estimate.emptyCta')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {estimates.map((est) => (
          <button
            key={est.id}
            type="button"
            onClick={() => openDetail(est)}
            className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.995]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 text-sm truncate">{est.title}</span>
                  {est.household_name && est.household_name !== '—' && (
                    <span className="text-xs text-slate-500 truncate">{est.household_name}</span>
                  )}
                  {!!est.unread_count && est.unread_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                      <MessageCircle className="w-3 h-3" />
                      {est.unread_count}
                    </span>
                  )}
                </div>
                {est.description && (
                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{est.description}</p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  {t('estimate.submittedOn')} {fmtDate(est.created_at.split('T')[0])}
                </p>
              </div>
              <div className="shrink-0">
                <EstimateStatusBadge status={est.status} t={t} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Detail modal — read-only meta + attachments + chat. No delete (retention). */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{t('estimate.detailTitle')}</h3>
              <button onClick={() => { setDetail(null); onReload(); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: t('estimate.detailTitleField'), value: detail.title },
                  { label: t('estimate.detailProperty'), value: detail.household_name ?? '—' },
                  { label: t('estimate.detailStatus'), value: <EstimateStatusBadge status={detail.status} t={t} /> },
                  { label: t('estimate.detailSubmitted'), value: fmtDate(detail.created_at.split('T')[0]) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {detail.description && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('estimate.detailDescription')}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}

              {detail.admin_notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{t('estimate.detailAdminNotes')}</p>
                  <p className="text-sm text-amber-700 whitespace-pre-wrap">{detail.admin_notes}</p>
                </div>
              )}

              {/* Attachments */}
              {(() => {
                const paths = Array.from(new Set(
                  [detail.file_path, ...attachments.map((a) => a.file_path)].filter((p): p is string => !!p)
                ));
                const renderTile = (path: string) => {
                  const url = signedUrls[path];
                  if (!url) return null;
                  const isPdf = path.toLowerCase().endsWith('.pdf') ||
                    attachments.find((a) => a.file_path === path)?.file_mime === 'application/pdf' ||
                    detail.file_mime === 'application/pdf';
                  return isPdf ? (
                    <a key={path} href={url} target="_blank" rel="noreferrer"
                      className="flex flex-col items-center justify-center h-32 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all gap-1 text-slate-500">
                      <FileText className="w-8 h-8 text-red-400" />
                      <span className="text-xs">{t('estimate.detailClickToOpen')}</span>
                    </a>
                  ) : (
                    <a key={path} href={url} target="_blank" rel="noreferrer"
                      className="block rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-all">
                      <img src={url} alt="Estimate attachment" className="w-full h-32 object-cover" />
                    </a>
                  );
                };
                return (
                  <div>
                    <p className="text-sm font-semibold text-slate-900 mb-3">{t('estimate.detailAttachments')}</p>
                    {loadingDetail ? (
                      <p className="text-sm text-slate-400">{t('estimate.detailLoadingImages')}</p>
                    ) : paths.length === 0 ? (
                      <p className="text-sm text-slate-400">{t('estimate.detailNoAttachments')}</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {paths.map((p) => renderTile(p))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Chat thread */}
              <EstimateChat estimateId={detail.id} onActivity={onReload} />

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { setDetail(null); onReload(); }}
                  className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl transition-all"
                >
                  {t('estimate.detailClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
