import { useState } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  // Tailwind class for the scrollable viewport. Defaults to a smaller height for inline previews.
  containerClassName?: string;
  onClose?: () => void;
}

export function ZoomableImage({ src, alt = 'Image', containerClassName = 'max-h-64 overflow-auto', onClose }: ZoomableImageProps) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="relative">
      <div className="flex items-center justify-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          className="px-2 py-1 bg-emerald-900 text-white rounded-lg"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          className="px-2 py-1 bg-emerald-900 text-white rounded-lg"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => { setZoom(1); onClose?.(); }}
          className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg"
          title={onClose ? 'Close zoom' : 'Reset zoom'}
        >
          {onClose ? 'close' : 'reset'}
        </button>
      </div>
      <div
        className={containerClassName}
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom((z) => Math.min(3, Math.max(0.5, z + (e.deltaY < 0 ? 0.1 : -0.1))));
          }
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            width: '100%',
            height: 'auto',
          }}
          className="block mx-auto rounded-lg"
        />
      </div>
    </div>
  );
}
