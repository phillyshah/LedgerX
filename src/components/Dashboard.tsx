import { Suspense, lazy, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { ExpenseList } from './ExpenseList';
import { DashboardSummary } from './DashboardSummary';
import { LogOut, Plus, Download, FileText, Settings } from 'lucide-react';

const AddExpense = lazy(() => import('./AddExpense').then((m) => ({ default: m.AddExpense })));
const ExportData = lazy(() => import('./ExportData').then((m) => ({ default: m.ExportData })));
const Reports = lazy(() => import('./Reports').then((m) => ({ default: m.Reports })));
const UserSettings = lazy(() => import('./UserSettings').then((m) => ({ default: m.UserSettings })));
const SpendingCharts = lazy(() => import('./SpendingCharts').then((m) => ({ default: m.SpendingCharts })));

function ChartsSkeleton() {
  return <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 h-64 animate-pulse" />;
}

export function Dashboard() {
  const { signOut } = useAuth();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { expenses, households, loading, reloadExpenses } = useExpenses();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddExpense(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl transition-all shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl transition-all shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
            <button
              onClick={() => setShowReports(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl transition-all shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98]"
            >
              <FileText className="w-4 h-4" />
              Reports
            </button>
          </div>

          <DashboardSummary expenses={expenses} loading={loading} />

          <Suspense fallback={<ChartsSkeleton />}>
            <SpendingCharts expenses={expenses} loading={loading} />
          </Suspense>

          <ExpenseList
            expenses={expenses}
            households={households}
            loading={loading}
            onReload={reloadExpenses}
          />
        </div>
      </main>

      <Suspense fallback={null}>
        {showAddExpense && (
          <AddExpense
            onClose={() => setShowAddExpense(false)}
            onSaved={reloadExpenses}
          />
        )}

        {showExport && <ExportData onClose={() => setShowExport(false)} />}

        {showReports && <Reports onClose={() => setShowReports(false)} />}

        {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
      </Suspense>
    </div>
  );
}
