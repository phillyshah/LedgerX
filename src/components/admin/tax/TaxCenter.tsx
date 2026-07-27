import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { X, Loader2, FileSpreadsheet, Scale, HardHat, Settings2, Link2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { useEscapeClose } from '../../../hooks/useEscapeClose';
import { taxYearOptions } from '../../../lib/scheduleE';
import type { TaxSettings } from '../../../lib/database.types';

const ScheduleETab     = lazy(() => import('./ScheduleETab').then((m) => ({ default: m.ScheduleETab })));
const CapitalReviewTab = lazy(() => import('./CapitalReviewTab').then((m) => ({ default: m.CapitalReviewTab })));
const Form1099Tab      = lazy(() => import('./Form1099Tab').then((m) => ({ default: m.Form1099Tab })));
const MappingTab       = lazy(() => import('./MappingTab').then((m) => ({ default: m.MappingTab })));
const TaxSettingsModal = lazy(() => import('./TaxSettingsModal').then((m) => ({ default: m.TaxSettingsModal })));

type Tab = 'scheduleE' | 'review' | 'f1099' | 'mapping';

interface TaxCenterProps {
  onClose: () => void;
}

/**
 * Full-admin tax workspace. Three tabs share one tax-year selector, because
 * "which year am I working on" is the single question that governs all of
 * them — splitting these into separate nav entries would mean re-picking the
 * year three times.
 *
 * Gated on isAdmin at the AdminLayout call site AND on is_admin() inside
 * every RPC these tabs call. The server check is the real boundary.
 */
export function TaxCenter({ onClose }: TaxCenterProps) {
  const { t } = useT();
  useEscapeClose(onClose);

  const years = useMemo(() => taxYearOptions(), []);
  const [taxYear, setTaxYear] = useState<number>(years[0]);
  const [tab, setTab] = useState<Tab>('scheduleE');
  const [settings, setSettings] = useState<TaxSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Thresholds drive both the review queue's cutoff and the 1099 badge, so
  // they're fetched once here and passed down rather than re-queried per tab.
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_tax_settings').then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setLoadError(error.message); return; }
      setSettings(data as unknown as TaxSettings);
    });
    return () => { cancelled = true; };
  }, []);

  const tabs: { key: Tab; icon: typeof Scale; label: string }[] = [
    { key: 'scheduleE', icon: FileSpreadsheet, label: t('tax.tab.scheduleE') },
    { key: 'review',    icon: Scale,           label: t('tax.tab.review') },
    { key: 'f1099',     icon: HardHat,         label: t('tax.tab.f1099') },
    { key: 'mapping',   icon: Link2,           label: t('tax.tab.mapping') },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl shadow-xl flex flex-col h-[92vh] sm:h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">{t('tax.title')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('tax.subtitle')}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                className="text-sm font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                aria-label={t('tax.taxYear')}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                title={t('tax.settings')}
              >
                <Settings2 className="w-4.5 h-4.5 text-slate-500" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all" aria-label={t('common.close')}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Tabs — horizontally scrollable so three labels never wrap on a phone */}
          <div className="flex gap-1 mt-4 overflow-x-auto -mb-px">
            {tabs.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                  tab === key
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/60'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loadError ? (
            <div className="p-6">
              <p className="text-sm text-red-600">{loadError}</p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              }
            >
              {tab === 'scheduleE' && <ScheduleETab taxYear={taxYear} />}
              {tab === 'review' && (
                <CapitalReviewTab taxYear={taxYear} deMinimis={settings?.de_minimis_threshold ?? 2500} />
              )}
              {tab === 'f1099' && <Form1099Tab taxYear={taxYear} />}
              {tab === 'mapping' && <MappingTab />}
            </Suspense>
          )}
        </div>
      </div>

      {settingsOpen && (
        <Suspense fallback={null}>
          <TaxSettingsModal
            settings={settings}
            onSaved={(s) => { setSettings(s); setSettingsOpen(false); }}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
