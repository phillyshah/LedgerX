import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Download, ChevronDown } from 'lucide-react';
import { jsPDF } from 'jspdf';

interface Household {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface CategoryHousehold {
  category_id: string;
  household_id: string;
}

type SortBy = 'date' | 'household' | 'category';

interface ExportDataProps {
  onClose: () => void;
}

export function ExportData({ onClose }: ExportDataProps) {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string>('all');
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [categoryHouseholds, setCategoryHouseholds] = useState<CategoryHousehold[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Load households
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

  // Load categories and their household assignments
  useEffect(() => {
    if (!user || households.length === 0) return;
    Promise.all([
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('category_households').select('category_id, household_id'),
    ]).then(([catRes, chRes]) => {
      if (catRes.data) setAllCategories(catRes.data);
      if (chRes.data) setCategoryHouseholds(chRes.data);
    });
  }, [user, households]);

  // Reset selected categories when household selection changes
  useEffect(() => {
    setSelectedCategories([]);
  }, [selectedHousehold]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter categories based on selected household
  // A category with no entries in category_households is global (available to all)
  const availableCategories = allCategories.filter((c) => {
    const assignedHouseholds = categoryHouseholds
      .filter((ch) => ch.category_id === c.id)
      .map((ch) => ch.household_id);
    const isGlobal = assignedHouseholds.length === 0;
    if (selectedHousehold === 'all') {
      // Show global categories + categories assigned to any of the user's households
      return isGlobal || assignedHouseholds.some((hid) => households.some((h) => h.id === hid));
    }
    // Show global categories + categories assigned to the selected household
    return isGlobal || assignedHouseholds.includes(selectedHousehold);
  });

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const selectAllCategories = () => {
    setSelectedCategories([]);
  };

  const deselectAllCategories = () => {
    setSelectedCategories(['__none__']);
  };

  // Empty selectedCategories means "all categories" (default)
  const allSelected = selectedCategories.length === 0;

  const getCategoryDropdownLabel = () => {
    if (allSelected) return 'All Categories';
    if (selectedCategories.length === 1 && selectedCategories[0] === '__none__') return 'None selected';
    const count = selectedCategories.filter((c) => c !== '__none__').length;
    if (count === 1) {
      const cat = availableCategories.find((c) => c.id === selectedCategories[0]);
      return cat ? cat.name : '1 category';
    }
    return `${count} categories`;
  };

  const sortExpenses = (expenses: any[], householdMap: Map<string, string>) => {
    return [...expenses].sort((a, b) => {
      const dateCompare = (a.expense_date || '').localeCompare(b.expense_date || '');
      const householdCompare = (householdMap.get(a.household_id) || '').localeCompare(householdMap.get(b.household_id) || '');
      const categoryCompare = (a.category || '').localeCompare(b.category || '');

      switch (sortBy) {
        case 'household':
          return householdCompare || dateCompare;
        case 'category':
          return categoryCompare || householdCompare || dateCompare;
        case 'date':
        default:
          return dateCompare;
      }
    });
  };

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
        .order('expense_date', { ascending: true });

      // Apply category filter if specific categories are selected
      if (!allSelected) {
        const selectedCategoryNames = availableCategories
          .filter((c) => selectedCategories.includes(c.id))
          .map((c) => c.name);
        if (selectedCategoryNames.length > 0) {
          query = query.in('category', selectedCategoryNames);
        } else {
          // No categories selected - return empty result
          query = query.eq('category', '__impossible_match__');
        }
      }

      const { data: expensesData, error } = await query;
      if (error) throw error;

      const expenses = sortExpenses(expensesData, householdMap);

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
        pdf.setFontSize(16);
        pdf.text('Transaction Report', margin, margin);

        pdf.setFontSize(9);
        pdf.text(`Period: ${startDate} to ${endDate}`, margin, margin + 10);

        return margin + 20;
      };

      let contentStartY = addPageHeader();
      const maxItemsPerPage = 4;
      const cols = 1;
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

        const col = txIndex % cols;
        const row = Math.floor(txIndex / cols);
        const xOffset = margin + col * cellWidth;
        const yOffset = contentStartY + row * cellHeight;

        let yPosition = yOffset + 5;

        const imageBoxWidth = 110;
        const imageX = xOffset + cellWidth - imageBoxWidth;
        const imageY = yOffset + 5;
        const textWidth = cellWidth - imageBoxWidth - 10;

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
            textWidth
          );

          const availableForNotes = imageY - yPosition - 5;
          const maxNoteLines = Math.floor(availableForNotes / 5);
          const limitedNoteLines = noteLines.slice(0, Math.max(1, maxNoteLines));

          pdf.text(limitedNoteLines, xOffset, yPosition);
          yPosition += limitedNoteLines.length * 5;
        }

        // Load images from expense_images table, fallback to legacy single image
        let expenseImages: { image_path: string; image_mime: string | null; image_width: number | null; image_height: number | null }[] = [];
        const { data: imgRows } = await supabase
          .from('expense_images')
          .select('image_path, image_mime, image_width, image_height')
          .eq('expense_id', expense.id)
          .order('display_order');

        if (imgRows && imgRows.length > 0) {
          expenseImages = imgRows;
        } else if (expense.image_path) {
          expenseImages = [{
            image_path: expense.image_path,
            image_mime: expense.image_mime,
            image_width: expense.image_width,
            image_height: expense.image_height,
          }];
        }

        if (expenseImages.length > 0) {
          const maxImgPerTx = 2; // Show up to 2 images per transaction in PDF
          const imagesToShow = expenseImages.slice(0, maxImgPerTx);
          let currentImageY = imageY;

          for (let imgIdx = 0; imgIdx < imagesToShow.length; imgIdx++) {
            const expImg = imagesToShow[imgIdx];
            try {
              const { data: imageData } = await supabase.storage
                .from('receipts')
                .download(expImg.image_path);

              if (imageData) {
                const imageUrl = URL.createObjectURL(imageData);
                const img = new Image();

                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = reject;
                  img.src = imageUrl;
                });

                const maxImgWidth = imageBoxWidth - 10;
                const maxImgHeight = imagesToShow.length > 1 ? 28 : 60;
                let imgWidth = expImg.image_width || img.width;
                let imgHeightRaw = expImg.image_height || img.height;

                const widthRatio = maxImgWidth / imgWidth;
                const heightRatio = maxImgHeight / imgHeightRaw;
                const ratio = Math.min(widthRatio, heightRatio);

                imgWidth *= ratio;
                const adjustedImgHeight = imgHeightRaw * ratio;

                let imageFormat = 'JPEG';
                if (expImg.image_mime) {
                  if (expImg.image_mime.includes('png')) {
                    imageFormat = 'PNG';
                  } else if (expImg.image_mime.includes('webp')) {
                    imageFormat = 'WEBP';
                  }
                }

                pdf.addImage(img, imageFormat, imageX, currentImageY, imgWidth, adjustedImgHeight);
                currentImageY += adjustedImgHeight + 2;

                URL.revokeObjectURL(imageUrl);
              }
            } catch (imageError) {
              console.error('Error loading image:', imageError);
              pdf.setFontSize(8);
              pdf.setTextColor(150, 150, 150);
              pdf.text('(Image could not be loaded)', imageX, currentImageY);
              pdf.setTextColor(0, 0, 0);
              currentImageY += 10;
            }
          }

          if (expenseImages.length > maxImgPerTx) {
            pdf.setFontSize(7);
            pdf.setTextColor(130, 130, 130);
            pdf.text(`+${expenseImages.length - maxImgPerTx} more image(s)`, imageX, currentImageY);
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

          {/* Category Filter Dropdown */}
          <div ref={categoryDropdownRef} className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Categories
            </label>
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all flex items-center justify-between text-left"
            >
              <span className={allSelected ? 'text-slate-900' : 'text-slate-900'}>
                {getCategoryDropdownLabel()}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {categoryDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                <div className="p-2 border-b border-slate-100 flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAllCategories}
                    className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Deselect All
                  </button>
                </div>
                {availableCategories.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={allSelected || selectedCategories.includes(c.id)}
                      onChange={() => {
                        if (allSelected) {
                          // Switch from "all" to "all except this one"
                          setSelectedCategories(
                            availableCategories.filter((cat) => cat.id !== c.id).map((cat) => cat.id)
                          );
                        } else {
                          toggleCategory(c.id);
                        }
                      }}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">{c.name}</span>
                  </label>
                ))}
                {availableCategories.length === 0 && (
                  <p className="px-4 py-3 text-sm text-slate-400">No categories available</p>
                )}
              </div>
            )}
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

          {/* Sort By Dropdown */}
          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-slate-700 mb-2">
              Sort By
            </label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="date">Date</option>
              <option value="household">Household, then Date</option>
              <option value="category">Category, then Household, then Date</option>
            </select>
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
