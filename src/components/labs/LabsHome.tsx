import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useT } from '../../hooks/useT';
import type { Expense } from '../../types/expense';
import { LabsBadge } from './LabsBadge';
import { CreditCardReconciliation } from './CreditCardReconciliation';

interface LabsHomeProps {
  expenses: Expense[];
}

type Experiment = 'cc_reconciliation';

/**
 * Landing tile grid for the Labs area — one tile today, built to hold future
 * experiments without restructuring. Each tile navigates into its own
 * self-contained screen; there's no shared "Labs" state beyond the flag
 * check that got the user here in the first place.
 */
export function LabsHome({ expenses }: LabsHomeProps) {
  const { t } = useT();
  const [active, setActive] = useState<Experiment | null>(null);

  if (active === 'cc_reconciliation') {
    return <CreditCardReconciliation expenses={expenses} onBack={() => setActive(null)} />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold text-slate-900">{t('labs.home.title')}</h2>
        <LabsBadge />
      </div>
      <p className="text-slate-500 mb-6">{t('labs.home.subtitle')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setActive('cc_reconciliation')}
          className="group flex items-start gap-4 p-5 bg-white border border-slate-200 hover:border-violet-300 rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-sm text-left active:scale-[0.99]"
        >
          <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 group-hover:bg-violet-200 transition-colors">
            <CreditCard className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{t('labs.cc.tileTitle')}</div>
            <div className="text-xs text-slate-500 mt-1">{t('labs.cc.tileHint')}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
