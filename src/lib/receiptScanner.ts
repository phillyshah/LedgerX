import { pdfFirstPageToJpeg } from './pdfToImage';
import { todayDateString } from './dateUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SCAN_TIMEOUT_MS = 30_000;

/**
 * Lean receipt OCR result. Receipt extraction intentionally returns only
 * the four fields needed to pin a receipt to a transaction — itemized
 * contents, tax, tip, payment method, and amount-heuristic categories were
 * dropped (see extract-receipt edge function comment for rationale).
 *
 * Category auto-fill is owned by the vendor catalog (vendor_category_map)
 * via lookupVendorCategory in AddExpense.tsx — not by OCR guesses.
 *
 * Invoice OCR (scanInvoice) intentionally remains full-detail.
 */
export interface ReceiptData {
  vendor_name: string | null;
  total_amount: number | null;
  transaction_date: string | null;
  handwritten_notes: string | null;
}

/**
 * Builds the auto-appended notes string from OCR. With the lean schema this
 * is now just the handwritten-notes pass-through — but we keep it as a
 * function so the call site in AddExpense.tsx doesn't need to know whether
 * it's appending one field or many.
 */
export function formatReceiptNotes(data: ReceiptData): string {
  return data.handwritten_notes ? `[Handwritten] ${data.handwritten_notes}` : '';
}

/**
 * Converts a File to a base64 string (without the data URL prefix).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Sends a receipt image to the extract-receipt edge function for OCR extraction.
 * Returns structured receipt data that can auto-populate form fields.
 */
export async function scanReceipt(imageFile: File): Promise<ReceiptData> {
  // OpenAI Vision only accepts png/jpeg/gif/webp. Render PDFs to JPEG first.
  const fileForOCR = imageFile.type === 'application/pdf'
    ? await pdfFirstPageToJpeg(imageFile)
    : imageFile;
  const base64 = await fileToBase64(fileForOCR);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      // Local date, not UTC — per CLAUDE.md's date rule, this must match the
      // convention used everywhere else or the server-side plausibility check
      // is skewed by up to a day depending on the caller's UTC offset.
      body: JSON.stringify({ image: base64, today: todayDateString() }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.errors
        ? Object.entries(errorData.errors).map(([m, e]) => `${m}: ${e}`).join(' | ')
        : null;
      throw new Error(detail || errorData.error || `Receipt scan failed (${response.status})`);
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Receipt scan timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
