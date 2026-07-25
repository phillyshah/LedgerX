import { supabase } from './supabase';
import { readImageDimensions } from './imagePicker';

export interface ReuploadedImage {
  path: string;
  mime: string;
  width: number | null;
  height: number | null;
}

/**
 * Move a pending email-inbox item's attachments into the household-scoped
 * receipts prefix, ready to be written as expense_images rows.
 *
 * Postgres can't move bytes between storage prefixes, so the client has to
 * download and re-upload before calling match_inbox_item_to_line_item — the
 * RPC only writes the resulting DB rows. This mirrors AddExpense.tsx's own
 * email-inbox-to-expense path.
 *
 * Failures are skipped rather than thrown: one unreadable attachment shouldn't
 * block the receipt itself from being filed. `.html` bodies are excluded — the
 * inbound pipeline synthesizes those for body-only emails and they aren't
 * images.
 *
 * Extracted from StatementReconcile so the per-statement flow and the global
 * Auto Reconcile grid share one implementation.
 */
export async function reuploadInboxImages(
  paths: string[],
  householdId: string,
): Promise<ReuploadedImage[]> {
  const usable = paths.filter((p) => !/\.html?$/i.test(p));
  const images: ReuploadedImage[] = [];
  for (const p of usable) {
    const { data, error: downloadError } = await supabase.storage.from('receipts').download(p);
    if (downloadError || !data) continue;
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
    const fileName = `${householdId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);
    if (uploadError) continue;
    const preview = URL.createObjectURL(file);
    const { width, height } = await readImageDimensions({ file, preview });
    images.push({ path: fileName, mime, width, height });
  }
  return images;
}
