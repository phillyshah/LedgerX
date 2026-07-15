import { pdfAllPagesToJpeg } from './pdfToImage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SCAN_TIMEOUT_MS = 60_000;

export interface StatementLineItemOCR {
  date: string | null;
  description: string | null;
  amount: number | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Sends a statement PDF or image to the extract-statement edge function for
 * OCR extraction of every line item. PDFs are rasterized to one JPEG per
 * page (capped at 10) and sent together in one request so the model can
 * correlate line items that straddle a page break.
 */
export async function scanStatement(file: File): Promise<StatementLineItemOCR[]> {
  const pages = file.type === 'application/pdf'
    ? await pdfAllPagesToJpeg(file)
    : [file];

  const images = await Promise.all(pages.map(fileToBase64));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-statement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ images }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.errors
        ? Object.entries(errorData.errors).map(([m, e]) => `${m}: ${e}`).join(' | ')
        : null;
      throw new Error(detail || errorData.error || `Statement scan failed (${response.status})`);
    }

    const data = await response.json();
    return data.line_items ?? [];
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Statement scan timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
