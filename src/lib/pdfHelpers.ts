import type { jsPDF } from 'jspdf';
import { supabase } from './supabase';

// Title + period header, returns the next available Y. Used by both PDF exports.
export function addReportHeader(pdf: jsPDF, startDate: string, endDate: string, margin = 20): number {
  pdf.setFontSize(16);
  pdf.text('Transaction Report', margin, margin);
  pdf.setFontSize(9);
  pdf.text(`Period: ${startDate} to ${endDate}`, margin, margin + 10);
  return margin + 20;
}

// Download a receipt from storage and decode it to an HTMLImageElement.
// Caller is responsible for revoking the object URL after pdf.addImage.
export async function loadStorageImage(path: string): Promise<{ img: HTMLImageElement; objectUrl: string } | null> {
  const { data } = await supabase.storage.from('receipts').download(path);
  if (!data) return null;

  const objectUrl = URL.createObjectURL(data);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = objectUrl;
  });
  return { img, objectUrl };
}

export function imageFormatFromMime(mime: string | null): 'PNG' | 'WEBP' | 'JPEG' {
  if (!mime) return 'JPEG';
  if (mime.includes('png')) return 'PNG';
  if (mime.includes('webp')) return 'WEBP';
  return 'JPEG';
}
