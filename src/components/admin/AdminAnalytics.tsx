import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Receipt, Home, Calendar, Download, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { EditExpense } from '../EditExpense';

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  transcript: string | null;
  household_id: string;
  household_name?: string;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
}

interface Household {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  household_id: string | null;
}

interface GroupedData {
  label: string;
  total: number;
  count: number;
}

export function AdminAnalytics() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'30d' | '90d' | 'ytd' | 'custom'>('30d');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    loadData();
  }, [dateRange, customStartDate, customEndDate]);

  const loadData = async () => {
    setLoading(true);

    const { data: householdData } = await supabase
      .from('households')
      .select('id, name')
      .order('name');

    if (householdData) setHouseholds(householdData);

    const { data: categoryData } = await supabase
      .from('categories')
      .select('id, name, household_id')
      .order('name');

    if (categoryData) setCategories(categoryData);

    let query = supabase
      .from('expenses')
      .select('id, expense_date, vendor, total, currency, category, notes, transcript, household_id, image_path, image_mime, image_width, image_height')
      .order('expense_date', { ascending: true });

    if (dateRange === '30d') {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      query = query.gte('expense_date', from.toISOString().split('T')[0]);
    } else if (dateRange === '90d') {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      query = query.gte('expense_date', from.toISOString().split('T')[0]);
    } else if (dateRange === 'ytd') {
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      query = query.gte('expense_date', yearStart.toISOString().split('T')[0]);
    } else if (dateRange === 'custom' && customStartDate && customEndDate) {
      query = query
        .gte('expense_date', customStartDate)
        .lte('expense_date', customEndDate);
    }

    const { data: expenseData } = await query;

    if (expenseData && householdData) {
      const householdMap = new Map(householdData.map((h) => [h.id, h.name]));
      setExpenses(
        expenseData.map((e) => ({
          ...e,
          household_name: householdMap.get(e.household_id) || 'Unknown',
        }))
      );
    }

    setLoading(false);
  };

  const displayCategories = householdFilter === 'all'
    ? categories
    : categories.filter((c) => c.household_id === null || c.household_id === householdFilter);

  let filteredExpenses = householdFilter === 'all'
    ? expenses
    : expenses.filter((e) => e.household_id === householdFilter);

  if (categoryFilter.length > 0) {
    filteredExpenses = filteredExpenses.filter((e) =>
      e.category ? categoryFilter.includes(e.category) : categoryFilter.includes('Uncategorized')
    );
  }

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.total, 0);
  const transactionCount = filteredExpenses.length;

  const byCategory = groupBy(filteredExpenses, (e) => e.category || 'Uncategorized');

  const maxCategoryTotal = Math.max(...byCategory.map((c) => c.total), 1);

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const handleExport = async () => {
    if (!exportStartDate || !exportEndDate) return;

    setExporting(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', exportStartDate)
        .lte('expense_date', exportEndDate)
        .order('expense_date', { ascending: true });

      if (householdFilter !== 'all') {
        query = query.eq('household_id', householdFilter);
      }

      const { data: exportData, error } = await query;
      if (error) throw error;

      let dataToExport = exportData;
      if (categoryFilter.length > 0) {
        dataToExport = exportData.filter((e) =>
          e.category ? categoryFilter.includes(e.category) : categoryFilter.includes('Uncategorized')
        );
      }

      const householdMap = new Map(households.map((h) => [h.id, h.name]));

      // Sort by expense_date ascending (string compare works for YYYY-MM-DD)
      const sortedData = [...dataToExport].sort((a, b) =>
        (a.expense_date || '').localeCompare(b.expense_date || '')
      );

      const csvContent = [
        ['Pic ID', 'Date', 'Vendor', 'Amount', 'Currency', 'Category', 'Household', 'Notes'].join(','),
        ...sortedData.map((expense) =>
          [
            `"${expense.pic_id || ''}"`,
            expense.expense_date,
            `"${expense.vendor || ''}"`,
            expense.total,
            expense.currency,
            `"${expense.category || ''}"`,
            `"${householdMap.get(expense.household_id) || ''}"`,
            `"${expense.notes || ''}"`,
          ].join(',')
        ),
      ].join('\n');

      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const csvUrl = window.URL.createObjectURL(csvBlob);
      const csvLink = document.createElement('a');
      csvLink.href = csvUrl;
      csvLink.download = `ledgerx-admin-export-${exportStartDate}-to-${exportEndDate}.csv`;
      document.body.appendChild(csvLink);
      csvLink.click();
      document.body.removeChild(csvLink);
      window.URL.revokeObjectURL(csvUrl);

      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPosition = margin;

      pdf.setFontSize(18);
      pdf.text('Admin Transaction Report', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.text(`Period: ${exportStartDate} to ${exportEndDate}`, margin, yPosition);
      yPosition += 6;
      pdf.text(`Total Transactions: ${sortedData.length}`, margin, yPosition);
      yPosition += 6;
      const totalAmount = sortedData.reduce((sum, e) => sum + e.total, 0);
      pdf.text(`Total Amount: ${fmt(totalAmount)}`, margin, yPosition);
      yPosition += 15;

      for (let i = 0; i < sortedData.length; i++) {
        const expense = sortedData[i];

        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        // Show pic-id as header
        if (expense.pic_id) {
          pdf.setFontSize(9);
          pdf.setFont(undefined as unknown as string, 'bold');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Pic ID: ${expense.pic_id}`, margin, yPosition);
          yPosition += 5;
          pdf.setTextColor(0, 0, 0);
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined as unknown as string, 'bold');
        pdf.text(`${expense.vendor || 'Unnamed Transaction'}`, margin, yPosition);
        yPosition += 6;

        pdf.setFontSize(10);
        pdf.setFont(undefined as unknown as string, 'normal');
        pdf.text(`Date: ${expense.expense_date}`, margin, yPosition);
        yPosition += 5;
        pdf.text(
          `Amount: ${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: expense.currency || 'USD',
          }).format(expense.total)}`,
          margin,
          yPosition
        );
        yPosition += 5;

        const hhName = householdMap.get(expense.household_id);
        if (hhName) {
          pdf.text(`Household: ${hhName}`, margin, yPosition);
          yPosition += 5;
        }

        if (expense.category) {
          pdf.text(`Category: ${expense.category}`, margin, yPosition);
          yPosition += 5;
        }

        if (expense.notes) {
          const noteLines = pdf.splitTextToSize(
            `Notes: ${expense.notes}`,
            pageWidth - 2 * margin
          );
          pdf.text(noteLines, margin, yPosition);
          yPosition += noteLines.length * 5;
        }

        if (expense.image_path) {
          try {
            const { data: imageData } = await supabase.storage
              .from('receipts')
              .download(expense.image_path);

            if (imageData) {
              const imageUrl = URL.createObjectURL(imageData);
              const img = new Image();

              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
              });

              const maxWidth = pageWidth - 2 * margin;
              const maxHeight = 100;
              let imgWidth = expense.image_width || img.width;
              let imgHeight = expense.image_height || img.height;

              const widthRatio = maxWidth / imgWidth;
              const heightRatio = maxHeight / imgHeight;
              const ratio = Math.min(widthRatio, heightRatio);

              imgWidth *= ratio;
              imgHeight *= ratio;

              if (yPosition + imgHeight > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
              }

              yPosition += 5;
              pdf.addImage(img, 'JPEG', margin, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 10;

              URL.revokeObjectURL(imageUrl);
            }
          } catch (imageError) {
            console.error('Error loading image:', imageError);
          }
        }

        if (i < dataToExport.length - 1) {
          pdf.setDrawColor(200, 200, 200);
          pdf.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 10;
        }
      }

      pdf.save(`ledgerx-admin-export-${exportStartDate}-to-${exportEndDate}.pdf`);

      setShowExport(false);
      setExportStartDate('');
      setExportEndDate('');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const toggleCategory = (category: string) => {
    setCategoryFilter((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleDateRangeChange = (newRange: '30d' | '90d' | 'ytd' | 'custom') => {
    if (newRange === 'custom') {
      setShowCustomDateModal(true);
    } else {
      setDateRange(newRange);
    }
  };

  const applyCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      setDateRange('custom');
      setShowCustomDateModal(false);
    }
  };

  const getDateRangeLabel = () => {
    if (dateRange === '30d') return 'Last 30 Days';
    if (dateRange === '90d') return 'Last 90 Days';
    if (dateRange === 'ytd') return 'Year to Date';
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      return `${customStartDate} to ${customEndDate}`;
    }
    return 'Select Range';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h2>
          <p className="text-slate-500 mt-1">Platform-wide reporting and insights</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
          <select
            value={householdFilter}
            onChange={(e) => setHouseholdFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="all">All Households</option>
            {households.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(e.target.value as '30d' | '90d' | 'ytd' | 'custom')}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 min-w-[140px]"
          >
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">{dateRange === 'custom' && customStartDate && customEndDate ? getDateRangeLabel() : 'Custom Range'}</option>
          </select>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium text-slate-700">Filter by Category:</p>
          {categoryFilter.length > 0 && (
            <button
              onClick={() => setCategoryFilter([])}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {['Uncategorized', ...displayCategories.map((c) => c.name)].map((category) => (
            <button
              key={category}
              onClick={() => toggleCategory(category)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                categoryFilter.includes(category)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <StatCard icon={DollarSign} label="Total Amount" value={fmt(totalAmount)} />
        <StatCard icon={Receipt} label="Transactions" value={transactionCount.toString()} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-5">Transactions by Category</h3>
        {byCategory.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No data yet</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{fmt(item.total)}</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                    style={{ width: `${(item.total / maxCategoryTotal) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{item.count} transaction{item.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
        </div>
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">No transactions found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredExpenses.slice(0, 20).map((expense) => (
              <div
                key={expense.id}
                onClick={() => setEditingExpense(expense)}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-slate-900">{expense.vendor || 'Unnamed'}</p>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                      {expense.category || 'Uncategorized'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(expense.expense_date + 'T00:00:00').toLocaleDateString()}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Home className="w-3 h-3" />
                      {expense.household_name}
                    </span>
                  </div>
                </div>
                <p className="font-semibold text-slate-900">{fmt(expense.total)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCustomDateModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Custom Date Range</h2>
                <button
                  onClick={() => setShowCustomDateModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label htmlFor="customStartDate" className="block text-sm font-medium text-slate-700 mb-2">
                  Start Date
                </label>
                <input
                  id="customStartDate"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="customEndDate" className="block text-sm font-medium text-slate-700 mb-2">
                  End Date
                </label>
                <input
                  id="customEndDate"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCustomDateModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyCustomDateRange}
                  disabled={!customStartDate || !customEndDate}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Export Report</h2>
                <button
                  onClick={() => setShowExport(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label htmlFor="exportStartDate" className="block text-sm font-medium text-slate-700 mb-2">
                  Start Date
                </label>
                <input
                  id="exportStartDate"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="exportEndDate" className="block text-sm font-medium text-slate-700 mb-2">
                  End Date
                </label>
                <input
                  id="exportEndDate"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
              </div>

              <div className="bg-emerald-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-emerald-700 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-1">Platform-Wide Export</p>
                    <p className="text-sm text-slate-600">
                      Export filtered data as CSV and PDF with all receipt images. Current filters: {householdFilter === 'all' ? 'All Households' : households.find(h => h.id === householdFilter)?.name}
                      {categoryFilter.length > 0 && `, ${categoryFilter.length} categories`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExport(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || !exportStartDate || !exportEndDate}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? 'Exporting...' : 'Export'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingExpense && (
        <EditExpense
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSuccess={async () => {
            setEditingExpense(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-emerald-700" />
        </div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function groupBy(expenses: Expense[], keyFn: (e: Expense) => string): GroupedData[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const key = keyFn(e);
    const existing = map.get(key) || { total: 0, count: 0 };
    existing.total += e.total;
    existing.count += 1;
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .map(([label, data]) => ({ label, ...data }))
    .sort((a, b) => b.total - a.total);
}
