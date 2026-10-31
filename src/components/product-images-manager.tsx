"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addProductImage,
  removeProductImage,
  reorderProductImages,
  setCoverImage,
  setImageCrop,
  setImageColor,
  setImagesReviewStatus,
  uploadProductImage,
  type ReviewStatus,
} from "@/app/admin/produtos/actions";
import { resolveImageUrl } from "@/lib/image-url";
import { croppedImageStyle, parseCrop, type ImageCrop } from "@/lib/image-crop";
import { ImageCropEditor } from "@/components/image-crop-editor";

export interface ImageRow {
  id: string;
  product_id?: string;
  storage_path: string;
  position: number;
  review_status: "pending_review" | "approved" | "hidden" | "rejected" | "replaced";
  origin: "source" | "tdp_upload";
  is_cover: boolean;
  crop: unknown;
  replaces_image_id: string | null;
  product_title?: string | null;
  /** supplier color text the photo belongs to (empty = every color) */
  color_key?: string | null;
}

const STATUS_LABEL: Record<ImageRow["review_status"], string> = {
  pending_review: "AGUARDANDO REVISÃO",
  approved: "APROVADA",
  hidden: "OCULTA",
  rejected: "REJEITADA",
  replaced: "SUBSTITUÍDA",
};

const STATUS_CLASS: Record<ImageRow["review_status"], string> = {
  pending_review: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  hidden: "bg-zinc-200 text-zinc-700",
  rejected: "bg-red-100 text-red-800",
  replaced: "bg-zinc-100 text-zinc-500",
};

/**
 * Photo review for one product (mode "product") or the cross-product
 * PENDING REVIEW queue (mode "queue"). Thumbnails, multi-select, bulk
 * APPROVE/REJECT SELECTED, per-image approve/reject/hide/reactivate,
 * cover, reorder, crop, replace (keeps SOURCE → TDP VERSION link) and
 * TDP uploads.
 */
export function ProductImagesManager({
  productId,
  images,
  mode = "product",
  colors = [],
}: {
  productId?: string;
  images: ImageRow[];
  mode?: "product" | "queue";
  /** supplier colors of the product (for the "photo of color" selector) */
  colors?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [cropping, setCropping] = useState<ImageRow | null>(null);
  const [replacing, setReplacing] = useState<ImageRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const sorted = useMemo(() => [...images].sort((a, b) => a.position - b.position), [images]);
  const active = sorted.filter((i) => i.review_status !== "rejected" && i.review_status !== "replaced");
  const archived = sorted.filter((i) => i.review_status === "rejected" || i.review_status === "replaced");
  const visible = mode === "queue" ? sorted : showArchived ? archived : active;
  const approvedCount = images.filter((i) => i.review_status === "approved").length;
  const hasCover = images.some((i) => i.is_cover);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && typeof res === "object" && "error" in res && (res as { error?: string }).error) {
          setError((res as { error: string }).error);
          return;
        }
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "A ação falhou.");
      }
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulk(status: ReviewStatus) {
    run(() => setImagesReviewStatus(Array.from(selected), status));
  }

  function move(img: ImageRow, delta: number) {
    if (!productId) return;
    const ids = active.map((i) => i.id);
    const idx = ids.indexOf(img.id);
    const target = idx + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    run(() => reorderProductImages(productId, ids));
  }

  function handleAddUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !newUrl.trim()) return;
    run(async () => {
      const res = await addProductImage(productId, newUrl, replacing?.id);
      if (res && "error" in res) return res;
      setNewUrl("");
      setReplacing(null);
    });
  }

  function handleUpload(file: File | undefined) {
    if (!file || !productId) return;
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("file", file);
    if (replacing) fd.set("replacesImageId", replacing.id);
    run(async () => {
      const res = await uploadProductImage(fd);
      if (res && "error" in res) return res;
      setReplacing(null);
    });
  }

  function saveCrop(crop: ImageCrop | null) {
    if (!cropping) return;
    const id = cropping.id;
    run(async () => {
      const res = await setImageCrop(id, crop);
      if (res && "error" in res) return res;
      setCropping(null);
    });
  }

  return (
    <div>
      {mode === "product" && (
        <div className="text-xs mb-3 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Requisitos para publicar: {approvedCount > 0 ? "✓" : "✗"} 1+ imagem aprovada · {hasCover ? "✓" : "✗"} imagem principal/capa
          </span>
          <button type="button" className="underline text-muted" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Mostrar imagens ativas" : `Mostrar rejeitadas/substituídas (${archived.length})`}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <button
          type="button"
          onClick={() => setSelected(new Set(visible.map((i) => i.id)))}
          className="border border-border px-2 py-1"
        >
          Selecionar todas
        </button>
        <button type="button" onClick={() => setSelected(new Set())} className="border border-border px-2 py-1">
          Limpar
        </button>
        <span className="text-muted">{selected.size} selecionada(s)</span>
        <button type="button" disabled={pending || selected.size === 0} onClick={() => bulk("approved")} className="btn-primary px-3 py-1 disabled:opacity-50">
          APROVAR SELECIONADAS
        </button>
        <button type="button" disabled={pending || selected.size === 0} onClick={() => bulk("rejected")} className="border border-red-600 text-red-700 px-3 py-1 disabled:opacity-50">
          REJEITAR SELECIONADAS
        </button>
        {mode === "product" && (
          <button type="button" disabled={pending || selected.size === 0} onClick={() => bulk("hidden")} className="border border-border px-3 py-1 disabled:opacity-50">
            Ocultar selecionadas
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted mb-3">{mode === "queue" ? "Nenhuma imagem aguardando revisão." : "Nenhuma foto ainda."}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          {visible.map((img, idx) => {
            const src = resolveImageUrl(img.storage_path);
            const crop = parseCrop(img.crop);
            const isSelected = selected.has(img.id);
            return (
              <div key={img.id} className={`border ${isSelected ? "border-foreground ring-2 ring-foreground" : "border-border"} text-[11px]`}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggle(img.id)}
                    className="relative block w-full aspect-[2/3] overflow-hidden bg-surface"
                    title="Selecionar"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt="" style={croppedImageStyle(crop)} /> : null}
                  </button>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(img.id)}
                    className="absolute top-1 left-1"
                    aria-label="Selecionar imagem"
                  />
                  <span className={`absolute top-1 right-1 px-1 py-0.5 font-semibold ${STATUS_CLASS[img.review_status]}`}>
                    {STATUS_LABEL[img.review_status]}
                  </span>
                  {img.is_cover && (
                    <span className="absolute bottom-1 left-1 px-1 py-0.5 bg-foreground text-background font-semibold">CAPA</span>
                  )}
                  {img.origin === "tdp_upload" && (
                    <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-background/90">
                      TDP{img.replaces_image_id ? " (versão)" : ""}
                    </span>
                  )}
                </div>
                <div className="p-1.5 flex flex-wrap gap-x-2 gap-y-1">
                  {mode === "queue" && img.product_id && (
                    <Link href={`/admin/produtos/${img.product_id}`} className="w-full truncate underline">
                      {img.product_title ?? "Produto"}
                    </Link>
                  )}
                  {img.review_status !== "approved" && img.review_status !== "replaced" && (
                    <ActionLink onClick={() => run(() => setImagesReviewStatus([img.id], "approved"))}>
                      {img.review_status === "hidden" ? "Reativar" : "Aprovar"}
                    </ActionLink>
                  )}
                  {img.review_status !== "rejected" && img.review_status !== "replaced" && (
                    <ActionLink onClick={() => run(() => setImagesReviewStatus([img.id], "rejected"))}>Rejeitar</ActionLink>
                  )}
                  {img.review_status === "approved" && (
                    <ActionLink onClick={() => run(() => setImagesReviewStatus([img.id], "hidden"))}>Ocultar</ActionLink>
                  )}
                  {img.review_status === "approved" && !img.is_cover && (
                    <ActionLink onClick={() => run(() => setCoverImage(img.id))}>Definir capa</ActionLink>
                  )}
                  {mode === "product" && colors.length > 0 && (
                    <select
                      value={img.color_key ?? ""}
                      onChange={(e) => run(() => setImageColor(img.id, e.target.value))}
                      aria-label="Cor desta foto"
                      className="w-full border border-border bg-background px-1 py-0.5"
                    >
                      <option value="">Todas as cores</option>
                      {colors.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                  {src && <ActionLink onClick={() => setCropping(img)}>Recortar</ActionLink>}
                  {src && <ActionLink onClick={() => setPreview(src)}>Ver</ActionLink>}
                  {mode === "product" && img.origin === "source" && img.review_status !== "replaced" && (
                    <ActionLink onClick={() => setReplacing(img)}>Substituir</ActionLink>
                  )}
                  {mode === "product" && !showArchived && (
                    <>
                      <ActionLink onClick={() => move(img, -1)} disabled={idx === 0}>←</ActionLink>
                      <ActionLink onClick={() => move(img, 1)} disabled={idx === visible.length - 1}>→</ActionLink>
                    </>
                  )}
                  {img.origin === "tdp_upload" && productId && (
                    <ActionLink onClick={() => run(() => removeProductImage(img.id, productId))}>Excluir</ActionLink>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === "product" && productId && (
        <div className="border border-border p-3 space-y-2 max-w-xl">
          <p className="text-xs font-medium">
            {replacing ? "Substituir por uma versão tratada pela TDP (a original fica vinculada como ORIGEM → VERSÃO TDP)" : "Adicionar imagem TDP"}
            {replacing && (
              <button type="button" onClick={() => setReplacing(null)} className="ml-2 underline text-muted">
                cancelar
              </button>
            )}
          </p>
          <form onSubmit={handleAddUrl} className="flex items-center gap-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://…/foto.jpg"
              className="flex-1 border border-border px-3 py-1.5 text-sm"
            />
            <button type="submit" disabled={pending || !newUrl.trim()} className="text-xs border border-border px-3 py-1.5 disabled:opacity-50">
              Adicionar por URL
            </button>
          </form>
          <label className="text-xs flex items-center gap-2">
            <span>ou envie um arquivo:</span>
            <input type="file" accept="image/*" disabled={pending} onChange={(e) => handleUpload(e.target.files?.[0])} />
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {cropping && (
        <ImageCropEditor
          src={resolveImageUrl(cropping.storage_path) ?? ""}
          initialCrop={parseCrop(cropping.crop)}
          saving={pending}
          onCancel={() => setCropping(null)}
          onSave={saveCrop}
        />
      )}
    </div>
  );
}

function ActionLink({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="underline hover:text-accent disabled:opacity-30">
      {children}
    </button>
  );
}
