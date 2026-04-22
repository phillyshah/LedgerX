import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { useExpenses } from '../hooks/useExpenses';
import { ExpenseList } from './ExpenseList';
import { DashboardSummary } from './DashboardSummary';
import { AddExpense } from './AddExpense';
import { ExportData } from './ExportData';
import { Reports } from './Reports';
import { LogOut, Plus, Download, FileText, Settings } from 'lucide-react';
import { UserSettings } from './UserSettings';
import { SpendingCharts } from './SpendingCharts';

export function Dashboard() {
  const { signOut, isContractor } = useAuth();
  const { t } = useT();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { expenses, households, loading, reloadExpenses } = useExpenses();

  const handleExpenseAdded = () => {
    reloadExpenses();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const Logo = (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-emerald-900 rounded-xl flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H8V3H6Z" fill="white" fillOpacity="0.9"/>
          <path d="M10 3V21H18C18.5523 21 19 20.5523 19 20V4C19 3.44772 18.5523 3 18 3H10Z" fill="white" fillOpacity="0.3"/>
          <line x1="12" y1="7" x2="17" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="12" y1="11" x2="17" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="12" y1="15" x2="15" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">LedgerX</h1>
    </div>
  );

  const HeaderActions = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowSettings(true)}
        className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
        aria-label={t('common.settings')}
      >
        <Settings className="w-4 h-4" />
      </button>
      <button
        onClick={handleSignOut}
        className="flex items-center gap-2 px-3 py-2 sm:px-4 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
      >
        <LogOut className="w-4 h-4" />
        <span className="text-sm font-medium hidden sm:inline">{t('common.signOut')}</span>
      </button>
    </div>
  );

  // ─── Contractor: stripped-down, mobile-first view ─────────────────────────
  if (isContractor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            {Logo}
            {HeaderActions}
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <button
            onClick={() => setShowAddExpense(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl transition-all shadow-sm font-semibold text-base active:scale-[0.99]"
          >
            <Plus className="w-5 h-5" />
            {t('dashboard.addTransaction')}
          </button>

          <p className="text-sm text-slate-500 text-center">{t('dashboard.contractorTagline')}</p>

          <ExpenseList
            expenses={expenses}
            households={households}
            loading={loading}
            onReload={reloadExpenses}
            ownSubmissionsOnly
            hideFilters
          />
        </main>

        {showAddExpense && (
          <AddExpense onClose={() => setShowAddExpense(false)} onSaved={handleExpenseAdded} />
        )}
        {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  // ─── Default (regular user / admin) view ──────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {Logo}
            {HeaderActions}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setShowAddExpense(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl transition-all shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              {t('dashboard.addTransaction')}
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl transition-all shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              {t('dashboard.exportData')}
            </button>
            <button
              onClick={() => setShowReports(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl transition-all shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98]"
            >
              <FileText className="w-4 h-4" />
              {t('dashboard.reports')}
            </button>
          </div>

          <DashboardSummary expenses={expenses} loading={loading} />

          <SpendingCharts expenses={expenses} loading={loading} />

          <ExpenseList
            expenses={expenses}
            households={households}
            loading={loading}
            onReload={reloadExpenses}
          />
        </div>
      </main>

      {showAddExpense && (
        <AddExpense
          onClose={() => setShowAddExpense(false)}
          onSaved={handleExpenseAdded}
        />
      )}

      {showExport && (
        <ExportData onClose={() => setShowExport(false)} />
      )}

      {showReports && (
        <Reports onClose={() => setShowReports(false)} />
      )}

      {showSettings && (
        <UserSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
