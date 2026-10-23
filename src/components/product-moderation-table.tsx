"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setProductStatus, deleteProducts } from "@/app/admin/produtos/actions";
import { resolveImageUrl } from "@/lib/image-url";

interface Row {
  id: string;
  title: string;
  category: string | null;
  status: string;
  favorites?: number;
  price_brl: number | null;
  suppliers?: string[];
  imageUrl?: string | null;
}

type PendingDelete = { kind: "bulk"; ids: string[] } | { kind: "one"; id: string; title: string };

export function ProductModerationTable({ products }: { products: Row[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PendingDelete | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))
    );
  }

  function bulkSetStatus(status: "draft" | "published" | "archived") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setNotice(null);
    startTransition(async () => {
      const res = await setProductStatus(ids, status);
      if (res && "error" in res && res.error) {
        setNotice(res.error);
        return;
      }
      setSelected(new Set());
    });
  }

  function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setConfirmDelete({ kind: "bulk", ids });
  }

  function deleteOne(id: string, title: string) {
    setConfirmDelete({ kind: "one", id, title });
  }

  function runConfirmedDelete() {
    if (!confirmDelete) return;
    setNotice(null);
    if (confirmDelete.kind === "bulk") {
      const { ids } = confirmDelete;
      startTransition(async () => {
        const result = await deleteProducts(ids);
        if ("error" in result) {
          setNotice(result.error);
          return;
        }
        setSelected(new Set());
        if (result.blockedCount > 0) {
          setNotice(
            `${result.deletedCount} excluído(s). ${result.blockedCount} ignorado(s) porque já têm pedidos — arquive-os em vez disso.`
          );
        } else {
          setNotice(`${result.deletedCount} produto${result.deletedCount === 1 ? "" : "s"} excluído${result.deletedCount === 1 ? "" : "s"}.`);
        }
      });
    } else {
      const { id, title } = confirmDelete;
      startTransition(async () => {
        const result = await deleteProducts([id]);
        if ("error" in result) {
          setNotice(result.error);
          return;
        }
        if (result.blockedCount > 0) {
          setNotice(`Não é possível excluir "${title}" — já tem pedidos. Arquive-o em vez disso.`);
        }
      });
    }
    setConfirmDelete(null);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 min-h-9">
        {selected.size > 0 && (
          <>
            <span className="text-xs text-muted mr-2">{selected.size} selecionado(s)</span>
            <button
              disabled={pending}
              onClick={() => bulkSetStatus("published")}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Publicar
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSetStatus("draft")}
              className="text-xs border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Despublicar
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSetStatus("archived")}
              className="text-xs border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Arquivar
            </button>
            <button
              disabled={pending}
              onClick={bulkDelete}
              className="text-xs border border-red-600 text-red-600 px-3 py-1.5 disabled:opacity-50"
            >
              Excluir
            </button>
          </>
        )}
      </div>

      {notice && (
        <p className="text-xs text-muted mb-3 bg-surface border border-border px-3 py-2">{notice}</p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted uppercase border-b border-border">
            <th className="py-2 pr-2 w-8">
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={toggleAll}
              />
            </th>
            <th className="py-2 pr-4 w-14"></th>
            <th className="py-2 pr-4">Título</th>
            <th className="py-2 pr-4">Categoria</th>
            <th className="py-2 pr-4">Fornecedor(es)</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Preço</th>
            <th className="py-2 pr-4" title="Compradores que favoritaram">Favoritos</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
              </td>
              <td className="py-2 pr-4">
                <Link href={`/admin/produtos/${p.id}`} className="block w-10 h-10 bg-surface border border-border overflow-hidden shrink-0">
                  {resolveImageUrl(p.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImageUrl(p.imageUrl)!}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </Link>
              </td>
              <td className="py-2 pr-4">{p.title}</td>
              <td className="py-2 pr-4">{p.category}</td>
              <td className="py-2 pr-4 text-xs text-muted">
                {p.suppliers && p.suppliers.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {p.suppliers.map((s) => (
                      <span key={s} className="bg-surface border border-border px-1.5 py-0.5 font-mono text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={p.status} />
              </td>
              <td className="py-2 pr-4">
                {p.price_brl !== null ? `${p.price_brl} BRL` : "—"}
              </td>
              <td className="py-2 pr-4 text-xs">{p.favorites ? `♥ ${p.favorites}` : "—"}</td>
              <td className="py-2 text-right whitespace-nowrap">
                <Link href={`/admin/produtos/${p.id}`} className="text-xs text-accent underline mr-3">
                  Editar
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => deleteOne(p.id, p.title)}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background max-w-md w-full p-6 rounded-sm border border-border shadow-xl space-y-4">
            <h3 className="font-serif text-lg font-bold">Excluir permanentemente?</h3>
            <p className="text-sm text-muted">
              {confirmDelete.kind === "bulk"
                ? `Excluir ${confirmDelete.ids.length} produto${confirmDelete.ids.length === 1 ? "" : "s"} permanentemente? Esta ação não pode ser desfeita.`
                : `Excluir "${confirmDelete.title}" permanentemente? Esta ação não pode ser desfeita.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="text-xs border border-border px-3 py-1.5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={runConfirmedDelete}
                className="text-xs border border-red-600 text-red-600 px-3 py-1.5 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-surface text-muted",
    published: "bg-accent/10 text-accent",
    archived: "bg-surface text-muted line-through",
  };
  const labels: Record<string, string> = {
    draft: "Rascunho",
    published: "Publicado",
    archived: "Arquivado",
  };
  return (
    <span className={`text-xs px-2 py-0.5 ${styles[status] ?? ""}`}>{labels[status] ?? status}</span>
  );
}
