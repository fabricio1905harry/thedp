"use client";

import { useActionState } from "react";
import type { FxQuote } from "@/lib/fx";
import { setUsdRate, setEurRate, type SetFxRateState } from "@/app/admin/cambio/actions";

const initialState: SetFxRateState = { status: "idle" };

export function FxRateField({
  quote,
  currentRate,
  fetchedAt,
  updatedByEmail,
  stale,
}: {
  quote: FxQuote;
  currentRate: number | null;
  fetchedAt: string | null;
  updatedByEmail: string | null;
  stale: boolean;
}) {
  const action = quote === "USD" ? setUsdRate : setEurRate;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className={`border p-5 rounded-md max-w-md ${stale ? "border-amber-400 bg-amber-50/20" : "border-border"}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">
          Cotação {quote} <span className="text-xs font-normal text-muted">(BRL por {quote})</span>
        </h3>
        {stale && (
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
            Desatualizado
          </span>
        )}
      </div>

      {stale && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded">
          ⚠️ <strong>Alerta:</strong> Esta cotação não é atualizada há mais de 3 dias. Atualize o valor manualmente para manter os preços internacionais corretos.
        </div>
      )}

      {currentRate === null ? (
        <p className="text-xs text-muted mb-4">Ainda não configurada — {quote} estará oculto para os compradores.</p>
      ) : (
        <div className="text-xs text-muted mb-4 space-y-1">
          <p>
            Cotação atual: <span className="font-semibold text-foreground text-sm">{currentRate.toFixed(4)}</span> BRL
          </p>
          <p>
            Última atualização: {fetchedAt ? new Date(fetchedAt).toLocaleString("pt-BR") : "—"}
            {updatedByEmail ? ` por ${updatedByEmail}` : ""}
          </p>
        </div>
      )}

      <form action={formAction} className="flex gap-2 items-center">
        <input
          type="number"
          name="rate"
          step="0.0001"
          min="0.0001"
          required
          placeholder={currentRate?.toString() ?? "Ex: 5.2000"}
          className="flex-1 border border-border px-3 py-2 text-sm rounded bg-background"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-accent text-white px-4 py-2 text-sm font-medium rounded disabled:opacity-50 hover:bg-accent/90 transition-colors"
        >
          {pending ? "Salvando..." : "Salvar Cotação"}
        </button>
      </form>
      {state.status === "error" && (
        <p className="text-xs text-accent font-medium mt-2">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-xs text-emerald-600 font-medium mt-2">Cotação atualizada com sucesso!</p>
      )}
    </div>
  );
}
