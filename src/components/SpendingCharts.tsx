import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { Expense } from '../types/expense';
import { useT } from '../hooks/useT';

interface SpendingChartsProps {
  expenses: Expense[];
  loading: boolean;
}

const COLORS = [
  '#059669', '#10b981', '#34d399', '#6ee7b7',
  '#0d9488', '#14b8a6', '#2dd4bf',
  '#6366f1', '#8b5cf6', '#a78bfa',
];

export function SpendingCharts({ expenses, loading }: SpendingChartsProps) {
  const { t, locale } = useT();

  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; total: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(locale, { month: 'short' });
      months.push({ key, label, total: 0 });
    }

    for (const e of expenses) {
      const expMonth = e.expense_date.substring(0, 7);
      const bucket = months.find((m) => m.key === expMonth);
      if (bucket) bucket.total += e.total;
    }

    return months;
  }, [expenses, locale]);

  const categoryData = useMemo(() => {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.expense_date.substring(0, 7) !== curKey) continue;
      const cat = e.category || t('common.uncategorized');
      map.set(cat, (map.get(cat) || 0) + e.total);
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [expenses, t]);

  if (loading || expenses.length === 0) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const hasMonthlyData = monthlyData.some((m) => m.total > 0);
  const hasCategoryData = categoryData.length > 0;

  if (!hasMonthlyData && !hasCategoryData) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {hasMonthlyData && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('charts.monthlySpending')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="spending-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? 'k' : ''}`}
                width={50}
              />
              <Tooltip
                formatter={(value) => [fmt(Number(value)), t('charts.spending')]}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#spending-grad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasCategoryData && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('charts.thisMonthByCategory')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [fmt(Number(value))]}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
