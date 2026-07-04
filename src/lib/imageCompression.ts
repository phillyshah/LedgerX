/**
 * Compresses an image file to ensure it doesn't exceed the maximum size.
 * Preserves the original MIME type unless `outputMime` is passed.
 */
export async function compressImage(
  file: File,
  maxSizeMB: number = 0.8,
  maxWidth: number = 1200,
  maxHeight: number = 1200,
  outputMime?: string,
  initialQuality?: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const mime = outputMime ?? file.type;
        let quality = initialQuality ?? 0.9;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;

        // When converting from another format to JPEG, swap the file
        // extension so storage MIME-sniffing stays consistent with the
        // bytes we just produced.
        const targetName =
          outputMime === 'image/jpeg'
            ? file.name.replace(/\.[^.]+$/, '') + '.jpg'
            : file.name;

        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              if (blob.size <= maxSizeBytes || quality <= 0.1) {
                const compressedFile = new File([blob], targetName, {
                  type: mime,
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                quality -= 0.1;
                tryCompress();
              }
            },
            mime,
            quality
          );
        };

        tryCompress();
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress a work-evidence photo: contractor work-in-progress shots that
 * don't need OCR fidelity. Forces JPEG output (smaller than PNG) at a
 * medium quality level — good enough to verify the work is done but cheap
 * on storage. Tuned to ~0.4MB / 1280px / 0.75 quality.
 */
export async function compressToMediumJpeg(file: File): Promise<File> {
  // Non-image files (PDFs, HEIC the browser can't decode, etc.) pass
  // through unchanged so the caller can still upload them as-is.
  if (!file.type.startsWith('image/')) return file;
  return compressImage(file, 0.4, 1280, 1280, 'image/jpeg', 0.75);
}

/**
 * Compress a *document* photo — receipts, invoices, estimates. These need the
 * text to stay legible, so we keep more resolution than work-evidence: a 1600px
 * longest edge renders a full letter-size page at ~150–190 DPI (fine print
 * stays readable), JPEG quality 0.8 avoids artifacts on text edges, and the
 * ~0.6MB cap trims a raw multi-MB phone photo by roughly 80%. HEIC/PNG are
 * re-encoded to JPEG for a further size win; PDFs and anything non-image pass
 * through untouched (they're never rasterized for storage).
 */
export async function compressToDocumentJpeg(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return compressImage(file, 0.6, 1600, 1600, 'image/jpeg', 0.8);
}
