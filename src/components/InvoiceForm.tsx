import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { scanInvoice } from '../lib/invoiceScanner';
import { X, Upload, Check, Loader2, Plus, FileText, AlertTriangle } from 'lucide-react';
import { findInvoiceDuplicates, type InvoiceDuplicate } from '../lib/duplicates';
import { TemplatePicker, SaveAsTemplateToggle } from './TemplatePicker';

interface Household {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  household_ids: string[]; // empty = global
}

interface ImageItem {
  file: File;
  preview: string;
}

export interface InvoiceFormInitialData {
  vendor_name?: string;
  invoice_number?: string;
  amount?: string;
  description?: string;
  invoice_date?: string;
  /** Storage paths of attachments forwarded via email */
  attachment_paths?: string[];
}

interface InvoiceFormProps {
  onClose: () => void;
  onSaved: () => void;
  initialData?: InvoiceFormInitialData;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function InvoiceForm({ onClose, onSaved, initialData }: InvoiceFormProps) {
  const { user } = useAuth();
  const { t } = useT();
  useEscapeClose(onClose);

  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState({
    household_id: '',
    category_id: '',
    invoice_number: initialData?.invoice_number ?? '',
    amount: initialData?.amount ?? '',
    currency: 'USD',
    description: initialData?.description ?? '',
    service_date_start: initialData?.invoice_date ?? today(),
    service_date_end: initialData?.invoice_date ?? today(),
  });
  const [images, setImages] = useState<ImageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  // Possible-duplicate matches by invoice_number within the household.
  // Non-blocking warning (same UX shape as AddExpense).
  const [duplicateMatches, setDuplicateMatches] = useState<InvoiceDuplicate[]>([]);
  // Template state (parallel to AddExpense). Owner-scoped via RLS.
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templatesRefresh, setTemplatesRefresh] = useState(0);

  useEffect(() => {
    if (!formData.household_id || !formData.invoice_number.trim()) {
      setDuplicateMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      const matches = await findInvoiceDuplicates({
        householdId: formData.household_id,
        invoiceNumber: formData.invoice_number,
      });
      setDuplicateMatches(matches);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.household_id, formData.invoice_number]);

  useEffect(() => {
    loadData();
  }, [user]);

  // Hydrate images from forwarded-email attachment paths and auto-run OCR
  // on the first one — same shape as a direct upload. handleScanInvoice
  // accepts both images and PDFs (the edge function handles PDFs via
  // pdfFirstPageToJpeg in scanInvoice).
  useEffect(() => {
    const paths = initialData?.attachment_paths;
    if (!paths || paths.length === 0) return;
    let cancelled = false;
    (async () => {
      const loaded: ImageItem[] = [];
      // Skip the synthetic .html "email body" attachment created by
      // inbound-email when a forwarded invoice had no real attachment.
      // It's there only as a preview on the inbox card.
      const usable = paths.filter((p) => !/\.html?$/i.test(p));
      for (const p of usable) {
        try {
          const { data, error } = await supabase.storage.from('receipts').download(p);
          if (error || !data) continue;
          const filename = p.split('/').pop() || 'attachment';
          const ext = filename.split('.').pop()?.toLowerCase() ?? '';
          const mime =
            data.type ||
            (ext === 'pdf' ? 'application/pdf'
              : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
              : ext === 'png' ? 'image/png'
              : ext === 'webp' ? 'image/webp'
              : 'application/octet-stream');
          const file = new File([data], filename, { type: mime });
          const preview = URL.createObjectURL(file);
          loaded.push({ file, preview });
        } catch {
          /* swallow per-file errors */
        }
      }
      if (cancelled || loaded.length === 0) return;
      setImages(loaded);
      const hasPrefill =
        !!initialData?.vendor_name ||
        !!initialData?.amount ||
        !!initialData?.invoice_date;
      if (!hasPrefill) handleScanInvoice(loaded[0].file);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    if (!user) return;
    const [memberRes, catRes, catHhRes] = await Promise.all([
      supabase.from('household_members').select('household_id, households(id, name)').eq('user_id', user.id),
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('category_households').select('category_id, household_id'),
    ]);

    if (memberRes.data) {
      const hh = memberRes.data.map((item) => item.households).filter(Boolean) as unknown as Household[];
      setHouseholds(hh);
      if (hh.length === 1) {
        setFormData((prev) => ({ ...prev, household_id: hh[0].id }));
      }
    }

    // Build category → household-ids map (empty array = global category).
    const catHhByCat = new Map<string, string[]>();
    for (const r of (catHhRes.data || []) as Array<{ category_id: string; household_id: string }>) {
      const arr = catHhByCat.get(r.category_id) || [];
      arr.push(r.household_id);
      catHhByCat.set(r.category_id, arr);
    }
    setCategories(((catRes.data || []) as Array<{ id: string; name: string }>).map((c) => ({
      id: c.id, name: c.name, household_ids: catHhByCat.get(c.id) || [],
    })));
  };

  // Globals (no mappings) + any category explicitly mapped to the selected household.
  const categoriesForSelectedHousehold = (): CategoryOption[] =>
    categories.filter((c) =>
      c.household_ids.length === 0 || (formData.household_id && c.household_ids.includes(formData.household_id))
    );

  const applyOCRData = (data: Awaited<ReturnType<typeof scanInvoice>>) => {
    setFormData((prev) => ({
      ...prev,
      invoice_number: data.invoice_number || prev.invoice_number,
      amount: data.total_amount != null ? data.total_amount.toFixed(2) : prev.amount,
      currency: data.currency || prev.currency,
      description: data.description || prev.description,
      service_date_start: data.service_date_start || data.invoice_date || prev.service_date_start,
      service_date_end: data.service_date_end || data.invoice_date || prev.service_date_end,
    }));
  };

  const handleScanInvoice = async (file: File) => {
    setScanning(true);
    setScanError(null);
    try {
      // Compress images before sending (PDFs passed as-is since we can't easily compress them)
      const fileToScan = file.type.startsWith('image/') ? await compressImage(file, 0.3, 800, 800) : file;
      const data = await scanInvoice(fileToScan);
      applyOCRData(data);
    } catch (error) {
      console.error('Invoice scan error:', error);
      setScanError(error instanceof Error ? error.message : t('invoice.failedScan'));
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

        setImages((prev) => {
          const isFirst = prev.length === 0;
          // Auto-scan first file when it's added
          if (isFirst) {
            handleScanInvoice(fileToUse);
          }
          return [...prev, { file: fileToUse, preview }];
        });
      } catch (error) {
        console.error('Error processing file:', error);
        alert(t('invoice.failedFile'));
      }
    }

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) setScanError(null);
      return updated;
    });
  };

  const validate = (): boolean => {
    if (formData.service_date_end < formData.service_date_start) {
      setDateError(t('invoice.dateServiceEndBeforeStart'));
      return false;
    }
    setDateError(null);
    return true;
  };

  const saveInvoice = async (): Promise<boolean> => {
    if (!user || !formData.household_id) return false;
    if (!validate()) return false;

    setSaving(true);
    try {
      // Upload first image to receipts bucket (backward-compat slot on main row)
      let imagePath: string | null = null;
      let imageMime: string | null = null;
      let imageWidth: number | null = null;
      let imageHeight: number | null = null;

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

          if (firstImg.file.type.startsWith('image/')) {
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
      }

      // Insert main invoice row
      const { data: invoiceData, error } = await supabase
        .from('contractor_invoices')
        .insert({
          created_by: user.id,
          household_id: formData.household_id,
          category_id: formData.category_id || null,
          invoice_number: formData.invoice_number.trim() || null,
          amount: parseFloat(formData.amount) || 0,
          currency: formData.currency,
          description: formData.description,
          service_date_start: formData.service_date_start,
          service_date_end: formData.service_date_end,
          image_path: imagePath,
          image_mime: imageMime,
          image_width: imageWidth,
          image_height: imageHeight,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Dual-write all images to invoice_images table
      for (let i = 0; i < images.length; i++) {
        const imgItem = images[i];
        let uploadedPath: string;

        if (i === 0 && imagePath) {
          uploadedPath = imagePath;
        } else {
          const fileExt = imgItem.file.name.split('.').pop();
          const fileName = `${formData.household_id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(fileName, imgItem.file);

          if (uploadError) {
            console.error('Error uploading invoice image:', uploadError);
            continue;
          }
          uploadedPath = fileName;
        }

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

        await supabase.from('invoice_images').insert({
          invoice_id: invoiceData.id,
          image_path: uploadedPath,
          image_mime: imgItem.file.type,
          image_width: w,
          image_height: h,
          display_order: i,
        });
      }

      // Persist as a template if the user opted in. invoice_number is
      // intentionally never copied to the template — the next submission
      // always needs a fresh number, and a stored number would trigger
      // the duplicate-warning banner on every reuse.
      if (user && saveAsTemplate && templateName.trim()) {
        await supabase.from('transaction_templates').insert({
          owner_id: user.id,
          kind: 'invoice',
          name: templateName.trim(),
          household_id: formData.household_id || null,
          amount: parseFloat(formData.amount) || null,
          currency: formData.currency || 'USD',
          category_id: formData.category_id || null,
          description: formData.description || null,
        });
        setSaveAsTemplate(false);
        setTemplateName('');
        setTemplatesRefresh((n) => n + 1);
      }

      onSaved();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      return true;
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert(t('invoice.failedSave'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData((prev) => ({
      household_id: prev.household_id,
      category_id: '',
      invoice_number: '',
      amount: '',
      currency: 'USD',
      description: '',
      service_date_start: today(),
      service_date_end: today(),
    }));
    setImages([]);
    setScanError(null);
    setDateError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await saveInvoice();
    if (success) {
      resetForm();
      onClose();
    }
  };


  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-2xl shadow-xl min-h-screen sm:min-h-0 sm:max-h-[90vh] sm:my-4 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{t('invoice.formTitle')}</h2>
            <div className="flex items-center gap-3">
              {justSaved && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <Check className="w-4 h-4" />
                  {t('invoice.saved')}
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
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <TemplatePicker
            kind="invoice"
            refreshKey={templatesRefresh}
            onPick={(tpl) => {
              setFormData((prev) => ({
                ...prev,
                household_id: tpl.household_id ?? prev.household_id,
                category_id: tpl.category_id ?? prev.category_id,
                amount: tpl.amount != null ? tpl.amount.toFixed(2) : prev.amount,
                currency: tpl.currency || prev.currency,
                description: tpl.description ?? prev.description,
                // Intentionally NOT pre-filling invoice_number — every
                // submission needs a fresh number; copying from a template
                // would create instant duplicate-warning hits.
              }));
            }}
          />

          {/* Possible-duplicate warning — non-blocking. Match is by
              invoice_number within the chosen household; the same
              number for the same property strongly suggests a re-submit. */}
          {duplicateMatches.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">{t('invoice.dupTitle')}</p>
                <p className="text-xs text-amber-700 mt-1">{t('invoice.dupHint')}</p>
              </div>
            </div>
          )}

          {/* Property / Household */}
          <div>
            <label htmlFor="inv-household" className="block text-sm font-medium text-slate-700 mb-2">
              {t('invoice.household')}
            </label>
            <select
              id="inv-household"
              value={formData.household_id}
              onChange={(e) => setFormData({ ...formData, household_id: e.target.value, category_id: '' })}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">{t('invoice.selectHousehold')}</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          {/* Category — filtered to categories available for the selected household */}
          <div>
            <label htmlFor="inv-category" className="block text-sm font-medium text-slate-700 mb-2">
              {t('invoice.category')}
            </label>
            <select
              id="inv-category"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              disabled={!formData.household_id}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">{t('invoice.selectCategoryNone')}</option>
              {categoriesForSelectedHousehold().map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{t('invoice.categoryHint')}</p>
          </div>

          {/* Invoice # + Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="inv-number" className="block text-sm font-medium text-slate-700 mb-2">
                {t('invoice.invoiceNumberOptional')}
              </label>
              <input
                id="inv-number"
                type="text"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                placeholder={t('invoice.invoiceNumberPlaceholder')}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all font-mono"
              />
            </div>
            <div>
              <label htmlFor="inv-currency" className="block text-sm font-medium text-slate-700 mb-2">
                {t('invoice.currency')}
              </label>
              <select
                id="inv-currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="CAD">CAD</option>
                <option value="BRL">BRL</option>
              </select>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="inv-amount" className="block text-sm font-medium text-slate-700 mb-2">
              {t('invoice.amount')}
            </label>
            <input
              id="inv-amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              placeholder="0.00"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="inv-description" className="block text-sm font-medium text-slate-700 mb-2">
              {t('invoice.description')}
            </label>
            <textarea
              id="inv-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={3}
              placeholder={t('invoice.descriptionPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Service Period */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('invoice.servicePeriod')}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="inv-start" className="block text-xs text-slate-500 mb-1">
                  {t('invoice.serviceStart')}
                </label>
                <input
                  id="inv-start"
                  type="date"
                  value={formData.service_date_start}
                  onChange={(e) => {
                    setFormData({ ...formData, service_date_start: e.target.value });
                    setDateError(null);
                  }}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label htmlFor="inv-end" className="block text-xs text-slate-500 mb-1">
                  {t('invoice.serviceEnd')}
                </label>
                <input
                  id="inv-end"
                  type="date"
                  value={formData.service_date_end}
                  onChange={(e) => {
                    setFormData({ ...formData, service_date_end: e.target.value });
                    setDateError(null);
                  }}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                />
              </div>
            </div>
            {dateError && (
              <p className="mt-2 text-sm text-red-600">{dateError}</p>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('invoice.attachments')}
              {images.length > 0 && (
                <span className="ml-2 text-slate-400 font-normal">
                  ({images.length} {images.length === 1 ? t('invoice.attachedOne') : t('invoice.attachedMany')})
                </span>
              )}
            </label>

            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
              {images.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, index) => (
                      <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200">
                        <a
                          href={img.preview}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block hover:opacity-90 transition-opacity"
                          title={t('invoice.viewFull')}
                        >
                          {img.file.type === 'application/pdf' ? (
                            <div className="w-full h-32 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-500">
                              <FileText className="w-8 h-8 text-red-400" />
                              <span className="text-xs text-center px-2 truncate w-full text-center">{img.file.name}</span>
                            </div>
                          ) : (
                            <img src={img.preview} alt={`Invoice ${index + 1}`} className="w-full h-32 object-cover" />
                          )}
                        </a>
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-slate-900/70 text-white text-xs rounded-md">
                            {t('invoice.primaryBadge')}
                          </span>
                        )}
                      </div>
                    ))}
                    <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <Plus className="w-6 h-6 text-slate-400" />
                      <span className="text-xs text-slate-400 mt-1">{t('invoice.addMore')}</span>
                      <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={handleImageChange} className="hidden" />
                    </label>
                  </div>

                  {scanning && (
                    <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('invoice.scanning')}
                    </div>
                  )}

                  {scanError && (
                    <div className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3 flex items-center justify-between">
                      <span>{scanError}</span>
                      <button
                        type="button"
                        onClick={() => images.length > 0 && handleScanInvoice(images[0].file)}
                        className="ml-2 text-red-700 underline font-medium"
                      >
                        {t('common.retry')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer py-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{t('invoice.uploadLabel')}</p>
                  <p className="text-xs text-slate-400">{t('invoice.uploadHint')}</p>
                  <input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={handleImageChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <SaveAsTemplateToggle
            checked={saveAsTemplate}
            onChange={setSaveAsTemplate}
            templateName={templateName}
            onTemplateNameChange={setTemplateName}
          />

          {/* Action Buttons */}
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
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-emerald-900 hover:bg-emerald-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('invoice.submitting') : t('invoice.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
