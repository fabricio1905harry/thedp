"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProductImage, removeProductImage } from "@/app/admin/produtos/actions";
import { resolveImageUrl } from "@/lib/image-url";

interface ImageRow {
  id: string;
  storage_path: string;
  position: number;
}

export function ProductImagesManager({
  productId,
  images,
}: {
  productId: string;
  images: ImageRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const sorted = [...images].sort((a, b) => a.position - b.position);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const url = newUrl.trim();
    if (!url) return;
    startTransition(async () => {
      try {
        await addProductImage(productId, url);
        setNewUrl("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add image.");
      }
    });
  }

  function handleRemove(imageId: string) {
    setError(null);
    setRemovingId(imageId);
    startTransition(async () => {
      try {
        await removeProductImage(imageId, productId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove image.");
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted mb-3">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
          {sorted.map((img) => {
            const src = resolveImageUrl(img.storage_path);
            return (
              <div key={img.id} className="relative group">
                <button
                  type="button"
                  onClick={() => src && setPreview(src)}
                  className="block w-full aspect-square bg-surface border border-border overflow-hidden"
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={pending && removingId === img.id}
                  onClick={() => handleRemove(img.id)}
                  className="absolute top-1 right-1 bg-black/70 text-white text-[10px] w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  title="Remove photo"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://…/photo.jpg"
          className="flex-1 max-w-sm border border-border px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !newUrl.trim()}
          className="text-xs border border-border px-3 py-1.5 disabled:opacity-50"
        >
          Add photo
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {preview && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
