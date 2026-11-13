"use client";

import { useActionState } from "react";
import { adminUpdatePassword, type AdminNewPasswordState } from "@/app/admin/auth-actions";

const initial: AdminNewPasswordState = { status: "idle" };
const input = "w-full border border-border px-3 py-2 text-sm";

export function AdminNewPasswordForm() {
  const [state, formAction, pending] = useActionState(adminUpdatePassword, initial);
  return (
    <form action={formAction} className="space-y-4 w-full">
      <div>
        <label className="block text-sm mb-1" htmlFor="new-password">Nova senha</label>
        <input id="new-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        <p className="text-[11px] text-muted mt-1">Mínimo de 8 caracteres.</p>
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="confirm-password">Repita a nova senha</label>
        <input id="confirm-password" name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </div>
      {state.status === "error" && <p role="alert" className="text-sm text-accent">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
        {pending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
