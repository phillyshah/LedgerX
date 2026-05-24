import { useState } from 'react';
import { Camera, X, Plus, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useT } from '../hooks/useT';
import { compressToMediumJpeg } from '../lib/imageCompression';

export interface WorkEvidencePhoto {
  file: File;
  preview: string;
}

interface WorkEvidenceUploaderProps {
  photos: WorkEvidencePhoto[];
  onChange: (photos: WorkEvidencePhoto[]) => void;
}

async function makePhoto(file: File): Promise<WorkEvidencePhoto> {
  const compressed = await compressToMediumJpeg(file);
  const preview = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(compressed);
  });
  return { file: compressed, preview };
}

export function WorkEvidenceUploader({ photos, onChange }: WorkEvidenceUploaderProps) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const added: WorkEvidencePhoto[] = [];
      for (const f of Array.from(files)) {
        try {
          added.push(await makePhoto(f));
        } catch {
          // Skip individual failures; the rest still go through.
        }
      }
      onChange([...photos, ...added]);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleRemove = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        <span className="inline-flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-slate-400" />
          {t('workEvidence.label')}
        </span>
        {photos.length > 0 && (
          <span className="ml-2 text-slate-400 font-normal">
            {t('workEvidence.count', { count: photos.length })}
          </span>
        )}
      </label>
      <p className="text-xs text-slate-500 mb-2">{t('workEvidence.hint')}</p>

      <div className="border-2 border-dashed border-amber-200 bg-amber-50/30 rounded-xl p-4 hover:border-amber-300 transition-all">
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p, index) => (
              <div
                key={index}
                className="relative group rounded-lg overflow-hidden border border-amber-200"
              >
                <a
                  href={p.preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:opacity-90 transition-opacity"
                  title={t('workEvidence.viewFull')}
                >
                  <img
                    src={p.preview}
                    alt={`Work evidence ${index + 1}`}
                    className="w-full h-32 object-cover"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0"
                  aria-label={t('workEvidence.remove')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-amber-200 rounded-lg cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-all">
              {busy ? (
                <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              ) : (
                <>
                  <Plus className="w-6 h-6 text-amber-500" />
                  <span className="text-xs text-amber-700 mt-1">{t('workEvidence.addMore')}</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleAdd}
                className="hidden"
                disabled={busy}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="flex-1 flex flex-col items-center cursor-pointer py-3 rounded-lg hover:bg-amber-50 transition-all">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-2">
                {busy ? (
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-amber-600" />
                )}
              </div>
              <p className="text-sm font-medium text-amber-900">{t('workEvidence.takePhoto')}</p>
              <p className="text-xs text-amber-700/70">{t('workEvidence.takePhotoHint')}</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleAdd}
                className="hidden"
                disabled={busy}
              />
            </label>
            <label className="flex-1 flex flex-col items-center cursor-pointer py-3 rounded-lg hover:bg-amber-50 transition-all">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-2">
                {busy ? (
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-amber-600" />
                )}
              </div>
              <p className="text-sm font-medium text-amber-900">{t('workEvidence.chooseFromLibrary')}</p>
              <p className="text-xs text-amber-700/70">{t('workEvidence.uploadHint')}</p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleAdd}
                className="hidden"
                disabled={busy}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
