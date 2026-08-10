import type { InvoiceOCRData } from '../types/invoice';
import { pdfFirstPageToJpeg } from './pdfToImage';
import { forceOcrYear } from './ocrYearFix';
import { todayDateString } from './dateUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
 * Sends an invoice image/PDF to the extract-invoice edge function for OCR extraction.
 * Returns structured invoice data that can auto-populate form fields.
 */
export async function scanInvoice(imageFile: File): Promise<InvoiceOCRData> {
  // OpenAI Vision only accepts png/jpeg/gif/webp. Render PDFs to JPEG first.
  const fileForOCR = imageFile.type === 'application/pdf'
    ? await pdfFirstPageToJpeg(imageFile)
    : imageFile;
  const base64 = await fileToBase64(fileForOCR);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    // Local date, not UTC — matches extract-receipt's convention so the
    // server-side year guard isn't skewed by the caller's UTC offset.
    body: JSON.stringify({ image: base64, today: todayDateString() }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.errors
      ? Object.entries(errorData.errors).map(([m, e]) => `${m}: ${e}`).join(' | ')
      : null;
    throw new Error(detail || errorData.error || `Invoice scan failed (${response.status})`);
  }

  const data: InvoiceOCRData = await response.json();

  // Every date on an invoice gets the 2023→2026 rule. due_date opts out of
  // the "don't invent a future date" guard — an invoice due next month is
  // perfectly normal, unlike a receipt dated next month.
  return {
    ...data,
    invoice_date: forceOcrYear(data.invoice_date),
    due_date: forceOcrYear(data.due_date, { allowFuture: true }),
    service_date_start: forceOcrYear(data.service_date_start),
    service_date_end: forceOcrYear(data.service_date_end),
  };
}
