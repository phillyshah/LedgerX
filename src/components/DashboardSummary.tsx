import { useMemo } from 'react';
import { DollarSign, Calendar, Tag, Hash, TrendingUp, TrendingDown } from 'lucide-react';
import type { Expense } from '../types/expense';

interface DashboardSummaryProps {
  expenses: Expense[];
  loading: boolean;
}

export function DashboardSummary({ expenses, loading }: DashboardSummaryProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    const currentMonthStart = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;
    const currentMonthEnd = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-31`;

    const lastMonthDate = new Date(curYear, curMonth - 1, 1);
    const lmYear = lastMonthDate.getFullYear();
    const lmMonth = lastMonthDate.getMonth();
    const lastMonthStart = `${lmYear}-${String(lmMonth + 1).padStart(2, '0')}-01`;
    const lastMonthEnd = `${lmYear}-${String(lmMonth + 1).padStart(2, '0')}-31`;

    const lastMonthName = lastMonthDate.toLocaleDateString('en-US', { month: 'long' });

    const currentMonthExpenses = expenses.filter(
      (e) => e.expense_date >= currentMonthStart && e.expense_date <= currentMonthEnd
    );
    const lastMonthExpenses = expenses.filter(
      (e) => e.expense_date >= lastMonthStart && e.expense_date <= lastMonthEnd
    );

    const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.total, 0);
    const lastMonthTotal = lastMonthExpenses.reduce((sum, e) => sum + e.total, 0);
    const transactionCount = currentMonthExpenses.length;

    // Top category this month
    const categoryMap = new Map<string, number>();
    currentMonthExpenses.forEach((e) => {
      const cat = e.category || 'Uncategorized';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + e.total);
    });

    let topCategory = '—';
    let topCategoryTotal = 0;
    categoryMap.forEach((total, cat) => {
      if (total > topCategoryTotal) {
        topCategory = cat;
        topCategoryTotal = total;
      }
    });

    // % change
    let percentChange: number | null = null;
    if (lastMonthTotal > 0) {
      percentChange = ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    }

    return {
      currentMonthTotal,
      lastMonthTotal,
      lastMonthName,
      transactionCount,
      topCategory,
      topCategoryTotal,
      percentChange,
    };
  }, [expenses]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 animate-pulse">
            <div className="h-4 w-20 bg-slate-100 rounded mb-3" />
            <div className="h-7 w-24 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (expenses.length === 0) return null;

  const cards = [
    {
      label: 'This Month',
      value: fmt(stats.currentMonthTotal),
      icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      secondary:
        stats.percentChange !== null ? (
          <span className={`inline-flex items-center gap-0.5 ${stats.percentChange <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {stats.percentChange <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {Math.abs(stats.percentChange).toFixed(0)}% vs last month
          </span>
        ) : (
          <span>First month tracking</span>
        ),
    },
    {
      label: 'Last Month',
      value: fmt(stats.lastMonthTotal),
      icon: Calendar,
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-600',
      secondary: <span>{stats.lastMonthName}</span>,
    },
    {
      label: 'Top Category',
      value: stats.topCategory,
      icon: Tag,
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
      secondary: stats.topCategoryTotal > 0 ? <span>{fmt(stats.topCategoryTotal)}</span> : <span>No data</span>,
    },
    {
      label: 'Transactions',
      value: String(stats.transactionCount),
      icon: Hash,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      secondary: <span>this month</span>,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-7 h-7 ${card.iconBg} rounded-lg flex items-center justify-center`}>
              <card.icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
            </div>
            <span className="text-xs text-slate-500 font-medium">{card.label}</span>
          </div>
          <p className="text-xl font-bold text-slate-900 truncate">{card.value}</p>
          <p className="text-xs text-slate-400 mt-1">{card.secondary}</p>
        </div>
      ))}
    </div>
  );
}
