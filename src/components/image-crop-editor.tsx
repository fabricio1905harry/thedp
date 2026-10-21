"use client";

import { useState } from "react";
import { cropFromControls, croppedImageStyle, type ImageCrop } from "@/lib/image-crop";

/**
 * Manual 2:3 framing. Starts from the largest 2:3 window that fits the
 * photo; zoom + pan only ever move that window inside the image, so the
 * result is always 2:3 and nothing is cropped without a person choosing it.
 */
export function ImageCropEditor({
  src,
  initialCrop,
  onSave,
  onCancel,
  saving,
}: {
  src: string;
  initialCrop: ImageCrop | null;
  onSave: (crop: ImageCrop | null) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0.5);
  const [panY, setPanY] = useState(0.5);
  const [touched, setTouched] = useState(false);

  // keep showing the saved crop until a control is moved
  const crop = !touched && initialCrop ? initialCrop : natural ? cropFromControls(natural.w, natural.h, zoom, panX, panY) : null;
  const lowRes = natural && crop ? natural.w * crop.width < 1200 || natural.h * crop.height < 1800 : false;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-background max-w-3xl w-full p-5 grid md:grid-cols-2 gap-6 max-h-[95vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs text-muted uppercase mb-2">Original</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="w-full max-h-[60vh] object-contain bg-surface"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {natural && (
            <p className="text-[11px] text-muted mt-1">
              {natural.w}×{natural.h}px
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted uppercase mb-2">Resultado 2:3 (referência 1200×1800)</p>
          <div className="relative overflow-hidden aspect-[2/3] bg-surface border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" style={croppedImageStyle(crop)} />
          </div>
          {lowRes && (
            <p className="text-[11px] text-accent mt-1">
              Abaixo de 1200×1800 neste zoom — considere um arquivo de maior resolução.
            </p>
          )}
          <div className="space-y-2 mt-3 text-xs">
            <label className="flex items-center gap-2">
              <span className="w-12">Zoom</span>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => { setTouched(true); setZoom(Number(e.target.value)); }} className="flex-1" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-12">Esq./dir.</span>
              <input type="range" min={0} max={1} step={0.005} value={panX} onChange={(e) => { setTouched(true); setPanX(Number(e.target.value)); }} className="flex-1" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-12">Cima/baixo</span>
              <input type="range" min={0} max={1} step={0.005} value={panY} onChange={(e) => { setTouched(true); setPanY(Number(e.target.value)); }} className="flex-1" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" disabled={!crop || saving} onClick={() => crop && onSave(crop)} className="btn-primary px-3 py-1.5 text-xs">
              Salvar recorte
            </button>
            <button type="button" disabled={saving} onClick={() => onSave(null)} className="border border-border px-3 py-1.5 text-xs">
              Sem recorte (mostrar foto inteira)
            </button>
            <button type="button" onClick={onCancel} className="text-xs text-muted px-2">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
