const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface ReceiptData {
  vendor_name: string | null;
  total_amount: number | null;
  transaction_date: string | null;
  category: string | null;
  handwritten_notes: string | null;
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
  const base64 = await fileToBase64(imageFile);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ image: base64 }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Receipt scan failed (${response.status})`);
  }

  return response.json();
}
