import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Receipt, Home, Calendar, Download, X, CheckCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { compressForPDF, addImageToPDF, pdfGridLayout } from '../../lib/pdfUtils';
import { EditExpense } from '../EditExpense';
import { SpendingCharts } from '../SpendingCharts';
import type { Expense as ExpenseType } from '../../types/expense';
import { useT } from '../../hooks/useT';

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  transcript: string | null;
  household_id: string | null;
  household_name?: string;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  created_by: string | null;
  paid_at: string | null;
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

interface AdminAnalyticsProps {
  // When provided, the component renders inside a modal overlay (matching the
  // Reports modal pattern). Used by HA mobile UX where Invoices is the base
  // view and Analytics opens on demand from the hamburger menu.
  onClose?: () => void;
}

export function AdminAnalytics({ onClose }: AdminAnalyticsProps = {}) {
  const { t, locale } = useT();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'30d' | '90d' | 'ytd' | 'custom'>('30d');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

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
      .select('id, expense_date, vendor, total, currency, category, notes, transcript, household_id, image_path, image_mime, image_width, image_height, created_by, paid_at')
      .order('expense_date', { ascending: false });

    if (dateRange === '30d') {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      query = query.gte('expense_date', `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`);
    } else if (dateRange === '90d') {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      query = query.gte('expense_date', `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`);
    } else if (dateRange === 'ytd') {
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      query = query.gte('expense_date', `${yearStart.getFullYear()}-01-01`);
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
          household_name: householdMap.get(e.household_id ?? '') || 'Unknown',
        }))
      );
    }

    setLoading(false);
  };

  const markExpensePaid = async (expense: Expense, paid: boolean) => {
    setMarkingPaidId(expense.id);
    const { error } = await supabase.rpc('admin_mark_expense_paid', {
      p_expense_id: expense.id,
      p_paid: paid,
    });
    if (!error) {
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expense.id ? { ...e, paid_at: paid ? new Date().toISOString() : null } : e
        )
      );
    }
    setMarkingPaidId(null);
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
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount);

  // Derive start/end dates from the current dashboard date-range selection.
  const getExportDateRange = (): { start: string; end: string } | null => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) return null;
      return { start: customStartDate, end: customEndDate };
    }
    const end = fmt(today);
    if (dateRange === '30d') { const s = new Date(today); s.setDate(s.getDate() - 30); return { start: fmt(s), end }; }
    if (dateRange === '90d') { const s = new Date(today); s.setDate(s.getDate() - 90); return { start: fmt(s), end }; }
    if (dateRange === 'ytd') { return { start: `${today.getFullYear()}-01-01`, end }; }
    return null;
  };

  const handleExport = async () => {
    const range = getExportDateRange();
    if (!range) return;
    const { start: exportStartDate, end: exportEndDate } = range;

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

      // Oldest first
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
            `"${householdMap.get(expense.household_id ?? '') || ''}"`,
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
      const totalAmount = sortedData.reduce((sum, e) => sum + e.total, 0);

      // Page header — returns the y position where content starts
      const addPageHeader = (isFirst: boolean) => {
        pdf.setFontSize(16);
        pdf.setFont(undefined as unknown as string, 'bold');
        pdf.text('Admin Transaction Report', margin, margin);
        pdf.setFontSize(9);
        pdf.setFont(undefined as unknown as string, 'normal');
        pdf.text(`Period: ${exportStartDate} to ${exportEndDate}`, margin, margin + 8);
        if (isFirst) {
          pdf.text(`Total Transactions: ${sortedData.length}   Total Amount: ${fmt(totalAmount)}`, margin, margin + 14);
          return margin + 22;
        }
        return margin + 14;
      };

      const imageBoxWidth = 50;
      let contentStartY = addPageHeader(true);
      const { cols, colGap, rowGap, cellWidth, cellHeight, maxPerPage } = pdfGridLayout(pageWidth, pageHeight, margin, contentStartY);
      const thumbHeight = cellHeight - 10;

      let txIndex = 0;

      for (let i = 0; i < sortedData.length; i++) {
        const expense = sortedData[i];

        if (txIndex >= maxPerPage) {
          pdf.addPage();
          contentStartY = addPageHeader(false);
          txIndex = 0;
        }

        const col = txIndex % cols;
        const row = Math.floor(txIndex / cols);
        const xOffset = margin + col * (cellWidth + colGap);
        const yOffset = contentStartY + row * (cellHeight + rowGap);

        let yPos = yOffset + 4;
        const imageX = xOffset + cellWidth - imageBoxWidth;
        const imageY = yOffset + 4;
        const textWidth = cellWidth - imageBoxWidth - 4;

        // Pic ID
        if (expense.pic_id) {
          pdf.setFontSize(8);
          pdf.setFont(undefined as unknown as string, 'normal');
          pdf.setTextColor(120, 120, 120);
          pdf.text(`Pic ID: ${expense.pic_id}`, xOffset, yPos);
          yPos += 4;
          pdf.setTextColor(0, 0, 0);
        }

        // Vendor
        pdf.setFontSize(11);
        pdf.setFont(undefined as unknown as string, 'bold');
        const vendorLines = pdf.splitTextToSize(expense.vendor || t('admin.unnamedTx'), textWidth);
        pdf.text(vendorLines, xOffset, yPos);
        yPos += vendorLines.length * 5.5;

        // Details
        pdf.setFontSize(9);
        pdf.setFont(undefined as unknown as string, 'normal');
        pdf.text(`Date: ${expense.expense_date}`, xOffset, yPos); yPos += 4.5;
        pdf.text(
          `Amount: ${new Intl.NumberFormat(locale, { style: 'currency', currency: expense.currency || 'USD' }).format(expense.total)}`,
          xOffset, yPos
        ); yPos += 4.5;

        const hhName = householdMap.get(expense.household_id ?? '');
        if (hhName) { pdf.text(`Household: ${hhName}`, xOffset, yPos); yPos += 4.5; }
        if (expense.category) { pdf.text(`Category: ${expense.category}`, xOffset, yPos); yPos += 4.5; }

        if (expense.notes) {
          const maxNL = Math.max(1, Math.floor((imageY + thumbHeight - yPos) / 4.5));
          const noteLines = pdf.splitTextToSize(`Notes: ${expense.notes}`, textWidth).slice(0, maxNL);
          pdf.text(noteLines, xOffset, yPos);
        }

        // Receipt thumbnail
        if (expense.image_path) {
          try {
            const { data: imageData } = await supabase.storage.from('receipts').download(expense.image_path);
            if (imageData) {
              addImageToPDF(pdf, await compressForPDF(imageData), imageX, imageY, imageBoxWidth, thumbHeight);
            }
          } catch { /* skip missing images */ }
        }

        // Cell separator
        pdf.setDrawColor(220, 220, 220);
        pdf.line(xOffset, yOffset + cellHeight - 2, xOffset + cellWidth, yOffset + cellHeight - 2);

        txIndex += 1;
      }

      pdf.save(`ledgerx-admin-export-${exportStartDate}-to-${exportEndDate}.pdf`);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert(t('admin.failedExport'));
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
    if (dateRange === '30d') return t('admin.last30');
    if (dateRange === '90d') return t('admin.last90');
    if (dateRange === 'ytd') return t('admin.ytd');
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      return `${customStartDate} to ${customEndDate}`;
    }
    return t('admin.selectRange');
  };

  if (loading) {
    const loadingBody = (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
    if (onClose) {
      return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-5xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900">{t('admin.analyticsTitle')}</h2>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg" aria-label={t('common.close')}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6">{loadingBody}</div>
          </div>
        </div>
      );
    }
    return loadingBody;
  }

  const body = (
    <div>
      {/* Title block always stacks above controls — prevents the cramped
          three-column squeeze on phones where the title was wrapping awkwardly
          next to the Export Report button. On desktop the controls float
          right via `sm:ml-auto`. */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{t('admin.analyticsTitle')}</h2>
          <p className="text-slate-500 mt-1 text-sm">{t('admin.analyticsDesc')}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <select
            value={householdFilter}
            onChange={(e) => setHouseholdFilter(e.target.value)}
            className="flex-1 sm:flex-none min-w-[8rem] px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="all">{t('admin.allHouseholds')}</option>
            {households.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(e.target.value as '30d' | '90d' | 'ytd' | 'custom')}
            className="flex-1 sm:flex-none min-w-[8rem] px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="30d">{t('admin.last30')}</option>
            <option value="90d">{t('admin.last90')}</option>
            <option value="ytd">{t('admin.ytd')}</option>
            <option value="custom">{dateRange === 'custom' && customStartDate && customEndDate ? getDateRangeLabel() : t('admin.customRange')}</option>
          </select>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting ? t('admin.exporting') : t('admin.exportReport')}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium text-slate-700">{t('admin.filterByCategory')}</p>
          {categoryFilter.length > 0 && (
            <button
              onClick={() => setCategoryFilter([])}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {t('admin.clearAll')}
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
              {category === 'Uncategorized' ? t('common.uncategorized') : category}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <StatCard icon={DollarSign} label={t('admin.totalAmount')} value={fmt(totalAmount)} />
        <StatCard icon={Receipt} label={t('admin.transactions')} value={transactionCount.toString()} />
      </div>

      <SpendingCharts expenses={filteredExpenses as unknown as ExpenseType[]} loading={loading} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-5">{t('admin.byCategoryTitle')}</h3>
        {byCategory.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">{t('admin.noDataYet')}</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{item.label === 'Uncategorized' ? t('common.uncategorized') : item.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{fmt(item.total)}</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                    style={{ width: `${(item.total / maxCategoryTotal) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{item.count !== 1 ? t('admin.transactionCountPlural', { count: item.count }) : t('admin.transactionCount', { count: item.count })}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">{t('admin.recentTransactions')}</h3>
        </div>
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">{t('admin.noTransactionsFound')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredExpenses.slice(0, 20).map((expense) => (
              <div
                key={expense.id}
                onClick={() => setEditingExpense(expense)}
                className="px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-all cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900">{expense.vendor || t('admin.unnamed')}</p>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                      {expense.category || t('common.uncategorized')}
                    </span>
                    {expense.paid_at && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        {t('expenses.paidBadge')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(expense.expense_date + 'T12:00:00').toLocaleDateString(locale)}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Home className="w-3 h-3" />
                      {expense.household_name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-semibold text-slate-900">{fmt(expense.total)}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); markExpensePaid(expense, !expense.paid_at); }}
                    disabled={markingPaidId === expense.id}
                    title={expense.paid_at ? t('admin.markUnpaid') : t('admin.markPaid')}
                    className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                      expense.paid_at
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                </div>
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
                <h2 className="text-2xl font-bold text-slate-900">{t('admin.customDateRange')}</h2>
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
                  {t('admin.startDate')}
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
                  {t('admin.endDate')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={applyCustomDateRange}
                  disabled={!customStartDate || !customEndDate}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('admin.apply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingExpense && (
        <EditExpense
          expense={editingExpense as unknown as ExpenseType}
          onClose={() => setEditingExpense(null)}
          onSuccess={async () => {
            setEditingExpense(null);
            await loadData();
          }}
        />
      )}
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-5xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-bold text-slate-900">{t('admin.analyticsTitle')}</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg" aria-label={t('common.close')}>
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-4 sm:p-6">{body}</div>
        </div>
      </div>
    );
  }

  return body;
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
