import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { useExpenses } from '../hooks/useExpenses';
import { useInvoices } from '../hooks/useInvoices';
import { ExpenseList } from './ExpenseList';
import { DashboardSummary } from './DashboardSummary';
import { AddExpense, type AddExpenseInitialData } from './AddExpense';
import { InvoiceForm, type InvoiceFormInitialData } from './InvoiceForm';
import { InvoiceList } from './InvoiceList';
import { ExportData } from './ExportData';
import { Reports } from './Reports';
import { LogOut, Plus, Download, FileText, Settings, HelpCircle } from 'lucide-react';
import { UserSettings } from './UserSettings';
import { LogoText } from './LogoText';
import { SpendingCharts } from './SpendingCharts';
import { HelpModal } from './HelpModal';
import { BellButton } from './BellButton';
import { WhatsNewModal } from './WhatsNewModal';
import { EmailInboxPanel } from './EmailInboxPanel';
import { CollapsibleSection } from './CollapsibleSection';
import { useEmailInbox, type InboxItem } from '../hooks/useEmailInbox';
import { Mail, Inbox, BarChart3, ListChecks, FileSignature } from 'lucide-react';
import { APP_VERSION } from '../version';

export function Dashboard() {
  const { signOut, isContractor } = useAuth();
  const { t } = useT();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [expenseInitialData, setExpenseInitialData] = useState<AddExpenseInitialData | undefined>();
  const [invoiceInitialData, setInvoiceInitialData] = useState<InvoiceFormInitialData | undefined>();

  // Regular users and contractors only ever see receipts they personally
  // submitted — no commingling with other household members. Admins and
  // household admins use AdminLayout (which calls useExpenses without
  // ownOnly) and are routed elsewhere by App.tsx, so they aren't affected.
  const { expenses, households, loading, reloadExpenses } = useExpenses(undefined, { ownOnly: true });
  const { invoices, loading: invoicesLoading, reloadInvoices } = useInvoices();
  // Used only to know whether to surface the email-inbox section. The
  // EmailInboxPanel runs its own copy of this hook for live state — both
  // share Supabase's underlying fetch result so the cost is negligible.
  const { items: inboxItems } = useEmailInbox(0);
  const inboxCount = inboxItems.length;

  const handleExpenseAdded = () => {
    reloadExpenses();
  };

  const handleInboxExpense = (item: InboxItem) => {
    setExpenseInitialData({
      vendor: item.prefilled.vendor_name ?? undefined,
      total: item.prefilled.total_amount != null ? String(item.prefilled.total_amount) : undefined,
      expense_date: item.prefilled.transaction_date ?? undefined,
      notes: item.prefilled.handwritten_notes ?? undefined,
      attachment_paths: item.attachment_paths,
    });
    setShowAddExpense(true);
  };

  const handleInboxInvoice = (item: InboxItem) => {
    setInvoiceInitialData({
      vendor_name: item.prefilled.vendor_name ?? undefined,
      invoice_number: item.prefilled.invoice_number ?? undefined,
      amount: item.prefilled.total_amount != null ? String(item.prefilled.total_amount) : undefined,
      description: item.prefilled.description ?? undefined,
      invoice_date: item.prefilled.invoice_date ?? undefined,
      attachment_paths: item.attachment_paths,
    });
    setShowInvoiceForm(true);
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
      <h1 className="text-2xl font-bold text-slate-900">
        <LogoText betaClassName="text-emerald-700" />
      </h1>
    </div>
  );

  const HeaderActions = (
    <div className="flex items-center gap-1 sm:gap-2">
      <span className="hidden md:inline text-xs text-slate-400 font-medium pr-2 border-r border-slate-200 mr-1">
        {APP_VERSION}
      </span>
      <BellButton onClick={() => setShowWhatsNew(true)} />
      <button
        onClick={() => setShowHelp(true)}
        className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
        aria-label={t('common.help')}
        title={t('common.help')}
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      <button
        onClick={() => setShowSettings(true)}
        className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
        aria-label={t('common.settings')}
        title={t('common.settings')}
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

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Action cards — side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowAddExpense(true)}
              className="group flex flex-col items-start gap-3 p-5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl transition-all shadow-sm text-left active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-base leading-tight">{t('dashboard.addTransaction')}</div>
                <div className="text-xs text-emerald-100/80 mt-1">{t('dashboard.addTransactionHint')}</div>
              </div>
            </button>
            <button
              onClick={() => setShowInvoiceForm(true)}
              className="group flex flex-col items-start gap-3 p-5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl transition-all shadow-sm text-left active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-base leading-tight">{t('invoice.submitInvoice')}</div>
                <div className="text-xs text-emerald-700/70 mt-1">{t('invoice.submitInvoiceHint')}</div>
              </div>
            </button>
          </div>

          {/* Email inbox — forwarded receipts/invoices awaiting review.
              Only surfaces when there's at least one pending item. */}
          <CollapsibleSection
            storageKey="contractor.inbox"
            title={t('inbox.pendingTitle')}
            icon={<Mail className="w-4 h-4" />}
            meta={inboxCount > 0 ? `${inboxCount}` : undefined}
            hidden={inboxCount === 0}
          >
            <EmailInboxPanel
              onOpenExpense={handleInboxExpense}
              onOpenInvoice={handleInboxInvoice}
            />
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="contractor.invoices"
            title={t('invoice.myInvoices')}
            icon={<FileSignature className="w-4 h-4" />}
          >
            <InvoiceList
              invoices={invoices}
              loading={invoicesLoading}
              onReload={reloadInvoices}
            />
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="contractor.submissions"
            title={t('dashboard.yourSubmissions')}
            icon={<ListChecks className="w-4 h-4" />}
          >
            <ExpenseList
              expenses={expenses}
              households={households}
              loading={loading}
              onReload={reloadExpenses}
              ownSubmissionsOnly
              hideFilters
              hideHeader
            />
          </CollapsibleSection>
        </main>

        {showAddExpense && (
          <AddExpense
            onClose={() => { setShowAddExpense(false); setExpenseInitialData(undefined); }}
            onSaved={handleExpenseAdded}
            initialData={expenseInitialData}
          />
        )}
        {showInvoiceForm && (
          <InvoiceForm
            onClose={() => { setShowInvoiceForm(false); setInvoiceInitialData(undefined); }}
            onSaved={reloadInvoices}
            initialData={invoiceInitialData}
          />
        )}
        {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
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

          {/* Email inbox — only surfaces when at least one pending item */}
          <CollapsibleSection
            storageKey="dashboard.inbox"
            title={t('inbox.pendingTitle')}
            icon={<Mail className="w-4 h-4" />}
            meta={inboxCount > 0 ? `${inboxCount}` : undefined}
            hidden={inboxCount === 0}
          >
            <EmailInboxPanel
              onOpenExpense={handleInboxExpense}
              onOpenInvoice={handleInboxInvoice}
            />
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="dashboard.summary"
            title={t('dashboard.summaryTitle')}
            icon={<Inbox className="w-4 h-4" />}
          >
            <DashboardSummary expenses={expenses} loading={loading} />
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="dashboard.charts"
            title={t('dashboard.chartsTitle')}
            icon={<BarChart3 className="w-4 h-4" />}
          >
            <SpendingCharts expenses={expenses} loading={loading} />
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="dashboard.transactions"
            title={t('expenses.heading')}
            icon={<ListChecks className="w-4 h-4" />}
            meta={expenses.length > 0 ? `${expenses.length}` : undefined}
          >
            <ExpenseList
              expenses={expenses}
              households={households}
              loading={loading}
              onReload={reloadExpenses}
              hideHeader
            />
          </CollapsibleSection>
        </div>
      </main>

      {showAddExpense && (
        <AddExpense
          onClose={() => { setShowAddExpense(false); setExpenseInitialData(undefined); }}
          onSaved={handleExpenseAdded}
          initialData={expenseInitialData}
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

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}

      {showWhatsNew && (
        <WhatsNewModal onClose={() => setShowWhatsNew(false)} />
      )}
    </div>
  );
}
