import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { scanReceipt, formatReceiptNotes, ReceiptData } from '../lib/receiptScanner';
import { X, Upload, Check, Camera, Loader2, Plus, FileText, Search } from 'lucide-react';
import { NPILookupModal, NPIResult, formatNPIInsert } from './NPILookupModal';

interface Household {
  id: string;
  name: string;
  features_enabled?: Record<string, boolean> | null;
}

interface Category {
  id: string;
  name: string;
}

interface ImageItem {
  file: File;
  preview: string;
}

interface AddExpenseProps {
  onClose: () => void;
  onSaved: () => void;
}

export function AddExpense({ onClose, onSaved }: AddExpenseProps) {
  const { user } = useAuth();
  const { t } = useT();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    household_id: '',
    expense_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    vendor: '',
    total: '',
    category: '',
    notes: '',
  });
  const [images, setImages] = useState<ImageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [categoryAutoFilled, setCategoryAutoFilled] = useState(false);
  const [showNPILookup, setShowNPILookup] = useState(false);
  const [npiInitialQuery, setNpiInitialQuery] = useState('');
  const [npiInitialResults, setNpiInitialResults] = useState<NPIResult[] | undefined>(undefined);
  const [npiSearching, setNpiSearching] = useState(false);

  useEffect(() => {
    loadOptions();
  }, [user]);

  useEffect(() => {
    if (formData.household_id) {
      loadCategoriesForHousehold(formData.household_id);
    }
  }, [formData.household_id]);

  // Auto-populate category when vendor changes (debounced to avoid firing on every keystroke)
  useEffect(() => {
    if (!formData.vendor || !formData.household_id || formData.category) return;
    const timer = setTimeout(() => {
      lookupVendorCategory(formData.vendor, formData.household_id);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.vendor, formData.household_id]);

  const loadOptions = async () => {
    if (!user) return;

    const householdRes = await supabase
      .from('household_members')
      .select('household_id, households(id, name, features_enabled)')
      .eq('user_id', user.id);

    if (householdRes.data) {
      const hh = householdRes.data
        .map((item) => item.households)
        .filter(Boolean) as unknown as Household[];
      setHouseholds(hh);
      if (hh.length === 1) {
        setFormData((prev) => ({ ...prev, household_id: hh[0].id }));
      }
    }
  };

  const loadCategoriesForHousehold = async (householdId: string) => {
    // Get categories assigned to this household via junction table
    const { data: junctionData } = await supabase
      .from('category_households')
      .select('categories(id, name)')
      .eq('household_id', householdId);

    const junctionCats = (junctionData || [])
      .map((r) => r.categories)
      .filter(Boolean) as unknown as Category[];

    // Also get global categories (household_id IS NULL, available to all)
    const { data: globalCats } = await supabase
      .from('categories')
      .select('id, name')
      .is('household_id', null)
      .order('name');

    // Merge junction-assigned + global, deduplicate
    const all = [...junctionCats, ...(globalCats || [])];
    const seen = new Set<string>();
    const unique = all
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    setCategories(unique);
  };

  const lookupVendorCategory = async (vendor: string, householdId: string) => {
    const { data } = await supabase
      .from('vendor_category_map')
      .select('category_name')
      .eq('household_id', householdId)
      .ilike('vendor_name', vendor)
      .maybeSingle();

    if (data?.category_name) {
      // Only auto-fill if the category is valid for this household
      const isValid = categories.some((c) => c.name === data.category_name);
      if (isValid) {
        setFormData((prev) => ({ ...prev, category: data.category_name }));
        setCategoryAutoFilled(true);
      }
    }
  };

  const upsertVendorCategory = async (vendor: string, category: string, householdId: string) => {
    if (!vendor || !category) return;
    await supabase
      .from('vendor_category_map')
      .upsert(
        { household_id: householdId, vendor_name: vendor, category_name: category, updated_at: new Date().toISOString() },
        { onConflict: 'household_id,vendor_name' }
      );
  };

  const applyReceiptData = (data: ReceiptData) => {
    const enhanced = formatReceiptNotes(data);
    setFormData((prev) => ({
      ...prev,
      vendor: data.vendor_name || prev.vendor,
      total: data.total_amount != null ? data.total_amount.toFixed(2) : prev.total,
      expense_date: data.transaction_date || prev.expense_date,
      category: data.category || prev.category,
      notes: enhanced
        ? prev.notes ? `${prev.notes}\n${enhanced}` : enhanced
        : prev.notes,
    }));
  };

  const handleScanReceipt = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setScanning(true);
    setScanError(null);
    try {
      // OpenAI uses detail:"low" → 512px internal — send a smaller copy to cut upload time
      const ocrFile = await compressImage(file, 0.3, 800, 800);
      const data = await scanReceipt(ocrFile);
      applyReceiptData(data);
    } catch (error) {
      console.error('Receipt scan error:', error);
      setScanError(error instanceof Error ? error.message : t('addExpense.failedScan'));
    } finally {
      setScanning(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        let fileToUse = file;
        if (file.type.startsWith('image/')) {
          fileToUse = await compressImage(file, 2);
        }
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(fileToUse);
        });

        setImages((prev) => [...prev, { file: fileToUse, preview }]);

        // Auto-scan only the first image added when form fields are empty
        if (images.length === 0 && file.type.startsWith('image/')) {
          handleScanReceipt(fileToUse);
        }
      } catch (error) {
        console.error('Error processing file:', error);
        alert(t('addExpense.failedFile'));
      }
    }

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) setScanError(null);
      return updated;
    });
  };

  const resetForm = () => {
    setFormData((prev) => ({
      household_id: prev.household_id,
      expense_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
      vendor: '',
      total: '',
      category: '',
      notes: '',
    }));
    setImages([]);
    setScanError(null);
    setCategoryAutoFilled(false);
  };

  const saveExpense = async () => {
    if (!user || !formData.household_id) return false;

    setSaving(true);
    try {
      // Keep backward compat: store first image in expense row too
      let imagePath = null;
      let imageMime = null;
      let imageWidth = null;
      let imageHeight = null;

      if (images.length > 0) {
        const firstImg = images[0];
        const fileExt = firstImg.file.name.split('.').pop();
        const fileName = `${formData.household_id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, firstImg.file);

        if (!uploadError) {
          imagePath = fileName;
          imageMime = firstImg.file.type;

          const img = new Image();
          img.src = firstImg.preview;
          await new Promise((resolve) => {
            img.onload = () => {
              imageWidth = img.width;
              imageHeight = img.height;
              resolve(null);
            };
          });
        }
      }

      const { data: expenseData, error } = await supabase.from('expenses').insert({
        household_id: formData.household_id,
        created_by: user.id,
        expense_date: formData.expense_date,
        vendor: formData.vendor || null,
        total: parseFloat(formData.total) || 0,
        category: formData.category || null,
        notes: formData.notes || null,
        image_path: imagePath,
        image_mime: imageMime,
        image_width: imageWidth,
        image_height: imageHeight,
      }).select('id').single();

      if (error) throw error;

      // Upload all images to expense_images table
      for (let i = 0; i < images.length; i++) {
        const imgItem = images[i];
        let uploadedPath: string;

        if (i === 0 && imagePath) {
          // First image already uploaded above
          uploadedPath = imagePath;
        } else {
          const fileExt = imgItem.file.name.split('.').pop();
          const fileName = `${formData.household_id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(fileName, imgItem.file);

          if (uploadError) {
            console.error('Error uploading image:', uploadError);
            continue;
          }
          uploadedPath = fileName;
        }

        // Get dimensions
        let w: number | null = null;
        let h: number | null = null;
        if (imgItem.file.type.startsWith('image/')) {
          const img = new Image();
          img.src = imgItem.preview;
          await new Promise((resolve) => {
            img.onload = () => {
              w = img.width;
              h = img.height;
              resolve(null);
            };
          });
        }

        await supabase.from('expense_images').insert({
          expense_id: expenseData.id,
          image_path: uploadedPath,
          image_mime: imgItem.file.type,
          image_width: w,
          image_height: h,
          display_order: i,
        });
      }

      // Update vendor-to-category mapping for future auto-fill
      if (formData.vendor && formData.category) {
        upsertVendorCategory(formData.vendor, formData.category, formData.household_id);
      }

      onSaved();
      setJustSaved(true);
      setCategoryAutoFilled(false);
      setTimeout(() => setJustSaved(false), 2000);
      return true;
    } catch (error) {
      console.error('Error adding expense:', error);
      alert(t('addExpense.failedSave'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Extract a surgeon name from notes (text after "Dr" / "Dr."), auto-search NPI,
  // then either insert directly (1 result) or open the modal (0 or multiple results).
  const handleNPIClick = async () => {
    const drMatch = formData.notes.match(/\bdr\.?\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})/i);
    if (!drMatch) {
      // No "Dr" found — open blank modal.
      setNpiInitialQuery('');
      setNpiInitialResults(undefined);
      setShowNPILookup(true);
      return;
    }
    const extractedName = drMatch[1].trim();
    setNpiSearching(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('lookup-npi', {
        body: { query: extractedName },
      });
      if (fnError) throw fnError;
      const results: NPIResult[] = data?.results ?? [];
      if (results.length === 1) {
        // Single match — insert automatically, no modal needed.
        const text = formatNPIInsert(results[0]);
        setFormData((prev) => ({
          ...prev,
          notes: prev.notes.trim() ? `${prev.notes.trimEnd()}\n${text}` : text,
        }));
      } else {
        // 0 or multiple matches — open modal with pre-filled query (and results if any).
        setNpiInitialQuery(extractedName);
        setNpiInitialResults(results.length > 0 ? results : undefined);
        setShowNPILookup(true);
      }
    } catch {
      // On error fall back to blank modal.
      setNpiInitialQuery(extractedName);
      setNpiInitialResults(undefined);
      setShowNPILookup(true);
    } finally {
      setNpiSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await saveExpense();
    if (success) {
      resetForm();
    }
  };

  const handleDone = async () => {
    if (!formData.vendor && !formData.total) {
      onClose();
      return;
    }

    const success = await saveExpense();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-2xl shadow-xl min-h-screen sm:min-h-0 sm:max-h-[90vh] sm:my-4 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{t('addExpense.title')}</h2>
            <div className="flex items-center gap-3">
              {justSaved && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <Check className="w-4 h-4" />
                  {t('addExpense.saved')}
                </span>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {t('addExpense.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="household" className="block text-sm font-medium text-slate-700 mb-2">
              {t('addExpense.household')}
            </label>
            <select
              id="household"
              value={formData.household_id}
              onChange={(e) => setFormData({ ...formData, household_id: e.target.value })}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">{t('addExpense.selectHousehold')}</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="expense_date" className="block text-sm font-medium text-slate-700 mb-2">
                {t('addExpense.date')}
              </label>
              <input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label htmlFor="total" className="block text-sm font-medium text-slate-700 mb-2">
                {t('addExpense.amount')}
              </label>
              <input
                id="total"
                type="number"
                step="0.01"
                value={formData.total}
                onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                required
                placeholder="0.00"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="vendor" className="block text-sm font-medium text-slate-700 mb-2">
              {t('addExpense.vendor')}
            </label>
            <input
              id="vendor"
              type="text"
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              placeholder={t('addExpense.vendorPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-2">
              {t('addExpense.category')}
            </label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">{t('addExpense.selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
                {t('addExpense.notes')}
              </label>
              {(() => {
                const hh = households.find((h) => h.id === formData.household_id);
                if (!hh?.features_enabled?.surgeon_npi_lookup) return null;
                return (
                  <button
                    type="button"
                    onClick={handleNPIClick}
                    disabled={npiSearching}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 hover:text-white hover:bg-green-600 border border-green-600 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {npiSearching
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Search className="w-3 h-3" />}
                    {t('addExpense.lookupNPI')}
                  </button>
                );
              })()}
            </div>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              placeholder={t('addExpense.notesPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('addExpense.receiptImages')}
              {images.length > 0 && (
                <span className="ml-2 text-slate-400 font-normal">{t('addExpense.attached', { count: images.length })}</span>
              )}
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
              {images.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, index) => (
                      <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200">
                        {img.file.type === 'application/pdf' ? (
                          <div className="w-full h-32 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-500">
                            <FileText className="w-8 h-8 text-red-400" />
                            <span className="text-xs text-center px-2 truncate w-full text-center">{img.file.name}</span>
                          </div>
                        ) : (
                          <img src={img.preview} alt={`Receipt ${index + 1}`} className="w-full h-32 object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-slate-900/70 text-white text-xs rounded-md">
                            {t('addExpense.primary')}
                          </span>
                        )}
                      </div>
                    ))}
                    <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <Plus className="w-6 h-6 text-slate-400" />
                      <span className="text-xs text-slate-400 mt-1">{t('addExpense.addMore')}</span>
                      <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={handleImageChange} className="hidden" />
                    </label>
                  </div>
                  {scanning && (
                    <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('addExpense.scanning')}
                    </div>
                  )}
                  {scanError && (
                    <div className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3 flex items-center justify-between">
                      <span>{scanError}</span>
                      <button
                        type="button"
                        onClick={() => images.length > 0 && handleScanReceipt(images[0].file)}
                        className="ml-2 text-red-700 underline font-medium"
                      >
                        {t('common.retry')}
                      </button>
                    </div>
                  )}
                  {!scanning && !scanError && images.length > 0 && images[0].file.type.startsWith('image/') && (
                    <button
                      type="button"
                      onClick={() => handleScanReceipt(images[0].file)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all"
                    >
                      <Camera className="w-4 h-4" />
                      {t('addExpense.rescan')}
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer py-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{t('addExpense.uploadReceipts')}</p>
                  <p className="text-xs text-slate-400">{t('addExpense.uploadHint')}</p>
                  <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={handleImageChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="py-3 px-4 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDone}
              disabled={saving}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('common.saving') : t('addExpense.done')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('common.saving') : t('addExpense.saveAndAdd')}
            </button>
          </div>
        </form>
      </div>
      {showNPILookup && (
        <NPILookupModal
          onClose={() => setShowNPILookup(false)}
          initialQuery={npiInitialQuery}
          initialResults={npiInitialResults}
          onInsert={(text) => {
            setFormData((prev) => ({
              ...prev,
              notes: prev.notes.trim() ? `${prev.notes.trimEnd()}\n${text}` : text,
            }));
          }}
        />
      )}
    </div>
  );
}
