import { useT } from '../hooks/useT';
import type { ContractorInvoice, InvoiceStatus } from '../types/invoice';

interface InvoiceListProps {
  invoices: ContractorInvoice[];
  loading: boolean;
  onReload: () => void;
}

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  // Prominent, solid-filled badges so contractors can see invoice status
  // at a glance. Status is the single most important piece of information on
  // this card — it's what the contractor is checking each time they return.
  const styles: Record<InvoiceStatus, string> = {
    pending: 'bg-amber-500 text-white ring-1 ring-amber-600/20',
    paid:    'bg-emerald-600 text-white ring-1 ring-emerald-700/20',
  };
  const dots: Record<InvoiceStatus, string> = {
    pending: 'bg-amber-200',
    paid:    'bg-emerald-200',
  };
  const labels: Record<InvoiceStatus, string> = {
    pending: t('invoice.statusPending'),
    paid:    t('invoice.statusPaid'),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

export function InvoiceList({ invoices, loading, onReload: _onReload }: InvoiceListProps) {
  const { t, locale } = useT();

  // Safe date parsing — never new Date(dateString) directly
  const fmtDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const fmtCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-3 w-40 bg-slate-100 rounded" />
              </div>
              <div className="h-6 w-16 bg-slate-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500 text-sm">{t('invoice.noInvoicesYet')}</p>
        <p className="text-slate-400 text-xs mt-1">{t('invoice.noInvoicesHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold text-slate-900 text-sm">
                  {inv.invoice_number || t('invoice.noNumberPlaceholder')}
                </span>
                {inv.household_name && inv.household_name !== '—' && (
                  <span className="text-xs text-slate-500 truncate">{inv.household_name}</span>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-1">
                {fmtDate(inv.service_date_start)}
                {inv.service_date_end !== inv.service_date_start && (
                  <> – {fmtDate(inv.service_date_end)}</>
                )}
              </p>

              {inv.description && (
                <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{inv.description}</p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="font-semibold text-slate-900 text-sm">
                {fmtCurrency(inv.amount, inv.currency)}
              </span>
              <StatusBadge status={inv.status} t={t} />
            </div>
          </div>

          {/* Submitted date */}
          <p className="text-xs text-slate-400 mt-3">
            {t('invoice.submittedOn')} {fmtDate(inv.created_at.split('T')[0])}
          </p>
        </div>
      ))}
    </div>
  );
}
