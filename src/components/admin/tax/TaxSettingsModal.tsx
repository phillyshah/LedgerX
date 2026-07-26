import { useState } from 'react';
import { X, Loader2, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { useEscapeClose } from '../../../hooks/useEscapeClose';
import type { TaxSettings } from '../../../lib/database.types';

interface TaxSettingsModalProps {
  settings: TaxSettings | null;
  onSaved: (s: TaxSettings) => void;
  onClose: () => void;
}

const field = 'w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900';
const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

/**
 * Both thresholds are editable because both move. The 1099 threshold is now
 * inflation-indexed, and the de minimis figure depends on whether the entity
 * has an applicable financial statement. Hard-coding either would guarantee
 * the app is quietly wrong in some future year.
 */
export function TaxSettingsModal({ settings, onSaved, onClose }: TaxSettingsModalProps) {
  const { t } = useT();
  useEscapeClose(onClose);

  const [deMinimis, setDeMinimis] = useState(String(settings?.de_minimis_threshold ?? 2500));
  const [f1099, setF1099] = useState(String(settings?.form_1099_threshold ?? 2000));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const a = parseFloat(deMinimis);
    const b = parseFloat(f1099);
    if (!Number.isFinite(a) || a < 0 || !Number.isFinite(b) || b < 0) {
      setError(t('tax.settings.invalid'));
      return;
    }
    setSaving(true);
    setError('');
    const { data, error: e } = await supabase.rpc('admin_update_tax_settings', { p_de_minimis: a, p_1099: b });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved(data as unknown as TaxSettings);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">{t('tax.settings')}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all" aria-label={t('common.close')}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className={label}>{t('tax.settings.deMinimis')}</label>
            <input type="number" min="0" step="1" value={deMinimis} onChange={(e) => setDeMinimis(e.target.value)} className={field} />
            <p className="text-[11px] text-slate-400 mt-1">{t('tax.settings.deMinimisHint')}</p>
          </div>

          <div>
            <label className={label}>{t('tax.settings.f1099')}</label>
            <input type="number" min="0" step="1" value={f1099} onChange={(e) => setF1099(e.target.value)} className={field} />
            <p className="text-[11px] text-slate-400 mt-1">{t('tax.settings.f1099Hint')}</p>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-relaxed">{t('tax.settings.cpaNotice')}</p>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
          <button
            onClick={save}
            disabled={saving}
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
