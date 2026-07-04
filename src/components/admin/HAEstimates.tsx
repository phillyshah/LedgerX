import { useEstimates } from '../../hooks/useEstimates';
import { EstimateList } from '../EstimateList';
import { useT } from '../../hooks/useT';

export function HAEstimates({ onAdd, openId, onOpenHandled }: {
  onAdd?: () => void;
  /** Notification deep-link forwarded to the underlying EstimateList. */
  openId?: string | null;
  onOpenHandled?: () => void;
}) {
  const { t } = useT();
  const { estimates, loading, reloadEstimates } = useEstimates();
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">{t('adminEstimates.title')}</h2>
        <p className="text-slate-500 mt-1">{t('estimate.networkEstimatesHint')}</p>
      </div>
      <EstimateList
        estimates={estimates}
        loading={loading}
        onReload={reloadEstimates}
        onAdd={onAdd}
        openId={openId}
        onOpenHandled={onOpenHandled}
      />
    </div>
  );
}
