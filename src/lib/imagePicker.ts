import { compressImage } from './imageCompression';
import type { ImageItem } from '../types/expense';

// Compress (if image), then read into a data URL preview.
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

// Reads natural width/height from an image data URL. Returns nulls for non-images.
export async function readImageDimensions(item: ImageItem): Promise<{ width: number | null; height: number | null }> {
  if (!item.file.type.startsWith('image/')) return { width: null, height: null };
  const img = new Image();
  img.src = item.preview;
  await new Promise((resolve) => {
    img.onload = () => resolve(null);
  });
  return { width: img.width, height: img.height };
}
