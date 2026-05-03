import { Suspense, lazy, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { ExpenseList } from '../ExpenseList';
import { BellButton } from '../BellButton';
import { APP_VERSION } from '../../version';
import { LogoText } from '../LogoText';
import { useExpenses } from '../../hooks/useExpenses';
import {
  BarChart3, Home, Tag, LogOut, FileText, AlertCircle, Users, Menu, X,
  HelpCircle, HardHat, Plus, Receipt, Store, Settings, ChevronDown,
} from 'lucide-react';
// hasUnreadReleases / LAST_SEEN_KEY removed — BellButton owns all unread tracking internally

const ManageHouseholds    = lazy(() => import('./ManageHouseholds').then((m) => ({ default: m.ManageHouseholds })));
const ManageCategories    = lazy(() => import('./ManageCategories').then((m) => ({ default: m.ManageCategories })));
const ManageVendors       = lazy(() => import('./ManageVendors').then((m) => ({ default: m.ManageVendors })));
const AdminAnalytics      = lazy(() => import('./AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })));
const UncategorizedTransactions = lazy(() => import('./UncategorizedTransactions').then((m) => ({ default: m.UncategorizedTransactions })));
const ManageUsers         = lazy(() => import('./ManageUsers').then((m) => ({ default: m.ManageUsers })));
const AdminInvoices       = lazy(() => import('./AdminInvoices').then((m) => ({ default: m.AdminInvoices })));
const Reports             = lazy(() => import('../Reports').then((m) => ({ default: m.Reports })));
const AddExpense          = lazy(() => import('../AddExpense').then((m) => ({ default: m.AddExpense })));
const InvoiceForm         = lazy(() => import('../InvoiceForm').then((m) => ({ default: m.InvoiceForm })));
const HelpModal           = lazy(() => import('../HelpModal').then((m) => ({ default: m.HelpModal })));
const WhatsNewModal       = lazy(() => import('../WhatsNewModal').then((m) => ({ default: m.WhatsNewModal })));
const UserSettings        = lazy(() => import('../UserSettings').then((m) => ({ default: m.UserSettings })));

function ViewSkeleton() {
  return <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 h-64 animate-pulse" />;
}

type AdminView =
  | 'home'
  | 'households'
  | 'categories'
  | 'vendors'
  | 'uncategorized'
  | 'users'
  | 'invoices'
  | 'reports'
  | 'my-transactions';

type AdminNavKey = AdminView | 'analytics';

// ── Home screen (full admin only) ─────────────────────────────────────────────

interface AdminHomeViewProps {
  username: string;
  onNavigate: (view: AdminNavKey) => void;
  onAddExpense: () => void;
  onSubmitInvoice: () => void;
}

function AdminHomeView({ username, onNavigate, onAddExpense, onSubmitInvoice }: AdminHomeViewProps) {
  const { t } = useT();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t('admin.welcomeBack', { name: username })}
        </h2>
        <p className="text-slate-500 mt-1">{t('admin.welcomeSub')}</p>
      </div>

      <section>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
          {t('admin.quickActions')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onAddExpense}
            className="group flex items-center gap-3 p-4 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl transition-all shadow-sm text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center group-hover:bg-white/20 transition-colors shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{t('dashboard.addTransaction')}</div>
              <div className="text-xs text-emerald-100/80 mt-1">{t('dashboard.addTransactionHint')}</div>
            </div>
          </button>
          <button
            onClick={onSubmitInvoice}
            className="group flex items-center gap-3 p-4 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl transition-all shadow-sm text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{t('invoice.submitInvoice')}</div>
              <div className="text-xs text-emerald-700/70 mt-1">{t('invoice.submitInvoiceHint')}</div>
            </div>
          </button>
        </div>
      </section>

      <section>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
          {t('admin.navigateTo')}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {(
            [
              { key: 'uncategorized' as AdminNavKey, icon: AlertCircle, label: t('admin.uncategorized'), warn: true },
              { key: 'invoices'        as AdminNavKey, icon: HardHat,   label: t('admin.contractorInvoices') },
              { key: 'my-transactions' as AdminNavKey, icon: Receipt,   label: t('admin.myTransactions') },
              { key: 'analytics'       as AdminNavKey, icon: BarChart3, label: t('admin.analytics') },
              { key: 'reports'         as AdminNavKey, icon: FileText,  label: t('reports.title') },
            ] as { key: AdminNavKey; icon: typeof AlertCircle; label: string; warn?: boolean }[]
          ).map(({ key, icon: Icon, label, warn }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98] ${
                warn
                  ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                  : 'bg-white border-slate-200 hover:border-emerald-200'
              }`}
            >
              <Icon className={`w-6 h-6 ${warn ? 'text-amber-600' : 'text-emerald-700'}`} />
              <span className={`text-xs font-semibold text-center leading-tight ${warn ? 'text-amber-800' : 'text-slate-700'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
          {t('admin.configuration')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { key: 'households' as AdminNavKey, icon: Home,  label: t('admin.manageHouseholds') },
              { key: 'categories' as AdminNavKey, icon: Tag,   label: t('admin.manageCategories') },
              { key: 'vendors'    as AdminNavKey, icon: Store, label: t('admin.manageVendors') },
              { key: 'users'      as AdminNavKey, icon: Users, label: t('admin.manageUsers') },
            ] as { key: AdminNavKey; icon: typeof Home; label: string }[]
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="flex flex-col items-center gap-2 p-4 bg-slate-50 border border-slate-200 hover:bg-white hover:border-emerald-200 rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98]"
            >
              <Icon className="w-5 h-5 text-slate-500" />
              <span className="text-xs font-medium text-slate-600 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export function AdminLayout() {
  const { signOut, isAdmin, isHouseholdAdmin, user } = useAuth();
  const { t } = useT();

  const [activeView, setActiveView] = useState<AdminView>(
    isAdmin ? 'home' : 'invoices'
  );
  const [manageOpen, setManageOpen] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // No hasUnread state here — BellButton manages its own unread tracking via storage events
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);

  const { expenses, households, loading: expensesLoading, reloadExpenses } = useExpenses();

  const username = user?.email?.split('@')[0] ?? 'admin';

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

  const navItemCls = (key: AdminNavKey) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isItemActive(key)
        ? 'bg-emerald-700 text-white shadow-sm'
        : 'text-emerald-200 hover:text-white hover:bg-emerald-800'
    }`;

  const subItemCls = (key: AdminNavKey) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
      isItemActive(key)
        ? 'bg-emerald-700 text-white'
        : 'text-emerald-300 hover:text-white hover:bg-emerald-800/60'
    }`;

  // Household-admin nav (unchanged from original haItems list)
  const haNavItems: { key: AdminNavKey; label: string; icon: typeof BarChart3 }[] = [
    { key: 'invoices',        label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'my-transactions', label: t('admin.myTransactions'),     icon: Receipt },
    { key: 'analytics',       label: t('admin.analytics'),          icon: BarChart3 },
    { key: 'reports',         label: t('reports.title'),            icon: FileText },
  ];

  // Admin daily-use items (below the Manage group)
  const adminNavItems: { key: AdminNavKey; label: string; icon: typeof BarChart3 }[] = [
    { key: 'uncategorized',   label: t('admin.uncategorized'),      icon: AlertCircle },
    { key: 'invoices',        label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'my-transactions', label: t('admin.myTransactions'),     icon: Receipt },
    { key: 'analytics',       label: t('admin.analytics'),          icon: BarChart3 },
    { key: 'reports',         label: t('reports.title'),            icon: FileText },
  ];

  const manageSubItems: { key: AdminNavKey; label: string; icon: typeof Home }[] = [
    { key: 'households', label: t('admin.manageHouseholds'), icon: Home },
    { key: 'categories', label: t('admin.manageCategories'), icon: Tag },
    { key: 'vendors',    label: t('admin.manageVendors'),    icon: Store },
    { key: 'users',      label: t('admin.manageUsers'),      icon: Users },
  ];

  const bottomNavItems = isAdmin ? adminNavItems : haNavItems;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">

      {/* ── Full-width top header ── */}
      <header className="bg-gradient-to-r from-emerald-950 to-emerald-900 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-700 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-white font-bold text-base leading-tight">
                <LogoText betaClassName="text-emerald-300" />
              </h1>
              <span className="hidden sm:inline text-[10px] font-semibold bg-white/10 text-emerald-300 px-2 py-0.5 rounded">
                Admin Panel
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="hidden md:inline text-xs text-emerald-400 font-medium pr-3 mr-1 border-r border-emerald-700/60">
              {APP_VERSION}
            </span>
            <BellButton onClick={() => setShowWhatsNew(true)} dark compact />
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
              title={t('common.help')}
              aria-label={t('common.help')}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
              title={t('common.settings')}
              aria-label={t('common.settings')}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 p-2 sm:px-3 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
              title={t('common.signOut')}
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline text-sm font-medium">{t('common.signOut')}</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileMenuOpen && (
          <nav className="lg:hidden border-t border-emerald-800 p-3 space-y-0.5">
            {isAdmin && (
              <>
                <button onClick={() => handleViewChange('home')} className={navItemCls('home')}>
                  <Home className="w-4 h-4 shrink-0" />
                  {t('admin.home')}
                </button>
                <div className="h-px bg-emerald-800 mx-2 my-1.5" />
                <button
                  onClick={() => setManageOpen(!manageOpen)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  {t('admin.manage')}
                  <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${manageOpen ? 'rotate-180' : ''}`} />
                </button>
                {manageOpen && (
                  <div className="pl-4 space-y-0.5">
                    {manageSubItems.map(({ key, icon: Icon, label }) => (
                      <button key={key} onClick={() => handleViewChange(key)} className={subItemCls(key)}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="h-px bg-emerald-800 mx-2 my-1.5" />
              </>
            )}
            {bottomNavItems.map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => handleViewChange(key)} className={navItemCls(key)}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 min-h-0">

        {/* Desktop sidebar — nav only */}
        <aside className="hidden lg:flex w-56 bg-emerald-950 flex-col shrink-0">
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {isAdmin && (
              <>
                <button onClick={() => handleViewChange('home')} className={navItemCls('home')}>
                  <Home className="w-4 h-4 shrink-0" />
                  {t('admin.home')}
                </button>
                <div className="h-px bg-emerald-800 mx-2 my-1.5" />
                <button
                  onClick={() => setManageOpen(!manageOpen)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  {t('admin.manage')}
                  <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${manageOpen ? 'rotate-180' : ''}`} />
                </button>
                {manageOpen && (
                  <div className="pl-3 space-y-0.5">
                    {manageSubItems.map(({ key, icon: Icon, label }) => (
                      <button key={key} onClick={() => handleViewChange(key)} className={subItemCls(key)}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="h-px bg-emerald-800 mx-2 my-1.5" />
              </>
            )}
            {bottomNavItems.map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => handleViewChange(key)} className={navItemCls(key)}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">

            {/* Action buttons for household admins only (full admins use the home screen) */}
            {isHouseholdAdmin && !isAdmin && (
              <div className="grid grid-cols-2 gap-3 mb-6 lg:flex lg:flex-wrap lg:gap-2">
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="group flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-2 p-4 lg:px-4 lg:py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl lg:rounded-xl transition-all shadow-sm text-left active:scale-[0.99]"
                >
                  <div className="w-10 h-10 lg:w-auto lg:h-auto rounded-xl lg:rounded-none bg-white/15 lg:bg-transparent flex items-center justify-center group-hover:bg-white/20 lg:group-hover:bg-transparent transition-colors">
                    <Plus className="w-5 h-5 lg:w-4 lg:h-4" />
                  </div>
                  <div className="lg:contents">
                    <div className="font-semibold text-sm leading-tight">{t('dashboard.addTransaction')}</div>
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
                    <div className="font-semibold text-sm leading-tight">{t('invoice.submitInvoice')}</div>
                    <div className="lg:hidden text-xs text-emerald-700/70 mt-1">{t('invoice.submitInvoiceHint')}</div>
                  </div>
                </button>
              </div>
            )}

            {/* Home screen — full admin only */}
            {activeView === 'home' && isAdmin && (
              <AdminHomeView
                username={username}
                onNavigate={handleViewChange}
                onAddExpense={() => setShowAddExpense(true)}
                onSubmitInvoice={() => setShowInvoiceForm(true)}
              />
            )}

            <Suspense fallback={<ViewSkeleton />}>
              {activeView === 'households'    && <ManageHouseholds />}
              {activeView === 'categories'    && <ManageCategories />}
              {activeView === 'vendors'       && <ManageVendors />}
              {activeView === 'uncategorized' && <UncategorizedTransactions />}
              {activeView === 'users'         && <ManageUsers />}
              {activeView === 'invoices'      && <AdminInvoices />}
            </Suspense>

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
      </div>

      <Suspense fallback={null}>
        {showAnalytics && <AdminAnalytics onClose={() => setShowAnalytics(false)} />}
        {showReports   && <Reports        onClose={() => setShowReports(false)} />}
        {showHelp      && <HelpModal      onClose={() => setShowHelp(false)} />}
        {showWhatsNew  && <WhatsNewModal  onClose={() => setShowWhatsNew(false)} />}
        {showSettings  && <UserSettings   onClose={() => setShowSettings(false)} />}
        {showAddExpense && (
          <AddExpense onClose={() => setShowAddExpense(false)} onSaved={reloadExpenses} />
        )}
        {showInvoiceForm && (
          <InvoiceForm onClose={() => setShowInvoiceForm(false)} onSaved={() => { }} />
        )}
      </Suspense>
    </div>
  );
}
