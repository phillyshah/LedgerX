import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ExpenseList } from './ExpenseList';
import { AddExpense } from './AddExpense';
import { ExportData } from './ExportData';
import { Reports } from './Reports';
import { LogOut, Plus, Download, FileText } from 'lucide-react';

export function Dashboard() {
  const { signOut } = useAuth();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleExpenseAdded = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">LedgerX</h1>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddExpense(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all shadow-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-xl transition-all shadow-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
            <button
              onClick={() => setShowReports(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-xl transition-all shadow-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              Reports
            </button>
          </div>

          <ExpenseList refreshKey={refreshKey} />
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
    </div>
  );
}
