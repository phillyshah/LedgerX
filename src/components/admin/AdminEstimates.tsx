import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { X, ChevronDown, ChevronUp, FileText, Check, Trash2, MessageCircle, Ban, UserPlus, Loader2 } from 'lucide-react';
import type { Estimate, EstimateStatus, EstimateAttachment, EstimateParticipant } from '../../types/estimate';
import { EstimateChat } from '../EstimateChat';

interface HouseholdOption { id: string; name: string; }

interface AdminEstimateRow extends Estimate {
  household_name: string;
  submitter_username: string;
  unread_count: number;
}

type StatusFilter = EstimateStatus | 'all';

function StatusBadge({ status, t }: { status: EstimateStatus; t: (k: string) => string }) {
  const styles: Record<EstimateStatus, string> = {
    open:     'bg-amber-100 text-amber-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-slate-200 text-slate-700',
  };
  const labels: Record<EstimateStatus, string> = {
    open: t('estimate.statusOpen'),
    accepted: t('estimate.statusAccepted'),
    rejected: t('estimate.statusRejected'),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function AdminEstimates() {
  const { t, locale } = useT();

  const [estimates, setEstimates] = useState<AdminEstimateRow[]>([]);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Detail panel
  const [detail, setDetail] = useState<AdminEstimateRow | null>(null);
  const [attachments, setAttachments] = useState<EstimateAttachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Invite participants
  const [participants, setParticipants] = useState<EstimateParticipant[]>([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [hhRes, estRes, usersRes, unreadRes] = await Promise.all([
      supabase.from('households').select('id, name').order('name'),
      supabase.from('estimates').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_users'),
      supabase.rpc('list_estimate_unread' as never),
    ]);

    const hhData = (hhRes.data || []) as HouseholdOption[];
    setHouseholds(hhData);
    const hhMap = new Map(hhData.map((h) => [h.id, h]));
    const usernameMap = new Map(
      ((usersRes.data || []) as { id: string; username: string }[]).map((u) => [u.id, u.username])
    );
    const unreadMap = new Map(
      (((unreadRes.data as unknown as { estimate_id: string; unread_count: number }[]) || []))
        .map((r) => [r.estimate_id, Number(r.unread_count)])
    );

    setEstimates(((estRes.data || []) as Estimate[]).map((est) => ({
      ...est,
      household_name: (est.household_id && hhMap.get(est.household_id)?.name) || '—',
      submitter_username: usernameMap.get(est.created_by) ?? 'Unknown',
      unread_count: unreadMap.get(est.id) ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const rows = estimates.filter((est) =>
      (statusFilter === 'all' || est.status === statusFilter) &&
      (householdFilter === 'all' || est.household_id === householdFilter));
    const sign = sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => sign * a.created_at.localeCompare(b.created_at));
  }, [estimates, statusFilter, householdFilter, sortDir]);

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const openDetail = async (est: AdminEstimateRow) => {
    setDetail(est);
    setAttachments([]);
    setSignedUrls({});
    setParticipants([]);
    setInviteUsername('');
    setInviteError(null);
    setLoadingDetail(true);

    const [attsRes, partsRes] = await Promise.all([
      supabase.from('estimate_attachments').select('*').eq('estimate_id', est.id).order('display_order'),
      supabase.rpc('list_estimate_participants' as never, { p_estimate_id: est.id } as never),
    ]);

    const list = (attsRes.data || []) as EstimateAttachment[];
    setAttachments(list);
    setParticipants((partsRes.data as unknown as EstimateParticipant[]) || []);

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

  const inviteParticipant = async () => {
    const username = inviteUsername.trim().replace(/^@/, '');
    if (!username || !detail) return;
    setInviting(true);
    setInviteError(null);

    const { error } = await supabase.rpc('invite_estimate_participant' as never, {
      p_estimate_id: detail.id,
      p_username: username,
    } as never);

    if (error) {
      const m = error.message || '';
      setInviteError(
        /not found/i.test(m)
          ? t('adminEstimates.inviteNotFound')
          : /already the estimate submitter/i.test(m)
            ? t('adminEstimates.inviteAlreadySubmitter')
            : t('adminEstimates.inviteFailed')
      );
      setInviting(false);
      return;
    }

    setInviteUsername('');
    const { data: parts } = await supabase.rpc('list_estimate_participants' as never, {
      p_estimate_id: detail.id,
    } as never);
    setParticipants((parts as unknown as EstimateParticipant[]) || []);
    setInviting(false);
  };

  const setStatus = async (est: AdminEstimateRow, status: EstimateStatus) => {
    setActioning(true);
    const { error } = await supabase.rpc('admin_set_estimate_status' as never, {
      p_estimate_id: est.id,
      p_status: status,
    } as never);
    setActioning(false);
    if (error) { alert(t('adminEstimates.actionError')); return; }
    setDetail((d) => (d && d.id === est.id ? { ...d, status } : d));
    await loadData();
  };

  const deleteEstimate = async (est: AdminEstimateRow) => {
    if (!confirm(t('adminEstimates.confirmDelete'))) return;
    setDeletingId(est.id);
    const { error } = await supabase.from('estimates').delete().eq('id', est.id);
    setDeletingId(null);
    if (error) { alert(t('adminEstimates.actionError')); return; }
    setDetail(null);
    await loadData();
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">{t('adminEstimates.title')}</h2>
        <p className="text-slate-500 mt-1">{t('adminEstimates.subtitle')}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
        >
          <option value="all">{t('adminEstimates.allStatuses')}</option>
          <option value="open">{t('estimate.statusOpen')}</option>
          <option value="accepted">{t('estimate.statusAccepted')}</option>
          <option value="rejected">{t('estimate.statusRejected')}</option>
        </select>

        <select
          value={householdFilter}
          onChange={(e) => setHouseholdFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
        >
          <option value="all">{t('adminEstimates.allHouseholds')}</option>
          {households.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>

        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all"
        >
          {t('adminEstimates.colDate')}
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
          <p className="text-slate-500">{t('adminEstimates.noEstimates')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('adminEstimates.noEstimatesHint')}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((est) => (
            <div key={est.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button className="w-full text-left p-5 hover:bg-slate-50 transition-all" onClick={() => openDetail(est)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-semibold text-slate-900 text-sm truncate">{est.title}</span>
                      <span className="text-xs text-slate-500">@{est.submitter_username}</span>
                      {est.unread_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                          <MessageCircle className="w-3 h-3" />
                          {est.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {est.household_name} · {fmtDate(est.created_at.split('T')[0])}
                      {est.billing_type === 'labor_only' && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">
                          {t('estimate.billingLaborOnlyShort')}
                        </span>
                      )}
                    </p>
                    {est.description && (
                      <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{est.description}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={est.status} t={t} />
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{t('adminEstimates.detailTitle')}</h3>
              <button onClick={() => { setDetail(null); loadData(); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: t('adminEstimates.detailTitleField'), value: detail.title },
                  { label: t('adminEstimates.detailContractor'), value: `@${detail.submitter_username}` },
                  { label: t('adminEstimates.detailProperty'), value: detail.household_name },
                  { label: t('adminEstimates.detailStatus'), value: <StatusBadge status={detail.status} t={t} /> },
                  { label: t('estimate.detailBillingType'), value: detail.billing_type === 'labor_only' ? t('estimate.billingLaborOnly') : t('estimate.billingTotal') },
                  { label: t('adminEstimates.detailSubmitted'), value: fmtDate(detail.created_at.split('T')[0]) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {detail.description && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('adminEstimates.detailDescription')}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}

              {detail.admin_notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{t('adminEstimates.detailAdminNotes')}</p>
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
                      <span className="text-xs">{t('adminEstimates.detailClickToOpen')}</span>
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
                    <p className="text-sm font-semibold text-slate-900 mb-3">{t('adminEstimates.detailAttachments')}</p>
                    {loadingDetail ? (
                      <p className="text-sm text-slate-400">{t('adminEstimates.loadingImages')}</p>
                    ) : paths.length === 0 ? (
                      <p className="text-sm text-slate-400">{t('adminEstimates.detailNoAttachments')}</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {paths.map((p) => renderTile(p))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Chat thread */}
              <EstimateChat estimateId={detail.id} onActivity={loadData} />

              {/* Invite participants */}
              <div>
                <p className="text-sm font-semibold text-slate-900 mb-2">
                  {t('adminEstimates.inviteTitle')}
                </p>
                {participants.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {participants.map((p) => (
                      <span
                        key={p.user_id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-800"
                      >
                        <UserPlus className="w-3 h-3" />
                        @{p.username}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') inviteParticipant(); }}
                    placeholder={t('adminEstimates.inviteUsernamePlaceholder')}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={inviteParticipant}
                    disabled={inviting || !inviteUsername.trim()}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviting
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <UserPlus className="w-4 h-4" />}
                    {t('adminEstimates.inviteBtn')}
                  </button>
                </div>
                {inviteError && (
                  <p className="text-xs text-red-600 mt-1.5">{inviteError}</p>
                )}
                <p className="text-xs text-slate-400 mt-1.5">{t('adminEstimates.inviteHint')}</p>
              </div>

              {/* Admin actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {detail.status !== 'accepted' && (
                  <button
                    onClick={() => setStatus(detail, 'accepted')}
                    disabled={actioning}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {t('adminEstimates.actionAccept')}
                  </button>
                )}
                {detail.status !== 'rejected' && (
                  <button
                    onClick={() => setStatus(detail, 'rejected')}
                    disabled={actioning}
                    className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Ban className="w-4 h-4" />
                    {t('adminEstimates.actionReject')}
                  </button>
                )}
                {detail.status !== 'open' && (
                  <button
                    onClick={() => setStatus(detail, 'open')}
                    disabled={actioning}
                    className="px-4 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all disabled:opacity-50"
                  >
                    {t('adminEstimates.actionReopen')}
                  </button>
                )}
                <button
                  onClick={() => deleteEstimate(detail)}
                  disabled={deletingId === detail.id}
                  className="ml-auto px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-xl transition-all inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingId === detail.id ? t('common.deleting') : t('adminEstimates.actionDelete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
