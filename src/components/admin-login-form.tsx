"use client";

import { useActionState, useState } from "react";
import { adminLogin, adminRequestPasswordReset, type AdminLoginState, type AdminResetState } from "@/app/admin/auth-actions";

const loginInitial: AdminLoginState = { status: "idle" };
const resetInitial: AdminResetState = { status: "idle" };
const input = "w-full border border-border px-3 py-2 text-sm";

export function AdminLoginForm() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  return mode === "login" ? <LoginForm onForgot={() => setMode("reset")} /> : <ResetRequestForm onBack={() => setMode("login")} />;
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const [state, formAction, pending] = useActionState(adminLogin, loginInitial);
  return (
    <form action={formAction} className="space-y-4 w-full max-w-sm">
      <div>
        <label className="block text-sm mb-1" htmlFor="admin-email">E-mail</label>
        <input id="admin-email" name="email" type="email" required autoComplete="username" className={input} />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="admin-password">Senha</label>
        <input id="admin-password" name="password" type="password" required autoComplete="current-password" className={input} />
      </div>
      {state.status === "error" && <p className="text-sm text-accent">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <button type="button" onClick={onForgot} className="block w-full text-center text-xs text-muted underline hover:text-foreground">
        Esqueci minha senha
      </button>
    </form>
  );
}

function ResetRequestForm({ onBack }: { onBack: () => void }) {
  const [state, formAction, pending] = useActionState(adminRequestPasswordReset, resetInitial);
  if (state.status === "sent") {
    return (
      <div className="space-y-4 w-full max-w-sm">
        <p role="status" className="text-sm">
          Se este e-mail tiver uma conta, enviamos um link para criar uma nova senha. Verifique a caixa de entrada (e o spam).
        </p>
        <button type="button" onClick={onBack} className="text-xs text-muted underline hover:text-foreground">
          Voltar ao login
        </button>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-4 w-full max-w-sm">
      <p className="text-sm text-muted">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
      <div>
        <label className="block text-sm mb-1" htmlFor="admin-reset-email">E-mail</label>
        <input id="admin-reset-email" name="email" type="email" required autoComplete="username" className={input} />
      </div>
      {state.status === "error" && <p className="text-sm text-accent">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
        {pending ? "Enviando..." : "Enviar link"}
      </button>
      <button type="button" onClick={onBack} className="block w-full text-center text-xs text-muted underline hover:text-foreground">
        Voltar ao login
      </button>
    </form>
  );
}
