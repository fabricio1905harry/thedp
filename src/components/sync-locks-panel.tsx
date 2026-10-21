"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetFieldsToSource } from "@/app/admin/produtos/actions";
import { SYNCABLE_FIELD_LABELS, isSyncableField } from "@/lib/product-sync";

/** Fields edited by the TDP and therefore protected from supplier syncs. */
export function SyncLocksPanel({
  productId,
  lockedFields,
  lastSyncedAt,
  sourceSnapshot,
}: {
  productId: string;
  lockedFields: string[];
  lastSyncedAt: string | null;
  sourceSnapshot: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fields = lockedFields.filter(isSyncableField);

  function reset(target: string[]) {
    setError(null);
    startTransition(async () => {
      try {
        await resetFieldsToSource(productId, target);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao restaurar.");
      }
    });
  }

  return (
    <div className="border border-border p-3 mb-8 max-w-3xl text-xs">
      <p className="font-medium uppercase tracking-wide mb-1">Sincronização com fornecedor</p>
      <p className="text-muted mb-2">
        Última sincronização: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString("pt-BR") : "nunca"}. Campos editados
        manualmente ficam protegidos das próximas sincronizações; os demais continuam sincronizando.
      </p>
      {fields.length === 0 ? (
        <p className="text-muted">Nenhum campo protegido — tudo segue o fornecedor.</p>
      ) : (
        <ul className="space-y-1">
          {fields.map((field) => (
            <li key={field} className="flex items-center gap-2">
              <span>🔒 {SYNCABLE_FIELD_LABELS[field]}</span>
              <span className="text-muted truncate max-w-xs">
                fornecedor: {sourceSnapshot && field in sourceSnapshot ? JSON.stringify(sourceSnapshot[field]) : "—"}
              </span>
              <button type="button" disabled={pending} onClick={() => reset([field])} className="underline">
                Restaurar do fornecedor
              </button>
            </li>
          ))}
          {fields.length > 1 && (
            <li>
              <button type="button" disabled={pending} onClick={() => reset(fields)} className="underline font-medium">
                Restaurar tudo do fornecedor
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <p className="text-red-600 mt-2">{error}</p>}
    </div>
  );
}
