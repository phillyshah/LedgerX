import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { prepareImageItem, readImageDimensions } from '../lib/imagePicker';
import { useReceiptScanner, applyReceiptDataToForm } from '../hooks/useReceiptScanner';
import { loadUserHouseholds, loadAllHouseholds, loadHouseholdCategories } from '../lib/queries';
import { ZoomableImage } from './shared/ZoomableImage';
import { X, Upload, Camera, Loader2, Plus, FileText, Search } from 'lucide-react';
import { NPILookupModal, NPIResult, formatNPIInsert } from './NPILookupModal';
import type { Household, Category, ImageItem as NewImage } from '../types/expense';
import { useEscapeClose } from '../hooks/useEscapeClose';

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
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
}

interface ExistingImage {
  id: string;
  image_path: string;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  display_order: number;
  is_work_evidence?: boolean;
  signedUrl?: string;
}

interface EditExpenseProps {
  expense: Expense;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditExpense({ expense, onClose, onSuccess }: EditExpenseProps) {
  const { user } = useAuth();
  const { t } = useT();
  useEscapeClose(onClose);
  const [categories, setCategories] = useState<Category[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [formData, setFormData] = useState({
    household_id: expense.household_id,
    expense_date: expense.expense_date,
    vendor: expense.vendor || '',
    total: expense.total.toString(),
    currency: expense.currency || 'USD',
    category: expense.category || '',
    notes: expense.notes || '',
    transcript: expense.transcript || '',
  });
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<NewImage[]>([]);
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { scanning, scanError, scan } = useReceiptScanner();
  const [showNPILookup, setShowNPILookup] = useState(false);
  const [npiInitialQuery, setNpiInitialQuery] = useState('');
  const [npiInitialResults, setNpiInitialResults] = useState<NPIResult[] | undefined>(undefined);
  const [npiSearching, setNpiSearching] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle();
      const hh = rolesData?.is_admin
        ? await loadAllHouseholds()
        : await loadUserHouseholds(user.id);
      setHouseholds(hh);
    })();
    loadExistingImages();
  }, [user]);

  useEffect(() => {
    if (formData.household_id) {
      loadHouseholdCategories(formData.household_id).then(setCategories);
    }
  }, [formData.household_id]);

  const loadExistingImages = async () => {
    // Load from expense_images table
    const { data } = await supabase
      .from('expense_images')
      .select('id, image_path, image_mime, image_width, image_height, display_order, is_work_evidence')
      .eq('expense_id', expense.id)
      .order('display_order');

    if (data && data.length > 0) {
      // Get signed URLs for all images
      const imagesWithUrls = await Promise.all(
        data.map(async (img) => {
          const { data: urlData } = await supabase.storage
            .from('receipts')
            .createSignedUrl(img.image_path, 3600);
          return { ...img, signedUrl: urlData?.signedUrl };
        })
      );
      setExistingImages(imagesWithUrls);
    } else if (expense.image_path) {
      // Fallback: load from legacy single-image field
      const { data: urlData } = await supabase.storage
        .from('receipts')
        .createSignedUrl(expense.image_path, 3600);
      setExistingImages([{
        id: '__legacy__',
        image_path: expense.image_path,
        image_mime: expense.image_mime,
        image_width: expense.image_width,
        image_height: expense.image_height,
        display_order: 0,
        signedUrl: urlData?.signedUrl || undefined,
      }]);
    }
  };

  const handleScanReceipt = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const data = await scan(file);
    if (data) applyReceiptDataToForm(setFormData, data);
  };

  const handleNewImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const item = await prepareImageItem(file);
        setNewImages((prev) => [...prev, item]);

        // Auto-scan first new image if no existing images
        if (existingImages.length === 0 && newImages.length === 0 && file.type.startsWith('image/')) {
          handleScanReceipt(item.file);
        }
      } catch (error) {
        console.error('Error processing file:', error);
        alert(t('addExpense.failedFile'));
      }
    }

    e.target.value = '';
  };

  const removeExistingImage = (imageId: string) => {
    setRemovedImageIds((prev) => [...prev, imageId]);
    setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
    setZoomedImageIndex(null);
  };

  const removeNewImage = (index: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index));
    setZoomedImageIndex(null);
  };

  const visibleExistingImages = existingImages.filter((img) => !removedImageIds.includes(img.id));
  const totalImages = visibleExistingImages.length + newImages.length;

  const handleNPIClick = async () => {
    const drMatch = formData.notes.match(/\bdr\.?\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})/i);
    if (!drMatch) {
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
        const text = formatNPIInsert(results[0]);
        setFormData((prev) => ({
          ...prev,
          notes: prev.notes.trim() ? `${prev.notes.trimEnd()}\n${text}` : text,
        }));
      } else {
        setNpiInitialQuery(extractedName);
        setNpiInitialResults(results.length > 0 ? results : undefined);
        setShowNPILookup(true);
      }
    } catch {
      setNpiInitialQuery(extractedName);
      setNpiInitialResults(undefined);
      setShowNPILookup(true);
    } finally {
      setNpiSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      // Delete removed images from storage and DB
      // Use the original existingImages list (before filtering) to find paths
      for (const imgId of removedImageIds) {
        const img = existingImages.find((i) => i.id === imgId);
        if (img) {
          await supabase.storage.from('receipts').remove([img.image_path]);
        }
        if (imgId !== '__legacy__') {
          await supabase.from('expense_images').delete().eq('id', imgId);
        }
      }

      // Upload new images and track their metadata for primary image selection
      const nextOrder = visibleExistingImages.length;
      const uploadedNewImages: { path: string; mime: string | null; width: number | null; height: number | null }[] = [];

      for (let i = 0; i < newImages.length; i++) {
        const imgItem = newImages[i];
        const fileExt = imgItem.file.name.split('.').pop();
        const fileName = `${formData.household_id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, imgItem.file);

        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          continue;
        }

        const { width: w, height: h } = await readImageDimensions(imgItem);

        await supabase.from('expense_images').insert({
          expense_id: expense.id,
          image_path: fileName,
          image_mime: imgItem.file.type,
          image_width: w,
          image_height: h,
          display_order: nextOrder + i,
        });

        uploadedNewImages.push({ path: fileName, mime: imgItem.file.type, width: w, height: h });
      }

      // Update the primary image fields on the expense for backward compat
      let primaryImagePath: string | null = null;
      let primaryImageMime: string | null = null;
      let primaryImageWidth: number | null = null;
      let primaryImageHeight: number | null = null;

      if (visibleExistingImages.length > 0) {
        const first = visibleExistingImages[0];
        primaryImagePath = first.image_path;
        primaryImageMime = first.image_mime;
        primaryImageWidth = first.image_width;
        primaryImageHeight = first.image_height;
      } else if (uploadedNewImages.length > 0) {
        primaryImagePath = uploadedNewImages[0].path;
        primaryImageMime = uploadedNewImages[0].mime;
        primaryImageWidth = uploadedNewImages[0].width;
        primaryImageHeight = uploadedNewImages[0].height;
      }

      const { error } = await supabase
        .from('expenses')
        .update({
          household_id: formData.household_id,
          expense_date: formData.expense_date,
          vendor: formData.vendor || null,
          total: parseFloat(formData.total) || 0,
          currency: formData.currency,
          category: formData.category || null,
          notes: formData.notes || null,
          transcript: formData.transcript || null,
          image_path: primaryImagePath,
          image_mime: primaryImageMime,
          image_width: primaryImageWidth,
          image_height: primaryImageHeight,
          updated_at: new Date().toISOString(),
        })
        .eq('id', expense.id);

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error updating expense:', error);
      alert(t('editExpense.failedUpdate'));
    } finally {
      setSaving(false);
    }
  };

  const renderZoomedImage = (src: string) => (
    <ZoomableImage
      src={src}
      alt="Zoomed receipt"
      onClose={() => setZoomedImageIndex(null)}
    />
  );

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-2xl shadow-xl min-h-screen sm:min-h-0 sm:max-h-[90vh] sm:my-4 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{t('editExpense.title')}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label htmlFor="household" className="block text-sm font-medium text-slate-700 mb-2">
              {t('addExpense.household')}
            </label>
            <select
              id="household"
              value={formData.household_id ?? ''}
              onChange={(e) => setFormData({ ...formData, household_id: e.target.value, category: '' })}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">{t('addExpense.selectHousehold')}</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-slate-700 mb-2">
                {t('editExpense.currency')}
              </label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
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
              rows={3}
              placeholder={t('addExpense.notesPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-all select-none">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span>
              {t('editExpense.transcriptToggle')}
            </summary>
            <textarea
              id="transcript"
              value={formData.transcript}
              onChange={(e) => setFormData({ ...formData, transcript: e.target.value })}
              rows={3}
              placeholder={t('editExpense.transcriptPlaceholder')}
              className="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </details>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('addExpense.receiptImages')}
              {totalImages > 0 && (
                <span className="ml-2 text-slate-400 font-normal">{t('addExpense.attached', { count: totalImages })}</span>
              )}
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
              {/* Zoomed view — PDFs open in new tab instead, so only render for images */}
              {zoomedImageIndex !== null && (
                <div className="mb-4">
                  {zoomedImageIndex < visibleExistingImages.length ? (
                    visibleExistingImages[zoomedImageIndex].image_mime !== 'application/pdf' &&
                    visibleExistingImages[zoomedImageIndex].signedUrl &&
                    renderZoomedImage(visibleExistingImages[zoomedImageIndex].signedUrl!)
                  ) : (
                    newImages[zoomedImageIndex - visibleExistingImages.length].file.type !== 'application/pdf' &&
                    renderZoomedImage(newImages[zoomedImageIndex - visibleExistingImages.length].preview)
                  )}
                </div>
              )}

              {totalImages > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* Existing images */}
                    {visibleExistingImages.map((img, index) => (
                      <div
                        key={img.id}
                        className="relative group rounded-lg overflow-hidden border border-slate-200 cursor-pointer"
                        onClick={() => {
                          if (img.image_mime === 'application/pdf' && img.signedUrl) {
                            window.open(img.signedUrl, '_blank');
                          } else {
                            setZoomedImageIndex(index);
                          }
                        }}
                      >
                        {img.image_mime === 'application/pdf' ? (
                          <div className="w-full h-32 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-500">
                            <FileText className="w-8 h-8 text-red-400" />
                            <span className="text-xs px-2 truncate w-full text-center">{img.image_path?.split('/').pop()}</span>
                            <span className="text-xs text-slate-400">{t('editExpense.clickToOpen')}</span>
                          </div>
                        ) : img.signedUrl ? (
                          <img src={img.signedUrl} alt={`Receipt ${index + 1}`} className="w-full h-32 object-cover" />
                        ) : (
                          <div className="w-full h-32 bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                            {t('editExpense.loadingImage')}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeExistingImage(img.id); }}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {img.is_work_evidence ? (
                          <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-amber-600/85 text-white text-xs rounded-md">
                            {t('workEvidence.badge')}
                          </span>
                        ) : index === 0 && newImages.length === 0 && (
                          <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-slate-900/70 text-white text-xs rounded-md">
                            {t('addExpense.primary')}
                          </span>
                        )}
                      </div>
                    ))}

                    {/* New images */}
                    {newImages.map((img, index) => (
                      <div
                        key={`new-${index}`}
                        className="relative group rounded-lg overflow-hidden border border-slate-200 cursor-pointer"
                        onClick={() => {
                          if (img.file.type !== 'application/pdf') {
                            setZoomedImageIndex(visibleExistingImages.length + index);
                          }
                        }}
                      >
                        {img.file.type === 'application/pdf' ? (
                          <div className="w-full h-32 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-500">
                            <FileText className="w-8 h-8 text-red-400" />
                            <span className="text-xs px-2 truncate w-full text-center">{img.file.name}</span>
                          </div>
                        ) : (
                          <img src={img.preview} alt={`New receipt ${index + 1}`} className="w-full h-32 object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeNewImage(index); }}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-emerald-600/70 text-white text-xs rounded-md">
                          {t('editExpense.newBadge')}
                        </span>
                      </div>
                    ))}

                    {/* Add more button */}
                    <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <Plus className="w-6 h-6 text-slate-400" />
                      <span className="text-xs text-slate-400 mt-1">{t('addExpense.addMore')}</span>
                      <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={handleNewImageChange} className="hidden" />
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
                        onClick={() => {
                          const firstFile = newImages[0]?.file;
                          if (firstFile) handleScanReceipt(firstFile);
                        }}
                        className="ml-2 text-red-700 underline font-medium"
                      >
                        {t('common.retry')}
                      </button>
                    </div>
                  )}
                  {!scanning && !scanError && newImages.length > 0 && newImages[0].file.type.startsWith('image/') && (
                    <button
                      type="button"
                      onClick={() => handleScanReceipt(newImages[0].file)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all"
                    >
                      <Camera className="w-4 h-4" />
                      {t('editExpense.scanReceipt')}
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer py-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{t('addExpense.uploadReceipts')}</p>
                  <p className="text-xs text-slate-400">{t('editExpense.uploadHint')}</p>
                  <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={handleNewImageChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('common.saving') : t('editExpense.saveChanges')}
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
