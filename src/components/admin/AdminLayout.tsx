import { Suspense, lazy, useCallback, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { ExpenseList } from '../ExpenseList';
import { CollapsibleSection } from '../CollapsibleSection';
import { UserMenu } from '../UserMenu';
import { LogoText } from '../LogoText';
import { AppFooter } from '../AppFooter';
import { NotificationBell } from '../NotificationBell';
import { AdminEmailInbox } from './AdminEmailInbox';
import { useExpenses } from '../../hooks/useExpenses';
import { useLabsAccess } from '../../hooks/useLabsAccess';
import type { AppNotification } from '../../types/notification';
import { useInitialDeepLink } from '../../hooks/useInitialDeepLink';
import type { ReportsTab } from './ReportsHub';
import {
  BarChart3, Home, Tag, FileText, AlertCircle, Users, Menu, X,
  HardHat, Plus, Receipt, Store, Settings, ChevronDown, Activity, ClipboardList, PieChart, CreditCard, HelpCircle, LogOut,
  Landmark,
  FlaskConical,
  ReceiptText,
} from 'lucide-react';
import { APP_VERSION } from '../../version';
// hasUnreadReleases / LAST_SEEN_KEY removed — AppFooter owns all unread tracking internally

const ManageHouseholds    = lazy(() => import('./ManageHouseholds').then((m) => ({ default: m.ManageHouseholds })));
const ManageCategories    = lazy(() => import('./ManageCategories').then((m) => ({ default: m.ManageCategories })));
const ManageVendors       = lazy(() => import('./ManageVendors').then((m) => ({ default: m.ManageVendors })));
const UncategorizedTransactions = lazy(() => import('./UncategorizedTransactions').then((m) => ({ default: m.UncategorizedTransactions })));
const ManageUsers         = lazy(() => import('./ManageUsers').then((m) => ({ default: m.ManageUsers })));
const AdminInvoices       = lazy(() => import('./AdminInvoices').then((m) => ({ default: m.AdminInvoices })));
const AdminEstimates      = lazy(() => import('./AdminEstimates').then((m) => ({ default: m.AdminEstimates })));
const HAEstimates         = lazy(() => import('./HAEstimates').then((m) => ({ default: m.HAEstimates })));
const ReportsHub          = lazy(() => import('./ReportsHub').then((m) => ({ default: m.ReportsHub })));
const TaxCenter           = lazy(() => import('./tax/TaxCenter').then((m) => ({ default: m.TaxCenter })));
const AddExpense          = lazy(() => import('../AddExpense').then((m) => ({ default: m.AddExpense })));
const InvoiceForm         = lazy(() => import('../InvoiceForm').then((m) => ({ default: m.InvoiceForm })));
const EstimateForm        = lazy(() => import('../EstimateForm').then((m) => ({ default: m.EstimateForm })));
const HelpModal           = lazy(() => import('../HelpModal').then((m) => ({ default: m.HelpModal })));
const WhatsNewModal       = lazy(() => import('../WhatsNewModal').then((m) => ({ default: m.WhatsNewModal })));
const UserSettings        = lazy(() => import('../UserSettings').then((m) => ({ default: m.UserSettings })));
const CreditCardReconciliation = lazy(() => import('../labs/CreditCardReconciliation').then((m) => ({ default: m.CreditCardReconciliation })));

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
  | 'estimates'
  | 'reports'
  | 'my-transactions'
  | 'reconciliation';

type AdminNavKey = AdminView | 'analytics' | 'activity' | 'estimate-report' | 'tax' | 'reports-hub';

// ── Household-admin quick-action row ──────────────────────────────────────────
//
// The solid-filled button follows the section you're looking at. Previously
// "Add Transaction" was always the loud green one, so people reviewing
// Contractor Invoices clicked it and believed they'd uploaded an invoice.
// Nothing moves — only the emphasis changes — so muscle memory for position
// still works.

type QuickAction = 'expense' | 'invoice' | 'estimate';

const PRIMARY_ACTION_FOR_VIEW: Partial<Record<AdminView, QuickAction>> = {
  invoices: 'invoice',
  estimates: 'estimate',
};

const QA_BASE =
  'group flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-2 p-4 lg:px-4 lg:py-2.5 rounded-2xl lg:rounded-xl transition-all shadow-sm text-left active:scale-[0.99]';
const QA_SOLID = 'bg-emerald-900 hover:bg-emerald-800 text-white';
const QA_OUTLINE = 'bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200';
const QA_CHIP_BASE =
  'w-10 h-10 lg:w-auto lg:h-auto rounded-xl lg:rounded-none flex items-center justify-center transition-colors';
const QA_CHIP_SOLID = 'bg-white/15 lg:bg-transparent group-hover:bg-white/20 lg:group-hover:bg-transparent';
const QA_CHIP_OUTLINE = 'bg-emerald-100 lg:bg-transparent group-hover:bg-emerald-200 lg:group-hover:bg-transparent';

function QuickActionButton({
  primary,
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  primary: boolean;
  icon: typeof Plus;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`${QA_BASE} ${primary ? QA_SOLID : QA_OUTLINE}`}>
      <div className={`${QA_CHIP_BASE} ${primary ? QA_CHIP_SOLID : QA_CHIP_OUTLINE}`}>
        <Icon className="w-5 h-5 lg:w-4 lg:h-4" />
      </div>
      <div className="lg:contents">
        <div className="font-semibold text-sm leading-tight">{label}</div>
        <div className={`lg:hidden text-xs mt-1 ${primary ? 'text-emerald-100/80' : 'text-emerald-700/70'}`}>
          {hint}
        </div>
      </div>
    </button>
  );
}

// ── Home screen (full admin only) ─────────────────────────────────────────────

interface AdminHomeViewProps {
  username: string;
  canReconcile: boolean;
  onNavigate: (view: AdminNavKey) => void;
  onAddExpense: () => void;
  onSubmitInvoice: () => void;
  onSubmitEstimate: () => void;
}

function AdminHomeView({ username, canReconcile, onNavigate, onAddExpense, onSubmitInvoice, onSubmitEstimate }: AdminHomeViewProps) {
  const { t } = useT();

  // "Review" = operational queues you act on; Reconciliation joins them as a
  // normal peer tile (only when enrolled) rather than a special/experimental
  // callout, which is the whole point of graduating it out of Labs.
  const reviewTiles: { key: AdminNavKey; icon: typeof AlertCircle; label: string; warn?: boolean }[] = [
    { key: 'uncategorized', icon: AlertCircle, label: t('admin.uncategorized'), warn: true },
    { key: 'invoices', icon: HardHat, label: t('admin.contractorInvoices') },
    { key: 'estimates', icon: ClipboardList, label: t('adminEstimates.navLabel') },
    { key: 'my-transactions', icon: Receipt, label: t('admin.myTransactions') },
    ...(canReconcile ? [{ key: 'reconciliation' as AdminNavKey, icon: CreditCard, label: t('reconciliation.navLabel') }] : []),
  ];

  const insightTiles: { key: AdminNavKey; icon: typeof AlertCircle; label: string }[] = [
    { key: 'analytics', icon: BarChart3, label: t('admin.analytics') },
    { key: 'reports', icon: FileText, label: t('reports.title') },
    { key: 'activity', icon: Activity, label: t('activityReport.title') },
    { key: 'estimate-report', icon: PieChart, label: t('estimateReport.navLabel') },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t('admin.welcomeBack', { name: username })}
        </h2>
        <p className="text-slate-500 mt-1">{t('admin.welcomeSub')}</p>
      </div>

      {/* Email inbox — full admins see this on the home view. The
          component also renders a system-wide inbound activity panel so
          admins can verify the forward → IMAP → edge function pipeline
          is delivering rows even when their own inbox is empty. */}
      <AdminEmailInbox storageKey="admin.inbox.home" />

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
              <ReceiptText className="w-5 h-5" />
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
          <button
            onClick={onSubmitEstimate}
            className="group col-span-2 flex items-center gap-3 p-4 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl transition-all shadow-sm text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{t('estimate.submitEstimate')}</div>
              <div className="text-xs text-emerald-700/70 mt-1">{t('estimate.submitEstimateHint')}</div>
            </div>
          </button>
        </div>
      </section>

      <section>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
          {t('admin.reviewSection')}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {reviewTiles.map(({ key, icon: Icon, label, warn }) => (
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
          {t('admin.insightsSection')}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {insightTiles.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl border bg-white border-slate-200 hover:border-emerald-200 transition-all hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98]"
            >
              <Icon className="w-6 h-6 text-emerald-700" />
              <span className="text-xs font-semibold text-center leading-tight text-slate-700">
                {label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Collapsed by default: these four duplicate the sidebar's "Manage"
          group exactly, and they're the least-reached part of the landing
          screen. Nothing is removed — the tiles are one tap away, which
          matters on mobile where the sidebar lives behind the hamburger. */}
      <CollapsibleSection
        storageKey="admin.home.configuration"
        title={t('admin.configuration')}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
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
      </CollapsibleSection>
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
  // Starts closed: these are configuration screens, not daily-use ones,
  // and leaving them expanded put 4 extra items above the fold permanently.
  const [manageOpen, setManageOpen] = useState(false);
  // Analytics / Reports / Activity / Estimates are one destination now
  // (ReportsHub). This doubles as "is the hub open" and "which tab": null is
  // closed, a tab name forces that tab (home tiles, which promise a
  // destination by name), and 'remember' lets the hub restore whichever tab
  // you were last on (the generic sidebar entry, which promises nothing).
  const [reportsTab, setReportsTab] = useState<ReportsTab | 'remember' | null>(null);
  const [showTax, setShowTax] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // No hasUnread state here — AppFooter manages its own unread tracking via storage events
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showEstimateForm, setShowEstimateForm] = useState(false);

  // Notification deep-linking: switch to the estimates/invoices view and hand
  // the target id to that view, which opens its detail once its data loads.
  const [deepLink, setDeepLink] = useState<{ type: 'estimate' | 'invoice'; id: string } | null>(null);
  // A reconciliation-comment deep-link opens the reconcile screen at a line item.
  const [reconcileLineItemId, setReconcileLineItemId] = useState<string | null>(null);

  const openEntity = useCallback((type: 'estimate' | 'invoice' | 'statement_line_item', id: string) => {
    if (type === 'statement_line_item') {
      setReconcileLineItemId(id);
      setActiveView('reconciliation');
      setMobileMenuOpen(false);
      return;
    }
    setDeepLink({ type, id });
    setActiveView(type === 'estimate' ? 'estimates' : 'invoices');
    setMobileMenuOpen(false);
  }, []);

  const handleNotificationOpen = (n: AppNotification) => openEntity(n.entity_type, n.entity_id);

  // Review-queue rows from the bell. The inbox panel lives on the home view for
  // a full admin and above every view for a household admin, so 'home' works
  // for both. 'uncategorized' is a full-admin screen (its RPC refuses anyone
  // else), so a household admin — whose count only ever covers their own
  // submissions — goes to My Transactions instead.
  const handleOpenReview = useCallback((target: 'inbox' | 'uncategorized') => {
    setActiveView(target === 'inbox' ? 'home' : isAdmin ? 'uncategorized' : 'my-transactions');
    setMobileMenuOpen(false);
  }, [isAdmin]);

  // Honor a deep link arriving in the URL (e.g. from a mention email).
  useInitialDeepLink((target) => openEntity(target.type, target.id));

  const { expenses, households, loading: expensesLoading, reloadExpenses } = useExpenses();
  const { hasFlag } = useLabsAccess();
  const canReconcile = hasFlag('labs_cc_reconciliation');
  const primaryQuickAction: QuickAction = PRIMARY_ACTION_FOR_VIEW[activeView] ?? 'expense';

  const username = user?.email?.split('@')[0] ?? 'admin';

  const mainRef = useRef<HTMLElement>(null);

  // Tapping the logo returns to the landing screen and clears any nested
  // state, so users deep in a view (or a modal) always have a one-tap way out.
  // Full admins land on 'home'; household admins have no home view, so their
  // landing is the invoices list (mirrors the initial activeView above).
  const goHome = () => {
    setActiveView(isAdmin ? 'home' : 'invoices');
    setReportsTab(null);
    setShowHelp(false);
    setShowWhatsNew(false);
    setShowSettings(false);
    setShowAddExpense(false);
    setShowInvoiceForm(false);
    setShowEstimateForm(false);
    setMobileMenuOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const handleViewChange = (view: AdminNavKey) => {
    // The four old keys still resolve — a home tile or a deep link that
    // said "Activity" lands on the Activity tab, not on a generic hub.
    if (view === 'reports-hub') {
      setReportsTab('remember');
    } else if (view === 'analytics') {
      setReportsTab('analytics');
    } else if (view === 'reports') {
      setReportsTab('reports');
    } else if (view === 'activity') {
      setReportsTab('activity');
    } else if (view === 'estimate-report') {
      setReportsTab('estimates');
    } else if (view === 'tax') {
      setShowTax(true);
    } else {
      setActiveView(view);
    }
    setMobileMenuOpen(false);
  };

  const isItemActive = (key: AdminNavKey) => {
    if (key === 'reports-hub') return reportsTab !== null;
    if (key === 'tax') return showTax;
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

  // Reconciliation is a normal daily-use nav item now (promoted out of Labs),
  // inserted right after My Transactions so it sits with the operational
  // queues. Only shown to admins/household-admins enrolled in the feature.
  const reconItem = { key: 'reconciliation' as AdminNavKey, label: t('reconciliation.navLabel'), icon: CreditCard };

  // Household-admin nav (unchanged from original haItems list)
  const haNavItems: { key: AdminNavKey; label: string; icon: typeof BarChart3 }[] = [
    { key: 'invoices',        label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'estimates',       label: t('adminEstimates.navLabel'),  icon: ClipboardList },
    { key: 'my-transactions', label: t('admin.myTransactions'),     icon: Receipt },
    ...(canReconcile ? [reconItem] : []),
    { key: 'reports-hub',     label: t('reportsHub.navLabel'),      icon: BarChart3 },
  ];

  // Admin daily-use items (below the Manage group)
  const adminNavItems: { key: AdminNavKey; label: string; icon: typeof BarChart3 }[] = [
    { key: 'uncategorized',   label: t('admin.uncategorized'),      icon: AlertCircle },
    { key: 'invoices',        label: t('admin.contractorInvoices'), icon: HardHat },
    { key: 'estimates',       label: t('adminEstimates.navLabel'),  icon: ClipboardList },
    { key: 'my-transactions', label: t('admin.myTransactions'),     icon: Receipt },
    ...(canReconcile ? [reconItem] : []),
    { key: 'reports-hub',     label: t('reportsHub.navLabel'),      icon: BarChart3 },
  ];

  // Labs — full-admin only. Experimental surfaces live here instead of the
  // main nav until they've earned a permanent home. The dedicated Labs
  // *screen* was removed in v13.5; this is the nav group that replaces it.
  const labsSubItems: { key: AdminNavKey; label: string; icon: typeof Home }[] = [
    { key: 'tax', label: t('tax.navLabel'), icon: Landmark },
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
          <button
            type="button"
            onClick={goHome}
            aria-label={t('common.home')}
            title={t('common.home')}
            className="flex items-center gap-3 rounded-lg hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
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
          </button>

          <div className="flex items-center gap-1">
            <NotificationBell dark compact onOpen={handleNotificationOpen} onOpenReview={handleOpenReview} />
            {/* Desktop: account menu lives here (nav is the sidebar). Mobile:
                account actions move into the hamburger drawer, so this avatar
                is hidden to avoid two adjacent menu triggers. */}
            <div className="hidden lg:block">
              <UserMenu
                variant="dark"
                username={username}
                onShowSettings={() => setShowSettings(true)}
                onShowHelp={() => setShowHelp(true)}
                onSignOut={handleSignOut}
              />
            </div>
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

            {/* Labs — full admins only. Kept out of the main nav on purpose:
                these are still being refined, and the violet badge says so. */}
            {isAdmin && (
              <>
                <div className="h-px bg-emerald-800 mx-2 my-1.5" />
                <button
                  onClick={() => setLabsOpen(!labsOpen)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all"
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  {t('admin.labs')}
                  <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${labsOpen ? 'rotate-180' : ''}`} />
                </button>
                {labsOpen && (
                  <div className="pl-3 space-y-0.5">
                    {labsSubItems.map(({ key, icon: Icon, label }) => (
                      <button key={key} onClick={() => handleViewChange(key)} className={subItemCls(key)}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {label}
                        <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-violet-500/25 text-violet-200 rounded">
                          {t('labs.cc.auto.labsBadge')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Account actions — on mobile these live in the drawer (the avatar
                menu is desktop-only), so there's a single menu button. */}
            <div className="h-px bg-emerald-800 mx-2 my-1.5" />
            <button onClick={() => { setShowSettings(true); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all">
              <Settings className="w-4 h-4 shrink-0" />
              {t('common.settings')}
            </button>
            <button onClick={() => { setShowHelp(true); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all">
              <HelpCircle className="w-4 h-4 shrink-0" />
              {t('common.help')}
            </button>
            <button onClick={() => { handleSignOut(); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all">
              <LogOut className="w-4 h-4 shrink-0" />
              {t('common.signOut')}
            </button>
            <p className="px-3 pt-2 text-[10px] text-emerald-400/70">{APP_VERSION}</p>
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

            {/* Labs — full admins only. Kept out of the main nav on purpose:
                these are still being refined, and the violet badge says so. */}
            {isAdmin && (
              <>
                <div className="h-px bg-emerald-800 mx-2 my-1.5" />
                <button
                  onClick={() => setLabsOpen(!labsOpen)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-800 transition-all"
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  {t('admin.labs')}
                  <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${labsOpen ? 'rotate-180' : ''}`} />
                </button>
                {labsOpen && (
                  <div className="pl-3 space-y-0.5">
                    {labsSubItems.map(({ key, icon: Icon, label }) => (
                      <button key={key} onClick={() => handleViewChange(key)} className={subItemCls(key)}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {label}
                        <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-violet-500/25 text-violet-200 rounded">
                          {t('labs.cc.auto.labsBadge')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main ref={mainRef} className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">

            {/* Email inbox — household admins see this above every view
                since they don't have a "home" landing screen. Hidden
                automatically when empty; full admins see it on the
                home view (rendered inside AdminHomeView). */}
            {isHouseholdAdmin && !isAdmin && (
              <div className="mb-6">
                <AdminEmailInbox storageKey="admin.inbox.ha" />
              </div>
            )}

            {/* Action buttons for household admins only (full admins use the
                home screen). The solid one tracks activeView — see
                PRIMARY_ACTION_FOR_VIEW. */}
            {isHouseholdAdmin && !isAdmin && (
              <div className="grid grid-cols-2 gap-3 mb-6 lg:flex lg:flex-wrap lg:gap-2">
                <QuickActionButton
                  primary={primaryQuickAction === 'expense'}
                  icon={ReceiptText}
                  label={t('dashboard.addTransaction')}
                  hint={t('dashboard.addTransactionHint')}
                  onClick={() => setShowAddExpense(true)}
                />
                <QuickActionButton
                  primary={primaryQuickAction === 'invoice'}
                  icon={FileText}
                  label={t('invoice.submitInvoice')}
                  hint={t('invoice.submitInvoiceHint')}
                  onClick={() => setShowInvoiceForm(true)}
                />
                <QuickActionButton
                  primary={primaryQuickAction === 'estimate'}
                  icon={ClipboardList}
                  label={t('estimate.submitEstimate')}
                  hint={t('estimate.submitEstimateHint')}
                  onClick={() => setShowEstimateForm(true)}
                />
              </div>
            )}

            {/* Home screen — full admin only */}
            {activeView === 'home' && isAdmin && (
              <AdminHomeView
                username={username}
                canReconcile={canReconcile}
                onNavigate={handleViewChange}
                onAddExpense={() => setShowAddExpense(true)}
                onSubmitInvoice={() => setShowInvoiceForm(true)}
                onSubmitEstimate={() => setShowEstimateForm(true)}
              />
            )}

            <Suspense fallback={<ViewSkeleton />}>
              {activeView === 'households'    && <ManageHouseholds />}
              {activeView === 'categories'    && <ManageCategories />}
              {activeView === 'vendors'       && <ManageVendors />}
              {activeView === 'uncategorized' && <UncategorizedTransactions />}
              {activeView === 'users'         && <ManageUsers />}
              {activeView === 'reconciliation' && canReconcile && (
                <CreditCardReconciliation openLineItemId={reconcileLineItemId} onLineItemHandled={() => setReconcileLineItemId(null)} />
              )}
              {/* Full admins get the in-header Submit button (their quick actions
                  live only on Home). Household admins already have a persistent
                  Submit Invoice in the action row above, so omit it to avoid a
                  duplicate button on the Invoices tab. */}
              {activeView === 'invoices'      && (
                <AdminInvoices
                  onAdd={isAdmin ? () => setShowInvoiceForm(true) : undefined}
                  openId={deepLink?.type === 'invoice' ? deepLink.id : null}
                  onOpenHandled={() => setDeepLink(null)}
                />
              )}
              {activeView === 'estimates'     && isAdmin && (
                <AdminEstimates
                  onAdd={() => setShowEstimateForm(true)}
                  openId={deepLink?.type === 'estimate' ? deepLink.id : null}
                  onOpenHandled={() => setDeepLink(null)}
                />
              )}
              {/* Household admins submit estimates from the quick-action row above
                  (parity with Submit Invoice), so no in-tab button here — avoids a
                  duplicate, matching the AdminInvoices treatment. */}
              {activeView === 'estimates'     && !isAdmin && (
                <HAEstimates
                  openId={deepLink?.type === 'estimate' ? deepLink.id : null}
                  onOpenHandled={() => setDeepLink(null)}
                />
              )}
            </Suspense>

            {activeView === 'my-transactions' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{t('admin.myTransactions')}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{t('expenses.subtitleAll')}</p>
                </div>
                {/* The shell already fetches the whole household (useExpenses
                    with no ownOnly), so this defaults to all of it and lets
                    the viewer narrow with the "Just mine" chip. It used to be
                    hard-wired to own-submissions-only, which left admins with
                    no household-wide transaction list anywhere in the app. */}
                <ExpenseList
                  expenses={expenses}
                  households={households}
                  loading={expensesLoading}
                  onReload={reloadExpenses}
                  allowOwnFilter
                  hideHeader
                  onAdd={() => setShowAddExpense(true)}
                />
              </div>
            )}

            <AppFooter onWhatsNew={() => setShowWhatsNew(true)} />
          </div>
        </main>
      </div>

      <Suspense fallback={null}>
        {reportsTab && (
          <ReportsHub
            initialTab={reportsTab === 'remember' ? undefined : reportsTab}
            onClose={() => setReportsTab(null)}
          />
        )}
        {/* Tax Center is full-admin only. Household admins DO get reports
            generally, so this must gate on isAdmin specifically rather than
            riding along with the reports group. */}
        {showTax && isAdmin && <TaxCenter onClose={() => setShowTax(false)} />}

        {showHelp      && <HelpModal      onClose={() => setShowHelp(false)} />}
        {showWhatsNew  && <WhatsNewModal  onClose={() => setShowWhatsNew(false)} />}
        {showSettings  && <UserSettings   onClose={() => setShowSettings(false)} />}
        {showAddExpense && (
          <AddExpense onClose={() => setShowAddExpense(false)} onSaved={reloadExpenses} />
        )}
        {showInvoiceForm && (
          <InvoiceForm onClose={() => setShowInvoiceForm(false)} onSaved={() => { }} />
        )}
        {showEstimateForm && (
          <EstimateForm onClose={() => setShowEstimateForm(false)} onSaved={() => { }} />
        )}
      </Suspense>
    </div>
  );
}
