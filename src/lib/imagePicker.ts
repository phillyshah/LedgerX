import { compressImage } from './imageCompression';
import type { ImageItem } from '../types/expense';

export async function prepareImageItem(file: File): Promise<ImageItem> {
  const fileToUse = file.type.startsWith('image/')
    ? await compressImage(file, 2)
    : file;
  const preview = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(fileToUse);
  });
  return { file: fileToUse, preview };
}

export async function readImageDimensions(
  item: ImageItem,
): Promise<{ width: number | null; height: number | null }> {
  if (!item.file.type.startsWith('image/')) return { width: null, height: null };
  const img = new Image();
  img.src = item.preview;
  // Resolve on error too — a preview that fails to decode must not hang the
  // caller's save loop. On failure width/height are 0, which the optional
  // image_width/image_height columns tolerate.
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  return { width: img.width || null, height: img.height || null };
}
