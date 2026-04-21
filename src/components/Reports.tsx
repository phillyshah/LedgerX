import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, FileText, Calendar, Home, Tag, DollarSign, Download } from 'lucide-react';
import jsPDF from 'jspdf';

interface Household {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  household_id: string;
  household_name?: string;
  image_path: string | null;
}

interface ReportsProps {
  onClose: () => void;
}

export function Reports({ onClose }: ReportsProps) {
  console.log('Reports component rendered');
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedHouseholds, setSelectedHouseholds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
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
  const [imageZoom, setImageZoom] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadOptions();
  }, [user]);

  useEffect(() => {
    // Reset selected categories when households change
    setSelectedCategories([]);
  }, [selectedHouseholds]);

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

      const isAdmin = rolesData?.is_admin ?? false;
      let hh: Household[] = [];

      if (isAdmin) {
        const { data: allHH, error: hhErr } = await supabase
          .from('households')
          .select('id, name')
          .order('name');
        if (hhErr) { setError('Could not load households.'); return; }
        hh = (allHH ?? []) as Household[];
      } else {
        const { data: memberData, error: memberError } = await supabase
          .from('household_members')
          .select('household_id, households(id, name)')
          .eq('user_id', user.id);

        if (memberError) {
          console.error('Error loading households:', memberError);
          setError('Could not load households. Please try again.');
          return;
        }

        hh = (memberData || [])
          .map((item: any) => item.households)
          .filter(Boolean) as unknown as Household[];
      }

      setHouseholds(hh);

      // Load categories: global + household-specific for user's households
      const householdIds = hh.map((h) => h.id);
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name, household_id')
        .or(`household_id.is.null,household_id.in.(${householdIds.join(',')})`);

      if (catError) {
        console.error('Error loading categories:', catError);
        setError('Could not load categories. Please try again.');
        return;
      }

      setAllCategories(catData || []);
    } catch (error) {
      console.error('Unexpected error in loadOptions:', error);
      setError('Something went wrong while loading report filters.');
    }
  };

  const runReport = async () => {
    if (!user || selectedHouseholds.length === 0) return;

    setLoading(true);

    try {
      const householdMap = new Map(households.map((h: Household) => [h.id, h.name]));

      let query = supabase
        .from('expenses')
        .select('id, expense_date, vendor, total, currency, category, notes, household_id, image_path')
        .in('household_id', selectedHouseholds)
        .order('expense_date', { ascending: true });

      if (selectedCategories.length > 0) {
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
        const filteredExpenses = data.map((e: any) => ({
          ...e,
          household_name: householdMap.get(e.household_id) || 'Unknown',
        }));
        setExpenses(filteredExpenses);
        setTotalAmount(filteredExpenses.reduce((sum: number, e: Expense) => sum + e.total, 0));
      } else {
        if (error) {
          console.error('Error running report:', error);
          setError('Failed to run report. Please try again.');
        }
        setExpenses([]);
        setTotalAmount(0);
      }
    } catch (error) {
      console.error('Unexpected error running report:', error);
      setError('Unexpected error running report.');
      setExpenses([]);
      setTotalAmount(0);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);

    try {
      const householdMap = new Map(households.map((h) => [h.id, h.name]));

      // Oldest first
      const sortedExpenses = [...expenses].sort((a, b) =>
        (a.expense_date || '').localeCompare(b.expense_date || '')
      );

      // CSV
      const csvContent = [
        ['Pic ID', 'Date', 'Vendor', 'Amount', 'Currency', 'Category', 'Household', 'Notes'].join(','),
        ...sortedExpenses.map((expense) => [
          `"${expense.id || ''}"`,
          `"${expense.expense_date}"`,
          `"${expense.vendor || ''}"`,
          `"${expense.total}"`,
          `"${expense.currency || 'USD'}"`,
          `"${expense.category || ''}"`,
          `"${householdMap.get(expense.household_id) || ''}"`,
          `"${expense.notes || ''}"`,
        ].join(','))
      ].join('\n');

      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const csvUrl = window.URL.createObjectURL(csvBlob);
      const csvLink = document.createElement('a');
      csvLink.href = csvUrl;
      csvLink.download = `ledgerx-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(csvLink);
      csvLink.click();
      document.body.removeChild(csvLink);
      window.URL.revokeObjectURL(csvUrl);

      // PDF
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      const addPageHeader = () => {
        pdf.setFontSize(16);
        pdf.text('Transaction Report', margin, margin);
        pdf.setFontSize(9);
        pdf.text(`Period: ${startDate} to ${endDate}`, margin, margin + 10);
        return margin + 20;
      };

      // Helper: compress image blob for PDF embedding.
      // Returns dataUrl + pixel dims so we can compute correct mm sizing.
      const compressForPDF = (blob: Blob): Promise<{ dataUrl: string; width: number; height: number }> =>
        new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const srcImg = new Image();
          srcImg.onload = () => {
            const MAX = 600;
            let { width, height } = srcImg;
            const r = Math.min(MAX / width, MAX / height, 1);
            width = Math.round(width * r);
            height = Math.round(height * r);
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d')!.drawImage(srcImg, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.65), width, height });
          };
          srcImg.onerror = reject;
          srcImg.src = url;
        });

      // 2-column layout, 4 items per page, oldest first
      let contentStartY = addPageHeader();
      const maxItemsPerPage = 4;
      const cols = 2;
      const rows = 2;
      const colGap = 6;
      const rowGap = 4;
      const cellWidth = (pageWidth - 2 * margin - colGap) / 2;
      const cellHeight = (pageHeight - margin - contentStartY - rowGap) / rows;
      const imageBoxWidth = 48;
      let txIndex = 0;

      for (let i = 0; i < sortedExpenses.length; i++) {
        const expense = sortedExpenses[i];

        if (txIndex >= maxItemsPerPage) {
          pdf.addPage();
          contentStartY = addPageHeader();
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
          `${expense.vendor || 'Unnamed Transaction'}`, textWidth
        );
        pdf.text(vendorLines, xOffset, yPosition);
        yPosition += vendorLines.length * 5.5;

        pdf.setFontSize(9);
        pdf.setFont(undefined as unknown as string, 'normal');
        pdf.text(`Date: ${expense.expense_date}`, xOffset, yPosition);
        yPosition += 4.5;
        pdf.text(
          `Amount: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: expense.currency || 'USD' }).format(expense.total)}`,
          xOffset, yPosition
        );
        yPosition += 4.5;

        const hhName = householdMap.get(expense.household_id);
        if (hhName) { pdf.text(`Household: ${hhName}`, xOffset, yPosition); yPosition += 4.5; }
        if (expense.category) { pdf.text(`Category: ${expense.category}`, xOffset, yPosition); yPosition += 4.5; }

        if (expense.notes) {
          const noteLines = pdf.splitTextToSize(`Notes: ${expense.notes}`, textWidth);
          const maxNL = Math.max(1, Math.floor((imageY + 22 - yPosition) / 4.5));
          pdf.text(noteLines.slice(0, maxNL), xOffset, yPosition);
        }

        if (expense.image_path) {
          try {
            const { data: imageData } = await supabase.storage.from('receipts').download(expense.image_path);
            if (imageData) {
              const { dataUrl, width: px, height: py } = await compressForPDF(imageData);
              const thumbH = 22;
              const aspect = px / py;
              let renderW = imageBoxWidth;
              let renderH = imageBoxWidth / aspect;
              if (renderH > thumbH) { renderH = thumbH; renderW = thumbH * aspect; }
              pdf.addImage(dataUrl, 'JPEG', imageX + (imageBoxWidth - renderW) / 2, imageY + (thumbH - renderH) / 2, renderW, renderH);
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
      alert('Failed to export report. Please try again.');
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
            Reports
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
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          )}
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Households */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Home className="w-4 h-4" />
                Households
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
                Categories
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
                Start Date
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
                End Date
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
              {loading ? 'Running Report...' : 'Run Report'}
            </button>
            <button
              onClick={exportReport}
              disabled={exporting || expenses.length === 0}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-sm font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export PDF & CSV'}
            </button>
          </div>

          {/* Results */}
          {expenses.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  Results ({expenses.length} transactions)
                </h3>
                <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <DollarSign className="w-5 h-5" />
                  Total: ${totalAmount.toFixed(2)}
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Household</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {new Date(expense.expense_date + 'T12:00:00').toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.vendor || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.category || 'Uncategorized'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.household_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 text-right">
                          ${expense.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 text-center">
                          {expense.image_path ? (
                            <button
                              onClick={() => setViewingImage(expense.image_path)}
                              className="p-1 hover:bg-slate-100 rounded"
                              title="View Receipt"
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
              No transactions found for the selected filters.
            </div>
          )}
        </div>
      </div>

      {viewingImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Receipt Image</h3>
              <button
                onClick={() => setViewingImage(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}
                  className="px-3 py-1 bg-emerald-900 text-white rounded-lg"
                  title="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.max(0.5, z - 0.25))}
                  className="px-3 py-1 bg-emerald-900 text-white rounded-lg"
                  title="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom(1)}
                  className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg"
                  title="Reset zoom"
                >
                  reset
                </button>
              </div>
              {imageUrl ? (
                <div
                  className="max-w-full max-h-[70vh] overflow-auto"
                  onWheel={(e) => {
                    if (e.ctrlKey) {
                      e.preventDefault();
                      setImageZoom((z) => {
                        const next = z + (e.deltaY < 0 ? 0.1 : -0.1);
                        return Math.min(3, Math.max(0.5, next));
                      });
                    }
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="Receipt"
                    style={{
                      transform: `scale(${imageZoom})`,
                      transformOrigin: 'center center',
                      width: '100%',
                      height: 'auto',
                    }}
                    className="block mx-auto"
                  />
                </div>
              ) : (
                <div className="text-slate-500">Loading image...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}