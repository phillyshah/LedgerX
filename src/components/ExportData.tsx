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

      const addPageHeader = () => {
        pdf.setFontSize(16); // Smaller title
        pdf.text('Transaction Report', margin, margin);

        pdf.setFontSize(9); // Smaller date
        pdf.text(`Period: ${startDate} to ${endDate}`, margin, margin + 10);

        // Leave less space after the header
        return margin + 20;
      };

      let contentStartY = addPageHeader();
      const maxItemsPerPage = 4;
      const cols = 1; // Single column for vertical stacking
      const rows = 4;
      const cellWidth = pageWidth - 2 * margin;
      const cellHeight = (pageHeight - margin - contentStartY) / rows;

      let txIndex = 0;

      for (let i = 0; i < expenses.length; i++) {
        const expense = expenses[i];

        if (txIndex >= maxItemsPerPage) {
          pdf.addPage();
          contentStartY = addPageHeader();
          txIndex = 0;
        }

        // Calculate grid position
        const col = txIndex % cols;
        const row = Math.floor(txIndex / cols);
        const xOffset = margin + col * cellWidth;
        const yOffset = contentStartY + row * cellHeight;

        let yPosition = yOffset + 5; // Small padding inside cell

        // Reserve right-side space for the image (aligned with the Pic ID row)
        const imageBoxWidth = 110;
        const imageX = xOffset + cellWidth - imageBoxWidth;
        const imageY = yOffset + 5;
        const textWidth = cellWidth - imageBoxWidth - 10;

        // Show pic-id as header
        if (expense.pic_id) {
          pdf.setFontSize(9);
          pdf.setFont(undefined as unknown as string, 'bold');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Pic ID: ${expense.pic_id}`, xOffset, yPosition);
          yPosition += 5;
          pdf.setTextColor(0, 0, 0);
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined as unknown as string, 'bold');
        const vendorLines = pdf.splitTextToSize(`${expense.vendor || 'Unnamed Transaction'}`, textWidth);
        pdf.text(vendorLines, margin, yPosition);
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
          yPosition
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
          const noteLines = pdf.splitTextToSize(
            `Notes: ${expense.notes}`,
            textWidth // Leave some padding for the image column
          );

          // Limit to fit above the image
          const availableForNotes = imageY - yPosition - 5;
          const maxNoteLines = Math.floor(availableForNotes / 5);
          const limitedNoteLines = noteLines.slice(0, Math.max(1, maxNoteLines));

          pdf.text(limitedNoteLines, xOffset, yPosition);
          yPosition += limitedNoteLines.length * 5;
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

              const maxImgWidth = imageBoxWidth - 10;
              const maxImgHeight = 60; // Increased size to better visibility
              let imgWidth = expense.image_width || img.width;
              let imgHeightRaw = expense.image_height || img.height;

              const widthRatio = maxImgWidth / imgWidth;
              const heightRatio = maxImgHeight / imgHeightRaw;
              const ratio = Math.min(widthRatio, heightRatio);

              imgWidth *= ratio;
              const adjustedImgHeight = imgHeightRaw * ratio;

              let imageFormat = 'JPEG';
              if (expense.image_mime) {
                if (expense.image_mime.includes('png')) {
                  imageFormat = 'PNG';
                } else if (expense.image_mime.includes('webp')) {
                  imageFormat = 'WEBP';
                }
              }

              pdf.addImage(img, imageFormat, imageX, imageY, imgWidth, adjustedImgHeight);

              URL.revokeObjectURL(imageUrl);
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
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-md shadow-xl min-h-screen sm:min-h-0 sm:my-4">
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
