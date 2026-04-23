import type { InvoiceOCRData } from '../types/invoice';

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
  const base64 = await fileToBase64(imageFile);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ image: base64 }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.errors
      ? Object.entries(errorData.errors).map(([m, e]) => `${m}: ${e}`).join(' | ')
      : null;
    throw new Error(detail || errorData.error || `Invoice scan failed (${response.status})`);
  }

  return response.json();
}
