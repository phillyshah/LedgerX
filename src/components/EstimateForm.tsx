import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { X, Upload, Check, Plus, FileText } from 'lucide-react';
import type { BillingType } from '../types/estimate';

interface Household {
  id: string;
  name: string;
}

interface FileItem {
  file: File;
  preview: string;
  isPdf: boolean;
}

interface EstimateFormProps {
  onClose: () => void;
  onSaved: () => void;
}

// JPEG or PDF only — stricter than invoices (which accept any image).
const ACCEPT = 'image/jpeg,image/jpg,application/pdf,.jpg,.jpeg,.pdf';
function isAllowed(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'application/pdf' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.pdf')
  );
}

export function EstimateForm({ onClose, onSaved }: EstimateFormProps) {
  const { user, isContractor, isAdmin } = useAuth();
  const { t } = useT();
  useEscapeClose(onClose);

  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [billingType, setBillingType] = useState<BillingType>('total');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Full admins can file against any property; contractors are scoped to
      // households they belong to.
      let hh: Household[];
      if (isAdmin) {
        const { data } = await supabase.from('households').select('id, name').order('name');
        hh = (data || []) as Household[];
      } else {
        const { data } = await supabase
          .from('household_members')
          .select('household_id, households(id, name)')
          .eq('user_id', user.id);
        hh = (data || [])
          .map((item) => item.households)
          .filter(Boolean) as unknown as Household[];
      }
      setHouseholds(hh);
      if (hh.length === 1) setHouseholdId(hh[0].id);
    })();
  }, [user, isAdmin]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    setFileError(null);

    for (const file of Array.from(picked)) {
      if (!isAllowed(file)) {
        setFileError(t('estimate.fileTypeError'));
        continue;
      }
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const fileToUse = isPdf ? file : await compressImage(file, 2);
        const preview = isPdf
          ? ''
          : await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(fileToUse);
            });
        setFiles((prev) => [...prev, { file: fileToUse, preview, isPdf }]);
      } catch (err) {
        console.error('Error processing estimate file:', err);
        setFileError(t('estimate.fileTypeError'));
      }
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = !!householdId && !!title.trim() && files.length > 0 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setSaving(true);
    setSaveError(null);

    try {
      // Upload the first file and stash it in the legacy slot, mirroring the
      // invoice dual-write so detail views can rely on either source.
      const uploadOne = async (file: File): Promise<string | null> => {
        const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
        const path = `${householdId}/estimates/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
        if (upErr) {
          console.error('Estimate upload error:', upErr);
          return null;
        }
        return path;
      };

      const firstPath = await uploadOne(files[0].file);

      const { data: estimate, error: insErr } = await supabase
        .from('estimates')
        .insert({
          created_by: user.id,
          household_id: householdId,
          title: title.trim(),
          description: description.trim() || null,
          billing_type: billingType,
          file_path: firstPath,
          file_mime: files[0].file.type || (files[0].isPdf ? 'application/pdf' : 'image/jpeg'),
        } as never)
        .select('id')
        .single();

      if (insErr) throw insErr;
      const estimateId = (estimate as { id: string }).id;

      // Dual-write every file to estimate_attachments.
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        const path = i === 0 && firstPath ? firstPath : await uploadOne(item.file);
        if (!path) continue;
        await supabase.from('estimate_attachments').insert({
          estimate_id: estimateId,
          file_path: path,
          file_mime: item.file.type || (item.isPdf ? 'application/pdf' : 'image/jpeg'),
          display_order: i,
        } as never);
      }

      onSaved();
      setJustSaved(true);

      // Fire-and-forget: notify admins of the new estimate.
      if (!isAdmin) {
        supabase.functions.invoke('send-submission-notification', {
          body: { type: 'estimate_submitted', estimate_id: estimateId },
        }).catch(() => { /* non-critical */ });
      }

      setTimeout(() => { setJustSaved(false); onClose(); }, 600);
    } catch (err) {
      console.error('Error saving estimate:', err);
      setSaveError(t('estimate.failedSave'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-2xl shadow-xl min-h-screen sm:min-h-0 sm:max-h-[90vh] sm:my-4 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{t('estimate.formTitle')}</h2>
            <div className="flex items-center gap-3">
              {justSaved && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <Check className="w-4 h-4" />
                  {t('estimate.saved')}
                </span>
              )}
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('estimate.formSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Property / Household */}
          <div>
            <label htmlFor="est-household" className="block text-sm font-medium text-slate-700 mb-2">
              {t('estimate.household')}
            </label>
            <select
              id="est-household"
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">{t('estimate.selectHousehold')}</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="est-title" className="block text-sm font-medium text-slate-700 mb-2">
              {t('estimate.title')}
            </label>
            <input
              id="est-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={t('estimate.titlePlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="est-description" className="block text-sm font-medium text-slate-700 mb-2">
              {t('estimate.description')}
            </label>
            <textarea
              id="est-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('estimate.descriptionPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Billing Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('estimate.billingType')} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {([
                { value: 'total' as BillingType, label: t('estimate.billingTotal') },
                { value: 'labor_only' as BillingType, label: t('estimate.billingLaborOnly') },
              ]).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex-1 flex items-center gap-2.5 p-3 border rounded-xl cursor-pointer transition-all ${
                    billingType === value
                      ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingType"
                    value={value}
                    checked={billingType === value}
                    onChange={() => setBillingType(value)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    billingType === value ? 'border-emerald-600' : 'border-slate-300'
                  }`}>
                    {billingType === value && <div className="w-2 h-2 rounded-full bg-emerald-600" />}
                  </div>
                  <span className={`text-sm font-medium ${billingType === value ? 'text-emerald-900' : 'text-slate-600'}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('estimate.attachments')}
              {files.length > 0 && (
                <span className="ml-2 text-slate-400 font-normal">({files.length})</span>
              )}
            </label>

            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
              {files.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {files.map((item, index) => (
                    <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200">
                      {item.isPdf ? (
                        <div className="w-full h-32 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-500">
                          <FileText className="w-8 h-8 text-red-400" />
                          <span className="text-xs text-center px-2 truncate w-full">{item.file.name}</span>
                        </div>
                      ) : (
                        <img src={item.preview} alt={`Estimate ${index + 1}`} className="w-full h-32 object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-all">
                    <Plus className="w-6 h-6 text-slate-400" />
                    <span className="text-xs text-slate-400 mt-1">{t('estimate.addMore')}</span>
                    <input type="file" accept={ACCEPT} multiple onChange={handleFileChange} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer py-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{t('estimate.uploadLabel')}</p>
                  <p className="text-xs text-slate-400">{t('estimate.uploadHint')}</p>
                  <input type="file" accept={ACCEPT} multiple onChange={handleFileChange} className="hidden" />
                </label>
              )}
            </div>
            {fileError && <p className="mt-2 text-sm text-red-600">{fileError}</p>}
          </div>

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{saveError}</p>
            </div>
          )}

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
              disabled={!canSubmit}
              className="flex-1 py-3 px-4 bg-emerald-900 hover:bg-emerald-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('estimate.submitting') : t('estimate.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
