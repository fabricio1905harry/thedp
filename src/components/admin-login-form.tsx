"use client";

import { useActionState } from "react";
import { adminLogin, type AdminLoginState } from "@/app/admin/auth-actions";

const initialState: AdminLoginState = { status: "idle" };

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLogin, initialState);

  return (
    <form action={formAction} className="space-y-4 w-full max-w-sm">
      <div>
        <label className="block text-sm mb-1" htmlFor="admin-email">E-mail</label>
        <input id="admin-email" name="email" type="email" required autoComplete="username" className="w-full border border-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="admin-password">Senha</label>
        <input id="admin-password" name="password" type="password" required autoComplete="current-password" className="w-full border border-border px-3 py-2 text-sm" />
      </div>
      {state.status === "error" && <p className="text-sm text-accent">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
