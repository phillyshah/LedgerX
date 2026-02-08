import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

interface Household {
  id: string;
  name: string;
}

interface ExportDataProps {
  onClose: () => void;
}

export function ExportData({ onClose }: ExportDataProps) {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) {
          const hh = data
            .map((item) => item.households)
            .filter(Boolean) as unknown as Household[];
          setHouseholds(hh);
        }
      });
  }, [user]);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setExporting(true);
    try {
      const householdIds =
        selectedHousehold === 'all'
          ? households.map((h) => h.id)
          : [selectedHousehold];

      const householdMap = new Map(households.map((h) => [h.id, h.name]));

      let query = supabase
        .from('expenses')
        .select('*')
        .in('household_id', householdIds)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false });

      const { data: expensesData, error } = await query;
      if (error) throw error;

      // Sort by pic_id for PDF export
      const expenses = [...expensesData].sort((a, b) => {
        if (!a.pic_id || !b.pic_id) return 0;
        return a.pic_id.localeCompare(b.pic_id);
      });

      const csvContent = [
        ['Pic ID', 'Date', 'Vendor', 'Amount', 'Currency', 'Category', 'Household', 'Notes'].join(','),
        ...expenses.map((expense) =>
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
      csvLink.download = `ledgerx-export-${startDate}-to-${endDate}.csv`;
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
      pdf.text('Transaction Report', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.text(`Period: ${startDate} to ${endDate}`, margin, yPosition);
      yPosition += 15;

      for (let i = 0; i < expenses.length; i++) {
        const expense = expenses[i];

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

        if (i < expenses.length - 1) {
          pdf.setDrawColor(200, 200, 200);
          pdf.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 10;
        }
      }

      pdf.save(`ledgerx-export-${startDate}-to-${endDate}.pdf`);

      if (selectedHousehold !== 'all') {
        await supabase.from('exports').insert({
          household_id: selectedHousehold,
          requested_by: user.id,
          start_date: startDate,
          end_date: endDate,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }

      onClose();
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Export Data</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleExport} className="p-6 space-y-6">
          <div>
            <label htmlFor="exportHousehold" className="block text-sm font-medium text-slate-700 mb-2">
              Household
            </label>
            <select
              id="exportHousehold"
              value={selectedHousehold}
              onChange={(e) => setSelectedHousehold(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="all">All Households</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-2">
              Start Date
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-2">
              End Date
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Download className="w-5 h-5 text-slate-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900 mb-1">CSV & PDF Export</p>
                <p className="text-sm text-slate-600">
                  Your data will be exported as a CSV file and a PDF with all receipt images included.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={exporting}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
