"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AdminLoginState {
  status: "idle" | "error";
  message?: string;
}

/**
 * Admin sign-in, independent from the storefront login (the admin runs on
 * its own domain, so it needs its own session). Only operator/admin
 * accounts are let in; any other account is signed straight back out.
 */
export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { status: "error", message: "Banco de dados não configurado." };
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { status: "error", message: "E-mail ou senha inválidos." };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (customer?.role !== "operator" && customer?.role !== "admin") {
    await supabase.auth.signOut();
    return { status: "error", message: "Esta conta não tem acesso ao painel." };
  }

  redirect("/admin");
}

export async function adminLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin");
}

export interface AdminResetState {
  status: "idle" | "sent" | "error";
  message?: string;
}

/** Origin of THIS deployment (the admin has its own domain, so the link must come back here). */
async function adminOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/**
 * "Esqueci minha senha" of the panel: sends the Supabase recovery e-mail whose link comes back through
 * /api/auth/callback and lands on /admin/redefinir-senha. Always answers "sent", so the form never reveals
 * whether an e-mail has an account (only operator/admin accounts can use the panel after the reset anyway).
 */
export async function adminRequestPasswordReset(_prev: AdminResetState, formData: FormData): Promise<AdminResetState> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { status: "error", message: "Banco de dados não configurado." };
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) return { status: "sent" };
  try {
    const supabase = await createClient();
    const origin = await adminOrigin();
    const next = encodeURIComponent("/admin/redefinir-senha");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/api/auth/callback?next=${next}` });
    if (error) {
      console.error("[admin/auth] resetPasswordForEmail failed:", error.message);
      if (error.status === 429 || error.code === "over_email_send_rate_limit") {
        return { status: "error", message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
      }
    }
  } catch (err) {
    console.error("[admin/auth] resetPasswordForEmail threw:", err);
  }
  return { status: "sent" };
}

export interface AdminNewPasswordState {
  status: "idle" | "error";
  message?: string;
}

/** Sets the new password for the user signed in by the recovery link, then goes back to the panel. */
export async function adminUpdatePassword(_prev: AdminNewPasswordState, formData: FormData): Promise<AdminNewPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { status: "error", message: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { status: "error", message: "As senhas não são iguais." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "O link expirou. Peça um novo link na tela de login." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[admin/auth] updateUser failed:", error.message);
    return { status: "error", message: "Não foi possível salvar a nova senha. Tente de novo ou peça um novo link." };
  }
  redirect("/admin");
}
