import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { loadUserHouseholds } from '../lib/queries';
import { buildExpenseCsv, downloadBlob } from '../lib/csvExport';
import { addReportHeader, loadStorageImage } from '../lib/pdfHelpers';
import { ZoomableImage } from './shared/ZoomableImage';
import { X, FileText, Calendar, Home, Tag, DollarSign, Download } from 'lucide-react';
import type { Household } from '../types/expense';

interface CategoryWithHousehold {
  id: string;
  name: string;
  household_id: string | null;
}

interface ReportExpense {
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
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [allCategories, setAllCategories] = useState<CategoryWithHousehold[]>([]);
  const [selectedHouseholds, setSelectedHouseholds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expenses, setExpenses] = useState<ReportExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const availableCategories = selectedHouseholds.length
    ? allCategories.filter((c) => c.household_id && selectedHouseholds.includes(c.household_id))
    : [];

  useEffect(() => {
    if (!user) return;
    (async () => {
      setError(null);
      try {
        const hh = await loadUserHouseholds(user.id);
        setHouseholds(hh);

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

        setAllCategories((catData as CategoryWithHousehold[]) || []);
      } catch (err) {
        console.error('Unexpected error loading report filters:', err);
        setError('Something went wrong while loading report filters.');
      }
    })();
  }, [user]);

  // Reset selected categories when households change
  useEffect(() => {
    setSelectedCategories([]);
  }, [selectedHouseholds]);

  useEffect(() => {
    if (!viewingImage) {
      setImageUrl(null);
      return;
    }
    supabase.storage
      .from('receipts')
      .createSignedUrl(viewingImage, 3600)
      .then(({ data, error: err }) => {
        if (err) {
          console.error('Error loading image:', err);
          setImageUrl(null);
        } else {
          setImageUrl(data?.signedUrl ?? null);
        }
      });
  }, [viewingImage]);

  const runReport = async () => {
    if (!user || selectedHouseholds.length === 0) return;

    setLoading(true);

    try {
      const householdMap = new Map(households.map((h) => [h.id, h.name]));

      let query = supabase
        .from('expenses')
        .select('id, expense_date, vendor, total, currency, category, notes, household_id, image_path')
        .in('household_id', selectedHouseholds)
        .order('expense_date', { ascending: false });

      if (selectedCategories.length > 0) {
        const selectedCategoryNames = availableCategories
          .filter((c) => selectedCategories.includes(c.id))
          .map((c) => c.name);
        query = query.in('category', selectedCategoryNames);
      }

      if (startDate) query = query.gte('expense_date', startDate);
      if (endDate) query = query.lte('expense_date', endDate);

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Error running report:', queryError);
        setError('Failed to run report. Please try again.');
        setExpenses([]);
        setTotalAmount(0);
        return;
      }

      const filtered = (data || []).map((e) => ({
        ...e,
        household_name: householdMap.get(e.household_id) || 'Unknown',
      })) as ReportExpense[];
      setExpenses(filtered);
      setTotalAmount(filtered.reduce((sum, e) => sum + e.total, 0));
    } catch (err) {
      console.error('Unexpected error running report:', err);
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

      // CSV
      const csvContent = buildExpenseCsv(expenses, householdMap, 'id');
      downloadBlob(
        new Blob([csvContent], { type: 'text/csv' }),
        `ledgerx-report-${startDate}-to-${endDate}.csv`,
      );

      // PDF (jsPDF lazy-loaded so the ~370KB chunk only ships when actually needed)
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      let contentStartY = addReportHeader(pdf, startDate, endDate, margin);
      const maxItemsPerPage = 4;
      const cellWidth = pageWidth - 2 * margin;
      const cellHeight = (pageHeight - margin - contentStartY) / maxItemsPerPage;

      let txIndex = 0;

      for (const expense of expenses) {
        if (txIndex >= maxItemsPerPage) {
          pdf.addPage();
          contentStartY = addReportHeader(pdf, startDate, endDate, margin);
          txIndex = 0;
        }

        const xOffset = margin;
        const yOffset = contentStartY + txIndex * cellHeight;

        let yPosition = yOffset + 5;

        // Reserve right-side space for the image (aligned with the Pic ID row)
        const imageBoxWidth = 110;
        const imageX = xOffset + cellWidth - imageBoxWidth;
        const imageY = yOffset + 5;
        const textWidth = cellWidth - imageBoxWidth - 10;

        if (expense.id) {
          pdf.setFontSize(9);
          pdf.setFont(undefined as unknown as string, 'bold');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Pic ID: ${expense.id}`, xOffset, yPosition);
          yPosition += 5;
          pdf.setTextColor(0, 0, 0);
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined as unknown as string, 'bold');
        const vendorLines = pdf.splitTextToSize(expense.vendor || 'Unnamed Transaction', textWidth);
        pdf.text(vendorLines, xOffset, yPosition);
        yPosition += vendorLines.length * 6;

        pdf.setFontSize(10);
        pdf.setFont(undefined as unknown as string, 'normal');
        pdf.text(`Date: ${expense.expense_date}`, xOffset, yPosition);
        yPosition += 5;
        pdf.text(
          `Amount: ${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: expense.currency || 'USD',
          }).format(expense.total)}`,
          xOffset,
          yPosition,
        );
        yPosition += 5;

        const hhName = householdMap.get(expense.household_id);
        if (hhName) {
          pdf.text(`Household: ${hhName}`, xOffset, yPosition);
          yPosition += 5;
        }

        if (expense.category) {
          pdf.text(`Category: ${expense.category}`, xOffset, yPosition);
          yPosition += 5;
        }

        if (expense.notes) {
          const noteLines = pdf.splitTextToSize(`Notes: ${expense.notes}`, textWidth);
          const availableForNotes = imageY - yPosition - 5;
          const maxNoteLines = Math.floor(availableForNotes / 5);
          const limitedNoteLines = noteLines.slice(0, Math.max(1, maxNoteLines));
          pdf.text(limitedNoteLines, xOffset, yPosition);
          yPosition += limitedNoteLines.length * 5;
        }

        if (expense.image_path) {
          try {
            const loaded = await loadStorageImage(expense.image_path);
            if (loaded) {
              const maxImgWidth = 100;
              const maxImgHeight = 60;
              const ratio = Math.min(maxImgWidth / loaded.img.width, maxImgHeight / loaded.img.height);
              pdf.addImage(loaded.img, 'JPEG', imageX, imageY, loaded.img.width * ratio, loaded.img.height * ratio);
              URL.revokeObjectURL(loaded.objectUrl);
            }
          } catch (imageError) {
            console.error('Error loading image:', imageError);
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.text('(Image could not be loaded)', imageX, imageY);
            pdf.setTextColor(0, 0, 0);
          }
        }

        txIndex += 1;
      }

      pdf.save(`ledgerx-report-${startDate}-to-${endDate}.pdf`);
    } catch (err) {
      console.error('Error exporting report:', err);
      alert('Failed to export report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const toggleHousehold = (id: string) => {
    setSelectedHouseholds((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
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

        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Home className="w-4 h-4" />
                Households
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {households.map((h) => (
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Tag className="w-4 h-4" />
                Categories
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableCategories.map((c) => (
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

          <div className="flex justify-center">
            <button
              onClick={runReport}
              disabled={selectedHouseholds.length === 0 || loading}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl transition-all shadow-sm font-medium"
            >
              {loading ? 'Running Report...' : 'Run Report'}
            </button>
          </div>

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

              <div className="flex justify-end pt-4">
                <button
                  onClick={exportReport}
                  disabled={exporting || expenses.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl transition-all shadow-sm font-medium flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {exporting ? 'Exporting...' : 'Export PDF & CSV'}
                </button>
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
              {imageUrl ? (
                <ZoomableImage
                  src={imageUrl}
                  alt="Receipt"
                  containerClassName="max-w-full max-h-[70vh] overflow-auto"
                />
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
