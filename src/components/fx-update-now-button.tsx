"use client";

import { useActionState } from "react";
import { updateFxNow, type SetFxRateState } from "@/app/admin/cambio/actions";

const initialState: SetFxRateState = { status: "idle" };

export function FxUpdateNowButton() {
  const [state, action, pending] = useActionState(updateFxNow, initialState);
  return (
    <form action={action} className="flex items-center gap-3 mb-6">
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm font-medium">
        {pending ? "Atualizando..." : "UPDATE FX NOW"}
      </button>
      {state.status === "success" && <span className="text-xs">Atualizado: {state.message}</span>}
      {state.status === "error" && <span className="text-xs text-accent">Falhou: {state.message}</span>}
    </form>
  );
}
