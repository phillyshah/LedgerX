import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, FileText, Calendar, Home, Tag, DollarSign, Download, User as UserIcon, ArrowUpDown } from 'lucide-react';
import jsPDF from 'jspdf';
import { compressForPDF, addImageToPDF, pdfGridLayout, addReportHeader } from '../lib/pdfUtils';
import { buildExpenseCsv, downloadBlob } from '../lib/csvExport';
import { useT } from '../hooks/useT';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { ZoomableImage } from './shared/ZoomableImage';
import { loadUserHouseholds, loadAllHouseholds } from '../lib/queries';
import type { Household } from '../types/expense';

interface Category {
  id: string;
  name: string;
  household_id: string | null;
}

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  household_id: string | null;
  household_name?: string;
  image_path: string | null;
  created_by: string | null;
  submitter_name?: string;
}

interface Submitter {
  user_id: string;
  username: string;
}

type SortKey = 'date_asc' | 'date_desc' | 'submitter' | 'amount_desc' | 'amount_asc' | 'vendor' | 'category';

interface ReportsProps {
  onClose: () => void;
}

export function Reports({ onClose }: ReportsProps) {
  const { user, isAdmin, isHouseholdAdmin } = useAuth();
  const { t, locale } = useT();
  useEscapeClose(onClose);
  // Privacy gate: only privileged viewers (full + household admins) can see
  // other people's submissions. Regular users are *forced* to their own.
  const isPrivilegedViewer = isAdmin || isHouseholdAdmin;
  const [households, setHouseholds] = useState<Household[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedHouseholds, setSelectedHouseholds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  // Empty array = "all submitters in scope" (no filter applied beyond
  // privacy/household scoping). Any non-empty list scopes the report to
  // exactly those user ids. Regular users are forced to [user.id] in the
  // query regardless of this state.
  const [selectedSubmitterIds, setSelectedSubmitterIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('date_asc');
  const [startDate, setStartDate] = useState('');

  const availableCategories = selectedHouseholds.length
    ? allCategories.filter((c) => c.household_id && selectedHouseholds.includes(c.household_id))
    : [];

  const [endDate, setEndDate] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadOptions();
  }, [user]);

  useEffect(() => {
    // When households change, pre-select ALL categories for those households
    // so the user sees results immediately without having to tick boxes.
    const cats = allCategories.filter(
      (c) => c.household_id && selectedHouseholds.includes(c.household_id)
    );
    setSelectedCategories(cats.map((c) => c.id));
  }, [selectedHouseholds, allCategories]);

  // Load the submitter list whenever the privileged viewer changes
  // households. Pulled from household_members + user_profiles so the
  // dropdown only ever shows people who actually submit in scope.
  useEffect(() => {
    if (!isPrivilegedViewer || selectedHouseholds.length === 0) {
      setSubmitters([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // No FK declared between household_members and user_profiles, so we
      // can't ask PostgREST to embed — fetch IDs, then look up usernames.
      const { data: memberRows, error: memberErr } = await supabase
        .from('household_members')
        .select('user_id')
        .in('household_id', selectedHouseholds);
      if (cancelled || memberErr || !memberRows) return;

      const userIds = Array.from(new Set(memberRows.map((r: { user_id: string }) => r.user_id)));
      if (userIds.length === 0) {
        setSubmitters([]);
        return;
      }

      const { data: profileRows, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id, username')
        .in('id', userIds);
      if (cancelled || profileErr || !profileRows) return;

      setSubmitters(
        (profileRows as Array<{ id: string; username: string }>)
          .map((p) => ({ user_id: p.id, username: p.username }))
          .sort((a, b) => a.username.localeCompare(b.username))
      );
    })();
    return () => { cancelled = true; };
  }, [isPrivilegedViewer, selectedHouseholds]);

  useEffect(() => {
    const loadImageUrl = async () => {
      if (viewingImage) {
        const { data, error } = await supabase.storage
          .from('receipts')
          .createSignedUrl(viewingImage, 3600);
        if (!error && data) {
          setImageUrl(data.signedUrl);
        } else {
          console.error('Error loading image:', error);
          setImageUrl(null);
        }
      } else {
        setImageUrl(null);
      }
    };
    loadImageUrl();
  }, [viewingImage]);

  const loadOptions = async () => {
    if (!user) return;

    setError(null);

    try {
      // Admins see all households; regular users only see their memberships.
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle();

      const hh = rolesData?.is_admin
        ? await loadAllHouseholds()
        : await loadUserHouseholds(user.id);
      setHouseholds(hh);
      // Auto-select when there's only one household — no reason to make the
      // user click a checkbox before they can run their first report.
      if (hh.length === 1) {
        setSelectedHouseholds([hh[0].id]);
      }

      // Load categories: global + household-specific for user's households
      const householdIds = hh.map((h) => h.id);
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name, household_id')
        .or(`household_id.is.null,household_id.in.(${householdIds.join(',')})`);

      if (catError) {
        console.error('Error loading categories:', catError);
        setError(t('reports.failedLoadCategories'));
        return;
      }

      setAllCategories(catData || []);
    } catch (error) {
      console.error('Unexpected error in loadOptions:', error);
      setError(t('reports.failedLoadOptions'));
    }
  };

  const runReport = async () => {
    if (!user || selectedHouseholds.length === 0) return;

    setLoading(true);

    try {
      const householdMap = new Map(households.map((h: Household) => [h.id, h.name]));

      let query = supabase
        .from('expenses')
        .select('id, expense_date, vendor, total, currency, category, notes, household_id, image_path, created_by')
        .in('household_id', selectedHouseholds)
        .order('expense_date', { ascending: true });

      // ── Privacy scope ───────────────────────────────────────────────
      // Regular users MUST only see their own submissions, regardless of
      // household-level RLS. Privileged viewers (full + household admins)
      // can narrow to one or more specific submitters via checkboxes.
      if (!isPrivilegedViewer) {
        query = query.eq('created_by', user.id);
      } else if (selectedSubmitterIds.length > 0) {
        query = query.in('created_by', selectedSubmitterIds);
      }

      // Only filter by category when a strict subset is selected.
      // When all (or none) are selected we don't filter so uncategorized
      // expenses are always included in the full-scope case.
      if (selectedCategories.length > 0 && selectedCategories.length < availableCategories.length) {
        const selectedCategoryNames = availableCategories
          .filter((c: Category) => selectedCategories.includes(c.id))
          .map((c: Category) => c.name);
        query = query.in('category', selectedCategoryNames);
      }

      if (startDate) {
        query = query.gte('expense_date', startDate);
      }

      if (endDate) {
        query = query.lte('expense_date', endDate);
      }

      const { data, error } = await query;

      if (!error && data) {
        // Resolve usernames for any created_by ids returned. Privileged
        // viewers may pull in users not in the household-scoped submitters
        // list, so we top up via user_profiles.
        const submitterMap = new Map(submitters.map((s) => [s.user_id, s.username]));
        const missingIds = Array.from(
          new Set(
            (data as Array<{ created_by: string | null }>)
              .map((r) => r.created_by)
              .filter((id): id is string => !!id && !submitterMap.has(id)),
          ),
        );
        if (missingIds.length > 0) {
          const { data: profileRows } = await supabase
            .from('user_profiles')
            .select('id, username')
            .in('id', missingIds);
          for (const p of (profileRows ?? []) as Array<{ id: string; username: string }>) {
            submitterMap.set(p.id, p.username);
          }
        }
        const filteredExpenses = (data as Expense[]).map((e) => ({
          ...e,
          household_name: householdMap.get(e.household_id ?? '') || 'Unknown',
          submitter_name: e.created_by ? (submitterMap.get(e.created_by) ?? '') : '',
        }));
        setExpenses(filteredExpenses);
        setTotalAmount(filteredExpenses.reduce((sum: number, e: Expense) => sum + e.total, 0));
      } else {
        if (error) {
          console.error('Error running report:', error);
          setError(t('reports.failedRun'));
        }
        setExpenses([]);
        setTotalAmount(0);
      }
    } catch (error) {
      console.error('Unexpected error running report:', error);
      setError(t('reports.unexpectedRun'));
      setExpenses([]);
      setTotalAmount(0);
    } finally {
      setLoading(false);
    }
  };

  // Apply the chosen sort order to the result set without re-querying.
  // Used by both the on-screen table and the export.
  const sortedExpenses = useMemo(() => {
    const list = [...expenses];
    const cmpStr = (a: string | null | undefined, b: string | null | undefined) =>
      (a ?? '').localeCompare(b ?? '');
    switch (sortKey) {
      case 'date_desc':
        list.sort((a, b) => cmpStr(b.expense_date, a.expense_date));
        break;
      case 'submitter':
        list.sort((a, b) => cmpStr(a.submitter_name, b.submitter_name)
          || cmpStr(a.expense_date, b.expense_date));
        break;
      case 'amount_desc':
        list.sort((a, b) => b.total - a.total);
        break;
      case 'amount_asc':
        list.sort((a, b) => a.total - b.total);
        break;
      case 'vendor':
        list.sort((a, b) => cmpStr(a.vendor, b.vendor));
        break;
      case 'category':
        list.sort((a, b) => cmpStr(a.category, b.category));
        break;
      case 'date_asc':
      default:
        list.sort((a, b) => cmpStr(a.expense_date, b.expense_date));
    }
    return list;
  }, [expenses, sortKey]);

  const exportReport = async () => {
    setExporting(true);

    try {
      const householdMap = new Map(households.map((h) => [h.id, h.name]));
      const submitterMap = new Map(
        sortedExpenses
          .filter((e) => e.created_by)
          .map((e) => [e.created_by as string, e.submitter_name || '']),
      );

      // CSV — admin-only viewers get a Submitted by column; regular users
      // are scoped to themselves so that column would be redundant.
      downloadBlob(
        new Blob(
          [buildExpenseCsv(
            sortedExpenses,
            householdMap,
            'id',
            isPrivilegedViewer ? submitterMap : undefined,
          )],
          { type: 'text/csv' },
        ),
        `ledgerx-report-${startDate}-to-${endDate}.csv`,
      );

      // PDF
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      let contentStartY = addReportHeader(pdf, startDate, endDate, margin);
      const { cols, colGap, rowGap, cellWidth, cellHeight, maxPerPage } = pdfGridLayout(pageWidth, pageHeight, margin, contentStartY);
      const imageBoxWidth = 50;
      const thumbHeight = cellHeight - 10;
      let txIndex = 0;

      for (let i = 0; i < sortedExpenses.length; i++) {
        const expense = sortedExpenses[i];

        if (txIndex >= maxPerPage) {
          pdf.addPage();
          contentStartY = addReportHeader(pdf, startDate, endDate, margin);
          txIndex = 0;
        }

        const col = txIndex % cols;
        const row = Math.floor(txIndex / cols);
        const xOffset = margin + col * (cellWidth + colGap);
        const yOffset = contentStartY + row * (cellHeight + rowGap);

        let yPosition = yOffset + 4;
        const imageX = xOffset + cellWidth - imageBoxWidth;
        const imageY = yOffset + 4;
        const textWidth = cellWidth - imageBoxWidth - 5;

        pdf.setFontSize(11);
        pdf.setFont(undefined as unknown as string, 'bold');
        const vendorLines = pdf.splitTextToSize(
          `${expense.vendor || t('admin.unnamedTx')}`, textWidth
        );
        pdf.text(vendorLines, xOffset, yPosition);
        yPosition += vendorLines.length * 5.5;

        pdf.setFontSize(9);
        pdf.setFont(undefined as unknown as string, 'normal');
        pdf.text(`Date: ${expense.expense_date}`, xOffset, yPosition);
        yPosition += 4.5;
        pdf.text(
          `Amount: ${new Intl.NumberFormat(locale, { style: 'currency', currency: expense.currency || 'USD' }).format(expense.total)}`,
          xOffset, yPosition
        );
        yPosition += 4.5;

        const hhName = householdMap.get(expense.household_id ?? '');
        if (hhName) { pdf.text(`Household: ${hhName}`, xOffset, yPosition); yPosition += 4.5; }
        if (expense.category) { pdf.text(`Category: ${expense.category}`, xOffset, yPosition); yPosition += 4.5; }
        if (isPrivilegedViewer && expense.submitter_name) {
          pdf.text(`Submitted by: ${expense.submitter_name}`, xOffset, yPosition); yPosition += 4.5;
        }

        if (expense.notes) {
          const noteLines = pdf.splitTextToSize(`Notes: ${expense.notes}`, textWidth);
          const maxNL = Math.max(1, Math.floor((imageY + 22 - yPosition) / 4.5));
          pdf.text(noteLines.slice(0, maxNL), xOffset, yPosition);
        }

        if (expense.image_path) {
          try {
            const { data: imageData } = await supabase.storage.from('receipts').download(expense.image_path);
            if (imageData) {
              addImageToPDF(pdf, await compressForPDF(imageData), imageX, imageY, imageBoxWidth, thumbHeight);
            }
          } catch { /* skip */ }
        }

        // Cell separator
        pdf.setDrawColor(220, 220, 220);
        pdf.line(xOffset, yOffset + cellHeight - 2, xOffset + cellWidth, yOffset + cellHeight - 2);

        txIndex += 1;
      }

      pdf.save(`ledgerx-report-${startDate}-to-${endDate}.pdf`);

    } catch (error) {
      console.error('Error exporting report:', error);
      alert(t('reports.failedExport'));
    } finally {
      setExporting(false);
    }
  };

  const toggleHousehold = (id: string) => {
    setSelectedHouseholds((prev: string[]) =>
      prev.includes(id) ? prev.filter((h: string) => h !== id) : [...prev, id]
    );
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev: string[]) =>
      prev.includes(id) ? prev.filter((c: string) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('reports.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <strong className="font-semibold">{t('reports.error')}</strong> {error}
            </div>
          )}
          {/* Privacy scope — admins get a submitter checklist, regular
              users see a static notice that the report is theirs only. */}
          {isPrivilegedViewer ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4" />
                  {t('reports.submittedBy')}
                  {selectedSubmitterIds.length === 0 ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {t('reports.submitterAllSelected')}
                    </span>
                  ) : (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {t('reports.submitterCount', { count: selectedSubmitterIds.length })}
                    </span>
                  )}
                </label>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedSubmitterIds([])}
                    className="text-emerald-700 hover:text-emerald-800 font-medium"
                  >
                    {t('reports.submitterAll')}
                  </button>
                  {user?.id && (
                    <button
                      type="button"
                      onClick={() => setSelectedSubmitterIds([user.id])}
                      className="text-emerald-700 hover:text-emerald-800 font-medium"
                    >
                      {t('reports.submitterMine')}
                    </button>
                  )}
                </div>
              </div>
              {selectedHouseholds.length === 0 ? (
                <p className="text-xs text-slate-400">{t('reports.submitterPickHousehold')}</p>
              ) : submitters.length === 0 ? (
                <p className="text-xs text-slate-400">{t('reports.submitterNoneFound')}</p>
              ) : (
                <div className="max-h-32 overflow-y-auto bg-white border border-slate-200 rounded-lg p-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                  {submitters.map((s) => {
                    const checked = selectedSubmitterIds.includes(s.user_id);
                    return (
                      <label key={s.user_id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedSubmitterIds((prev) =>
                              prev.includes(s.user_id)
                                ? prev.filter((x) => x !== s.user_id)
                                : [...prev, s.user_id],
                            )
                          }
                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        />
                        <span className="truncate">{s.username}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-sm text-emerald-800">
              <UserIcon className="w-4 h-4 text-emerald-600" />
              {t('reports.scopedToSelf')}
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Households */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Home className="w-4 h-4" />
                {t('reports.households')}
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {households.map((h: Household) => (
                  <label key={h.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedHouseholds.includes(h.id)}
                      onChange={() => toggleHousehold(h.id)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">{h.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Tag className="w-4 h-4" />
                {t('reports.categories')}
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableCategories.map((c: Category) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {t('reports.startDate')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {t('reports.endDate')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              />
            </div>
          </div>

          {/* Run Report + Export buttons */}
          <div className="flex justify-center gap-3">
            <button
              onClick={runReport}
              disabled={selectedHouseholds.length === 0 || loading}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl transition-all shadow-sm font-medium"
            >
              {loading ? t('reports.running') : t('reports.runReport')}
            </button>
            <button
              onClick={exportReport}
              disabled={exporting || expenses.length === 0}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-sm font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? t('reports.exporting') : t('reports.exportPdfCsv')}
            </button>
          </div>

          {/* Results */}
          {expenses.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t('reports.resultsCount', { count: expenses.length })}
                </h3>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <ArrowUpDown className="w-4 h-4" />
                    {t('reports.sortBy')}
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="ml-1 text-sm bg-white border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                    >
                      <option value="date_asc">{t('reports.sortDateAsc')}</option>
                      <option value="date_desc">{t('reports.sortDateDesc')}</option>
                      {isPrivilegedViewer && (
                        <option value="submitter">{t('reports.sortSubmitter')}</option>
                      )}
                      <option value="amount_desc">{t('reports.sortAmountDesc')}</option>
                      <option value="amount_asc">{t('reports.sortAmountAsc')}</option>
                      <option value="vendor">{t('reports.sortVendor')}</option>
                      <option value="category">{t('reports.sortCategory')}</option>
                    </select>
                  </label>
                  <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <DollarSign className="w-5 h-5" />
                    {t('reports.totalLabel', { amount: `$${totalAmount.toFixed(2)}` })}
                  </div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colDate')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colVendor')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colCategory')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colHousehold')}</th>
                      {isPrivilegedViewer && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colSubmitter')}</th>
                      )}
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colAmount')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.colReceipt')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {sortedExpenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {new Date(expense.expense_date + 'T12:00:00').toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.vendor || t('reports.na')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.category || t('reports.uncategorized')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.household_name}
                        </td>
                        {isPrivilegedViewer && (
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {expense.submitter_name || t('reports.na')}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm text-slate-900 text-right">
                          ${expense.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 text-center">
                          {expense.image_path ? (
                            <button
                              onClick={() => setViewingImage(expense.image_path)}
                              className="p-1 hover:bg-slate-100 rounded"
                              title={t('reports.viewReceipt')}
                            >
                              <FileText className="w-4 h-4 text-slate-600" />
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {expenses.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-500">
              {t('reports.noneFound')}
            </div>
          )}
        </div>
      </div>

      {viewingImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{t('reports.receiptImage')}</h3>
              <button
                onClick={() => setViewingImage(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-3">
              {imageUrl ? (
                <ZoomableImage
                  src={imageUrl}
                  alt="Receipt"
                  containerClassName="max-w-full max-h-[70vh] overflow-auto"
                />
              ) : (
                <div className="text-slate-500">{t('reports.loadingImage')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}