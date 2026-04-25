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
import { AddExpense } from '../AddExpense';
import { InvoiceForm } from '../InvoiceForm';
import { ExpenseList } from '../ExpenseList';
import { HelpModal } from '../HelpModal';
import { APP_VERSION } from '../../version';
import { LogoText } from '../LogoText';
import { useExpenses } from '../../hooks/useExpenses';
import { BarChart3, Home, Tag, LogOut, FileText, AlertCircle, Users, Menu, X, HelpCircle, HardHat, Plus, Receipt } from 'lucide-react';

type AdminView = 'households' | 'categories' | 'uncategorized' | 'users' | 'invoices' | 'reports' | 'my-transactions';
// Analytics and Reports are launched as modal overlays from the nav, not as
// inline views — keeps the underlying base view (Invoices for HAs) intact.
type AdminNavKey = AdminView | 'analytics';

export function AdminLayout() {
  const { signOut, isAdmin, isHouseholdAdmin } = useAuth();
  const { t } = useT();

  // Household admins care primarily about reviewing contractor invoices and
  // submitting their own work — analytics is a distant third. Land them on
  // Invoices so the most-used screen is the default. Full admins still land
  // on Analytics, which is what they came for.
  // Inline base view. Full admins land on households-mgmt-style page? No — full
  // admins still default to invoices as their inline base; analytics opens as
  // a modal on demand via the nav (matching how Reports already worked).
  const [activeView, setActiveView] = useState<AdminView>(
    isAdmin ? 'households' : 'invoices'
  );
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  // Household admins (and full admins) get the same self-submission flows
  // contractors have — they can submit their own receipts and invoices.
  const canSubmit = isAdmin || isHouseholdAdmin;

  // Recent transactions submitted by the current user (HA or full admin) —
  // surfaced via the "My Transactions" nav item so HAs can review what they
  // entered without digging through the full analytics view.
  const { expenses, households, loading: expensesLoading, reloadExpenses } = useExpenses();

  // Nav order is role-aware: full admins see analytics first (their primary
  // view); household admins see invoices first because that's their job.
  // 'analytics' and 'reports' are modal overlays, not inline views — they
  // appear in the nav alongside inline pages but launch as full-screen modals.
  const adminItems: { key: AdminNavKey; label: string; icon: typeof BarChart3; adminOnly?: boolean }[] = [
    { key: 'households', label: t('admin.manageHouseholds'), icon: Home, adminOnly: true },
    { key: 'categories', label: t('admin.manageCategories'), icon: Tag, adminOnly: true },
    { key: 'uncategorized', label: t('admin.uncategorized'), icon: AlertCircle, adminOnly: true },
    { key: 'users', label: t('admin.manageUsers'), icon: Users, adminOnly: true },
    { key: 'invoices', label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'my-transactions', label: t('admin.myTransactions'), icon: Receipt },
    { key: 'analytics', label: t('admin.analytics'), icon: BarChart3 },
    { key: 'reports', label: t('reports.title'), icon: FileText },
  ];
  const haItems: typeof adminItems = [
    { key: 'invoices', label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'my-transactions', label: t('admin.myTransactions'), icon: Receipt },
    { key: 'analytics', label: t('admin.analytics'), icon: BarChart3 },
    { key: 'reports', label: t('reports.title'), icon: FileText },
  ];
  const navItems = isAdmin ? adminItems.filter((item) => !item.adminOnly || isAdmin) : haItems;

  const handleViewChange = (view: AdminNavKey) => {
    if (view === 'analytics') {
      setShowAnalytics(true);
    } else if (view === 'reports') {
      setShowReports(true);
    } else {
      setActiveView(view);
    }
    setMobileMenuOpen(false);
  };

  // For the active-state pill in the sidebar, treat the modal-overlay nav
  // items as "active" while their modal is open.
  const isItemActive = (key: AdminNavKey) => {
    if (key === 'analytics') return showAnalytics;
    if (key === 'reports') return showReports;
    return activeView === key;
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
              <h1 className="text-white font-bold text-base leading-tight">
                <LogoText betaClassName="text-emerald-300" />
              </h1>
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
                  isItemActive(key)
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
                <h1 className="text-white font-bold text-lg leading-tight">
                  <LogoText betaClassName="text-emerald-300" />
                </h1>
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
              onClick={() => handleViewChange(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isItemActive(key)
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
          {canSubmit && (
            // On mobile: full-width action cards stacked side-by-side (matches
            // the contractor dashboard so the primary tasks are unmissable).
            // On desktop: compact toolbar so admin pages have more breathing room.
            <div className="grid grid-cols-2 gap-3 mb-6 lg:flex lg:flex-wrap lg:gap-2">
              <button
                onClick={() => setShowAddExpense(true)}
                className="group flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-2 p-4 lg:px-4 lg:py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl lg:rounded-xl transition-all shadow-sm text-left active:scale-[0.99]"
              >
                <div className="w-10 h-10 lg:w-auto lg:h-auto rounded-xl lg:rounded-none bg-white/15 lg:bg-transparent flex items-center justify-center group-hover:bg-white/20 lg:group-hover:bg-transparent transition-colors">
                  <Plus className="w-5 h-5 lg:w-4 lg:h-4" />
                </div>
                <div className="lg:contents">
                  <div className="font-semibold text-sm lg:text-sm leading-tight">{t('dashboard.addTransaction')}</div>
                  <div className="lg:hidden text-xs text-emerald-100/80 mt-1">{t('dashboard.addTransactionHint')}</div>
                </div>
              </button>
              <button
                onClick={() => setShowInvoiceForm(true)}
                className="group flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-2 p-4 lg:px-4 lg:py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl lg:rounded-xl transition-all shadow-sm text-left active:scale-[0.99]"
              >
                <div className="w-10 h-10 lg:w-auto lg:h-auto rounded-xl lg:rounded-none bg-emerald-100 lg:bg-transparent flex items-center justify-center group-hover:bg-emerald-200 lg:group-hover:bg-transparent transition-colors">
                  <FileText className="w-5 h-5 lg:w-4 lg:h-4" />
                </div>
                <div className="lg:contents">
                  <div className="font-semibold text-sm lg:text-sm leading-tight">{t('invoice.submitInvoice')}</div>
                  <div className="lg:hidden text-xs text-emerald-700/70 mt-1">{t('invoice.submitInvoiceHint')}</div>
                </div>
              </button>
            </div>
          )}
          {activeView === 'households' && <ManageHouseholds />}
          {activeView === 'categories' && <ManageCategories />}
          {activeView === 'uncategorized' && <UncategorizedTransactions />}
          {activeView === 'users' && <ManageUsers />}
          {activeView === 'invoices' && <AdminInvoices />}
          {activeView === 'my-transactions' && (
            <ExpenseList
              expenses={expenses}
              households={households}
              loading={expensesLoading}
              onReload={reloadExpenses}
              ownSubmissionsOnly
              hideFilters
            />
          )}
        </div>
      </main>

      {showAnalytics && <AdminAnalytics onClose={() => setShowAnalytics(false)} />}
      {showReports && <Reports onClose={() => setShowReports(false)} />}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showAddExpense && (
        <AddExpense onClose={() => setShowAddExpense(false)} onSaved={reloadExpenses} />
      )}
      {showInvoiceForm && (
        <InvoiceForm onClose={() => setShowInvoiceForm(false)} onSaved={() => { /* AdminInvoices reloads when opened */ }} />
      )}
    </div>
  );
}
