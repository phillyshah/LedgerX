/**
 * Converts the first page of a PDF File into a JPEG File suitable for
 * the OpenAI Vision API, which only accepts png/jpeg/gif/webp — not PDF.
 *
 * pdfjs-dist is dynamically imported so it (and its worker) only ships
 * in a lazy chunk that downloads when a contractor actually uploads a
 * PDF invoice or receipt. The main bundle stays slim.
 */
// Cached Blob URL for the pdfjs worker. We fetch the worker file once, wrap it
// in a Blob with an explicit `application/javascript` MIME type, and use the
// resulting blob: URL as the worker source. This sidesteps hosts (like nginx
// without a types entry for .mjs) that serve ES modules with the wrong MIME
// and trigger "Failed to fetch dynamically imported module" in the browser.
let cachedWorkerBlobUrl: string | null = null;

async function getWorkerBlobUrl(): Promise<string> {
  if (cachedWorkerBlobUrl) return cachedWorkerBlobUrl;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - worker module resolution handled by Vite
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const res = await fetch(workerUrl);
  if (!res.ok) throw new Error(`Failed to load PDF worker: ${res.status}`);
  const code = await res.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  cachedWorkerBlobUrl = URL.createObjectURL(blob);
  return cachedWorkerBlobUrl;
}

export async function pdfFirstPageToJpeg(pdfFile: File, maxDim = 1600): Promise<File> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = await getWorkerBlobUrl();

  const buf = await pdfFile.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);

  // Pick a scale that caps the longer dimension at maxDim for a reasonable
  // OCR image size without blowing up memory on huge invoices.
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxDim / baseViewport.width, maxDim / baseViewport.height, 2.5);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context for PDF render');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      'image/jpeg',
      0.85
    );
  });

  const baseName = pdfFile.name.replace(/\.pdf$/i, '') || 'invoice';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
