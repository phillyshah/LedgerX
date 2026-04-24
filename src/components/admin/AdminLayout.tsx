import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { ManageHouseholds } from './ManageHouseholds';
import { ManageCategories } from './ManageCategories';
import { AdminAnalytics } from './AdminAnalytics';
import { UncategorizedTransactions } from './UncategorizedTransactions';
import { ManageUsers } from './ManageUsers';
import { AdminInvoices } from './AdminInvoices';
import { Reports } from '../Reports';
import { HelpModal } from '../HelpModal';
import { APP_VERSION } from '../../version';
import { BarChart3, Home, Tag, LogOut, FileText, AlertCircle, Users, Menu, X, HelpCircle, HardHat } from 'lucide-react';

type AdminView = 'analytics' | 'households' | 'categories' | 'uncategorized' | 'users' | 'invoices' | 'reports';

export function AdminLayout() {
  const { signOut, isAdmin, isHouseholdAdmin } = useAuth();
  const { t } = useT();
  const [activeView, setActiveView] = useState<AdminView>('analytics');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Full admins see all nav items. Household admins see a scaled-down set:
  // analytics + invoices + reports + (their own submission flows remain
  // accessible via the normal contractor Submit Invoice / Add Transaction
  // routes rendered inside AdminInvoices / analytics).
  const allNavItems: { key: AdminView; label: string; icon: typeof BarChart3; adminOnly?: boolean }[] = [
    { key: 'analytics', label: t('admin.analytics'), icon: BarChart3 },
    { key: 'households', label: t('admin.manageHouseholds'), icon: Home, adminOnly: true },
    { key: 'categories', label: t('admin.manageCategories'), icon: Tag, adminOnly: true },
    { key: 'uncategorized', label: t('admin.uncategorized'), icon: AlertCircle, adminOnly: true },
    { key: 'users', label: t('admin.manageUsers'), icon: Users, adminOnly: true },
    { key: 'invoices', label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'reports', label: t('reports.title'), icon: FileText },
  ];
  const navItems = allNavItems.filter((item) => isAdmin || !item.adminOnly);
  void isHouseholdAdmin; // role gating for page-level access lives inside each admin page

  const handleViewChange = (view: AdminView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-100">
      <header className="lg:hidden bg-gradient-to-r from-emerald-900 to-emerald-950 sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-700 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">LedgerX</h1>
              <p className="text-emerald-300 text-xs font-medium">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
              title={t('common.help')}
              aria-label={t('common.help')}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={handleSignOut}
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
              title={t('common.signOut')}
            >
              <LogOut className="w-5 h-5" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t border-emerald-800 p-3 space-y-1">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleViewChange(key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeView === key
                    ? 'bg-emerald-700 text-white shadow-lg'
                    : 'text-emerald-200 hover:text-white hover:bg-emerald-800'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <aside className="hidden lg:flex w-64 bg-gradient-to-b from-emerald-900 to-emerald-950 flex-col shrink-0">
        <div className="p-6 border-b border-emerald-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-700 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">LedgerX</h1>
                <p className="text-emerald-300 text-xs font-medium">Admin Panel</p>
              </div>
            </div>
            <span className="text-[10px] text-emerald-400 font-medium">{APP_VERSION}</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveView(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeView === key
                  ? 'bg-emerald-700 text-white shadow-lg'
                  : 'text-emerald-200 hover:text-white hover:bg-emerald-800'
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-emerald-800 space-y-1">
          <button
            onClick={() => setShowHelp(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all"
          >
            <HelpCircle className="w-4.5 h-4.5" />
            {t('common.help')}
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all"
          >
            <LogOut className="w-4.5 h-4.5" />
            {t('common.signOut')}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
          {activeView === 'analytics' && <AdminAnalytics />}
          {activeView === 'households' && <ManageHouseholds />}
          {activeView === 'categories' && <ManageCategories />}
          {activeView === 'uncategorized' && <UncategorizedTransactions />}
          {activeView === 'users' && <ManageUsers />}
          {activeView === 'invoices' && <AdminInvoices />}
          {activeView === 'reports' && <Reports onClose={() => setActiveView('analytics')} />}
        </div>
      </main>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
