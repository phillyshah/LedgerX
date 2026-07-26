import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Upload, FileCheck2, ShieldAlert, ExternalLink } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { useEscapeClose } from '../../../hooks/useEscapeClose';
import type { ContractorTaxProfile, TaxEntityType } from '../../../lib/database.types';

const ENTITY_TYPES: TaxEntityType[] = [
  'individual', 'sole_prop', 'partnership', 'llc', 'c_corp', 's_corp', 'other',
];

interface ContractorTaxProfileModalProps {
  contractorId: string;
  username: string | null;
  onSaved: () => void;
  onClose: () => void;
}

const field = 'w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900';
const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

/**
 * W-9 metadata editor. Note what is NOT here: no TIN/SSN/EIN field. The
 * number lives only inside the uploaded W-9 PDF in the private tax-docs
 * bucket, so a database compromise never exposes it. Entity type and legal
 * name are stored because they decide whether a 1099 is required at all.
 */
export function ContractorTaxProfileModal({ contractorId, username, onSaved, onClose }: ContractorTaxProfileModalProps) {
  const { t } = useT();
  useEscapeClose(onClose);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [legalName, setLegalName] = useState('');
  const [entityType, setEntityType] = useState<TaxEntityType | ''>('');
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal, setPostal] = useState('');
  const [w9Date, setW9Date] = useState('');
  const [w9Path, setW9Path] = useState<string | null>(null);
  const [exempt, setExempt] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('contractor_tax_profiles')
      .select('*')
      .eq('user_id', contractorId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) { setError(e.message); setLoading(false); return; }
        const p = data as ContractorTaxProfile | null;
        if (p) {
          setLegalName(p.legal_name ?? '');
          setEntityType(p.entity_type ?? '');
          setAddr1(p.address_line1 ?? '');
          setAddr2(p.address_line2 ?? '');
          setCity(p.city ?? '');
          setState(p.state ?? '');
          setPostal(p.postal_code ?? '');
          setW9Date(p.w9_received_at ?? '');
          setW9Path(p.w9_doc_path);
          setExempt(p.is_exempt_payee);
          setNotes(p.notes ?? '');
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [contractorId]);

  const uploadW9 = async (file: File) => {
    setUploading(true);
    setError('');
    // Path is namespaced by contractor so the bucket stays browsable, and
    // timestamped so re-uploading a corrected W-9 never silently overwrites
    // the copy an earlier filing was based on.
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${contractorId}/w9-${Date.now()}.${ext}`;
    const { error: e } = await supabase.storage.from('tax-docs').upload(path, file, { upsert: false });
    setUploading(false);
    if (e) { setError(e.message); return; }
    setW9Path(path);
    // Default the received date to today if the admin hasn't set one.
    if (!w9Date) setW9Date(new Date().toISOString().slice(0, 10));
  };

  const openW9 = async () => {
    if (!w9Path) return;
    const { data, error: e } = await supabase.storage.from('tax-docs').createSignedUrl(w9Path, 60);
    if (e || !data) { setError(e?.message ?? 'error'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const { error: e } = await supabase.rpc('admin_upsert_contractor_tax_profile', {
      p_user_id: contractorId,
      p_legal_name: legalName || null,
      p_entity_type: (entityType || null) as TaxEntityType | null,
      p_address_line1: addr1 || null,
      p_address_line2: addr2 || null,
      p_city: city || null,
      p_state: state || null,
      p_postal_code: postal || null,
      p_w9_received_at: w9Date || null,
      p_w9_doc_path: w9Path,
      p_is_exempt_payee: exempt,
      p_notes: notes || null,
    });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-0.5">{t('tax.profile.heading')}</p>
            <p className="font-semibold text-slate-900 truncate">{username ? `@${username}` : contractorId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all shrink-0" aria-label={t('common.close')}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* The reason there's no TIN box, stated plainly so nobody adds one later */}
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-500 leading-relaxed">{t('tax.profile.noTinNotice')}</p>
            </div>

            <div>
              <label className={label}>{t('tax.profile.legalName')}</label>
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={field}
                     placeholder={t('tax.profile.legalNamePlaceholder')} />
            </div>

            <div>
              <label className={label}>{t('tax.profile.entityType')}</label>
              <select value={entityType} onChange={(e) => setEntityType(e.target.value as TaxEntityType | '')} className={field}>
                <option value="">{t('tax.profile.entityUnknown')}</option>
                {ENTITY_TYPES.map((et) => (
                  <option key={et} value={et}>{t(`tax.entity.${et}`)}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">{t('tax.profile.entityHint')}</p>
            </div>

            <div>
              <label className={label}>{t('tax.profile.address')}</label>
              <input value={addr1} onChange={(e) => setAddr1(e.target.value)} className={field} placeholder={t('tax.profile.address1')} />
              <input value={addr2} onChange={(e) => setAddr2(e.target.value)} className={`${field} mt-2`} placeholder={t('tax.profile.address2')} />
              <div className="grid grid-cols-3 gap-2 mt-2">
                <input value={city} onChange={(e) => setCity(e.target.value)} className={field} placeholder={t('tax.profile.city')} />
                <input value={state} onChange={(e) => setState(e.target.value)} className={field} placeholder={t('tax.profile.state')} />
                <input value={postal} onChange={(e) => setPostal(e.target.value)} className={field} placeholder={t('tax.profile.zip')} />
              </div>
            </div>

            <div>
              <label className={label}>{t('tax.profile.w9')}</label>
              <div className="flex items-center gap-2">
                <input type="date" value={w9Date} onChange={(e) => setW9Date(e.target.value)} className={field} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {t('tax.profile.upload')}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadW9(f); e.target.value = ''; }}
              />
              {w9Path && (
                <button onClick={openW9} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  {t('tax.profile.viewW9')}
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)}
                     className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm text-slate-700">
                {t('tax.profile.exemptPayee')}
                <span className="block text-[11px] text-slate-400">{t('tax.profile.exemptHint')}</span>
              </span>
            </label>

            <div>
              <label className={label}>{t('tax.profile.notes')}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
          <button
            onClick={save}
            disabled={saving || loading}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('common.save')}
          </button>
          <button onClick={onClose} disabled={saving}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-all disabled:opacity-50">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
