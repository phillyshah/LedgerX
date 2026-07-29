/**
 * ReportsHub
 *
 * One destination for the four things that all answer "show me the numbers":
 * Analytics, Reports, Activity and Estimates.
 *
 * They used to be four separate nav items and four separate home tiles, and
 * two of them — Analytics and Reports — overlapped almost entirely: both are
 * spending views, both filter by date/household/category, both export CSV and
 * PDF. Nothing in either name told you which one to open, and the honest
 * answer was "either". Collapsing them into tabs takes the admin sidebar from
 * ~15 destinations to ~12 and replaces four ambiguous names with one obvious
 * one.
 *
 * The four components are unchanged apart from being able to render bare:
 * each drops its own overlay, header and close button when `onClose` is
 * omitted (the convention AdminAnalytics already used). Their internal state,
 * filters and exports all still work exactly as before — this is a container,
 * not a rewrite.
 *
 * Tab state is remembered per device, so an admin who lives in Activity isn't
 * dropped back on Analytics every time.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { X, BarChart3, FileText, Activity, PieChart } from 'lucide-react';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';

const AdminAnalytics = lazy(() => import('./AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })));
const Reports = lazy(() => import('../Reports').then((m) => ({ default: m.Reports })));
const ActivityReport = lazy(() => import('./ActivityReport').then((m) => ({ default: m.ActivityReport })));
const EstimateReport = lazy(() => import('./EstimateReport').then((m) => ({ default: m.EstimateReport })));

export type ReportsTab = 'analytics' | 'reports' | 'activity' | 'estimates';

const TAB_KEY = 'ledgerx:reportsTab';

interface Props {
  onClose: () => void;
  /** Opens straight to a tab — used by the home tiles so a tile still lands
   *  where its label promised. */
  initialTab?: ReportsTab;
}

export function ReportsHub({ onClose, initialTab }: Props) {
  const { t } = useT();
  useEscapeClose(onClose);

  const [tab, setTab] = useState<ReportsTab>(() => {
    if (initialTab) return initialTab;
    try {
      const raw = window.localStorage.getItem(TAB_KEY);
      if (raw === 'analytics' || raw === 'reports' || raw === 'activity' || raw === 'estimates') {
        return raw;
      }
    } catch {
      /* no-op */
    }
    return 'analytics';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* no-op */
    }
  }, [tab]);

  const tabs: { key: ReportsTab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'analytics', label: t('admin.analytics'), icon: BarChart3 },
    { key: 'reports', label: t('reports.title'), icon: FileText },
    { key: 'activity', label: t('activityReport.title'), icon: Activity },
    { key: 'estimates', label: t('estimateReport.navLabel'), icon: PieChart },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-6xl sm:max-h-[90vh] sm:my-4 overflow-hidden flex flex-col">

        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-700" />
              {t('reportsHub.title')}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">{t('reportsHub.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Scrolls sideways on phones rather than wrapping to a second row. */}
        <div className="px-5 sm:px-6 pt-4 border-b border-slate-200 shrink-0 overflow-x-auto">
          <div className="flex gap-1 min-w-max" role="tablist">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                  tab === key
                    ? 'bg-emerald-50 text-emerald-800 border-x border-t border-emerald-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Suspense fallback={<div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />}>
            {/* Each is mounted without onClose, so it renders bare. Only the
                active tab mounts — these are heavy screens and keeping the
                other three alive would run their queries for nothing. */}
            {tab === 'analytics' && <AdminAnalytics />}
            {tab === 'reports' && <Reports />}
            {tab === 'activity' && <ActivityReport />}
            {tab === 'estimates' && <EstimateReport />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
