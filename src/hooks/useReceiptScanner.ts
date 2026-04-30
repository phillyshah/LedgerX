import { useState } from 'react';
import { compressImage } from '../lib/imageCompression';
import { scanReceipt, formatReceiptNotes, ReceiptData } from '../lib/receiptScanner';

interface FormFields {
  vendor: string;
  total: string;
  expense_date: string;
  notes: string;
  category?: string;
}

// Merges OCR results into the existing form, preserving any fields the user already filled.
// `setFormData` is the React state setter from the consuming component; this works for both
// AddExpense (which has a `category` field) and EditExpense (which doesn't auto-fill category).
export function applyReceiptDataToForm<T extends FormFields>(
  setFormData: (updater: (prev: T) => T) => void,
  data: ReceiptData,
): void {
  const enhanced = formatReceiptNotes(data);
  setFormData((prev) => ({
    ...prev,
    vendor: data.vendor_name || prev.vendor,
    total: data.total_amount != null ? data.total_amount.toFixed(2) : prev.total,
    expense_date: data.transaction_date || prev.expense_date,
    notes: enhanced
      ? prev.notes ? `${prev.notes}\n${enhanced}` : enhanced
      : prev.notes,
  }));
}

export function useReceiptScanner() {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Compresses images for upload, but passes PDFs through (scanReceipt
  // rasterizes them via pdfFirstPageToJpeg before hitting the model).
  const scan = async (file: File): Promise<ReceiptData | null> => {
    setScanning(true);
    setScanError(null);
    try {
      // OpenAI uses detail:"low" → 512px internal — send a smaller copy to cut upload time.
      const ocrFile = file.type.startsWith('image/')
        ? await compressImage(file, 0.3, 800, 800)
        : file;
      return await scanReceipt(ocrFile);
    } catch (error) {
      console.error('Receipt scan error:', error);
      setScanError(error instanceof Error ? error.message : 'Failed to scan receipt');
      return null;
    } finally {
      setScanning(false);
    }
  };

  return { scanning, scanError, setScanError, scan };
}
