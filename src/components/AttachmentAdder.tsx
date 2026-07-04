import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useT } from '../hooks/useT';
import { compressToDocumentJpeg } from '../lib/imageCompression';

interface AttachmentAdderProps {
  /** Which record type the photos attach to. */
  kind: 'invoice' | 'estimate';
  /** The parent record id (contractor_invoices.id / estimates.id). */
  recordId: string;
  /** Household the record belongs to — drives the storage folder + RLS. May be
   *  null for unscoped records (then only admins can upload, per storage RLS). */
  householdId: string | null;
  /** Display order to start numbering the newly-added rows from (current count). */
  nextOrder: number;
  /** Called after all selected files are uploaded so the host can refresh. */
  onUploaded: () => void;
}

/** Read pixel dimensions off a (compressed) image File; null for non-images. */
async function readDims(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith('image/')) return { width: null, height: null };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    return { width: img.width || null, height: img.height || null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * "Add photos" control for an existing invoice/estimate detail view. Anyone who
 * can view the record (creator, admins, household members) can attach more
 * photos — RLS (migration 20260714000000) is the real gate. Images are shrunk
 * with the document preset before upload; PDFs pass through untouched.
 */
export function AttachmentAdder({ kind, recordId, householdId, nextOrder, onUploaded }: AttachmentAdderProps) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    setUploading(true);
    setError(null);

    let anyFailed = false;
    let order = nextOrder;

    for (const raw of Array.from(picked)) {
      try {
        const file = await compressToDocumentJpeg(raw);
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const base = kind === 'estimate'
          ? `${householdId}/estimates`
          : `${householdId}`;
        const path = `${base}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
        if (upErr) { anyFailed = true; continue; }

        const { width, height } = await readDims(file);

        const insert = kind === 'invoice'
          ? supabase.from('invoice_images').insert({
              invoice_id: recordId,
              image_path: path,
              image_mime: file.type,
              image_width: width,
              image_height: height,
              display_order: order,
              is_work_evidence: false,
            })
          : supabase.from('estimate_attachments').insert({
              estimate_id: recordId,
              file_path: path,
              file_mime: file.type,
              file_width: width,
              file_height: height,
              display_order: order,
            });

        const { error: insErr } = await insert;
        if (insErr) {
          // The row didn't persist — clean up the orphaned upload so we don't
          // leave a dangling object nobody references.
          await supabase.storage.from('receipts').remove([path]).catch(() => {});
          anyFailed = true;
          continue;
        }
        order += 1;
      } catch {
        anyFailed = true;
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    if (anyFailed) setError(t('attach.error'));
    if (order > nextOrder) onUploaded();
  };

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={handleFiles}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all disabled:opacity-60"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        {uploading ? t('attach.uploading') : t('attach.addPhotos')}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
