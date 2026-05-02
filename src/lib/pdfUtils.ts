import { jsPDF } from 'jspdf';

export type CompressedImage = { dataUrl: string; width: number; height: number };

/**
 * Compress a raw image Blob to a small JPEG and return the data URL plus
 * pixel dimensions. jsPDF v4 ignores the w/h params when passed an
 * HTMLImageElement (it uses natural px size instead), so callers must pass
 * the data URL string and compute mm dimensions from these pixel values.
 */
export const compressForPDF = (blob: Blob): Promise<CompressedImage> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const MAX = 600;
      let { width, height } = img;
      const r = Math.min(MAX / width, MAX / height, 1);
      width = Math.round(width * r);
      height = Math.round(height * r);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.65), width, height });
    };
    img.onerror = reject;
    img.src = url;
  });

/**
 * Render a compressed image into a fixed mm bounding box maintaining aspect
 * ratio. Centered within the box.
 */
export function addImageToPDF(
  pdf: jsPDF,
  img: CompressedImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
) {
  const aspect = img.width / img.height;
  let renderW = boxW;
  let renderH = boxW / aspect;
  if (renderH > boxH) { renderH = boxH; renderW = boxH * aspect; }
  pdf.addImage(
    img.dataUrl, 'JPEG',
    boxX + (boxW - renderW) / 2,
    boxY + (boxH - renderH) / 2,
    renderW, renderH,
  );
}

/** Writes the standard "Transaction Report / Period:" header and returns the next Y. */
export function addReportHeader(pdf: jsPDF, startDate: string, endDate: string, margin = 20): number {
  pdf.setFontSize(16);
  pdf.text('Transaction Report', margin, margin);
  pdf.setFontSize(9);
  pdf.text(`Period: ${startDate} to ${endDate}`, margin, margin + 10);
  return margin + 20;
}

/** Standard 2-column grid constants for A4 PDFs. Returns cell dimensions given the Y where content starts. */
export function pdfGridLayout(
  pageWidth: number,
  pageHeight: number,
  margin: number,
  contentStartY: number,
) {
  const cols = 2;
  const rows = 2;
  const colGap = 6;
  const rowGap = 4;
  const cellWidth = (pageWidth - 2 * margin - colGap) / cols;
  const cellHeight = (pageHeight - margin - contentStartY - rowGap) / rows;
  return { cols, rows, colGap, rowGap, cellWidth, cellHeight, maxPerPage: cols * rows };
}
