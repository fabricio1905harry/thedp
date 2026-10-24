"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/** Codes are translated by the client (auth.* messages), so the error follows the selected language. */
export type AuthErrorCode = "invalidCredentials" | "emailNotConfirmed" | "tooMany" | "generic" | "unavailable" | "passwordsDontMatch" | "passwordTooShort" | "linkExpired" | "resetError";

export interface LoginState {
  status: "idle" | "error";
  code?: AuthErrorCode;
}

function mapLoginError(error: { message?: string; code?: string; status?: number }): AuthErrorCode {
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "invalid_credentials" || msg.includes("invalid login credentials")) return "invalidCredentials";
  if (error.code === "email_not_confirmed" || msg.includes("not confirmed")) return "emailNotConfirmed";
  if (error.status === 429 || error.code === "over_request_rate_limit" || msg.includes("rate limit")) return "tooMany";
  return "generic";
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const locale = String(formData.get("locale") ?? "pt");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { status: "error", code: "unavailable" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", code: mapLoginError(error) };

  redirect(`/${locale}`);
}

export async function logoutAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "pt");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}

export interface ResetRequestState {
  status: "idle" | "sent" | "error";
  code?: AuthErrorCode;
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/** Sends the Supabase reset e-mail. Always answers "sent" so the form never reveals whether an account exists. */
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim();
  const locale = ["en", "es", "pt"].includes(String(formData.get("locale"))) ? String(formData.get("locale")) : "pt";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { status: "error", code: "unavailable" };
  if (!email || !email.includes("@")) return { status: "sent" };

  try {
    const supabase = await createClient();
    const origin = await siteOrigin();
    const next = encodeURIComponent(`/${locale}/redefinir-senha`);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/api/auth/callback?next=${next}` });
    if (error) {
      console.error("[auth] resetPasswordForEmail failed:", error.message);
      if (error.status === 429 || error.code === "over_email_send_rate_limit") return { status: "error", code: "tooMany" };
    }
  } catch (err) {
    console.error("[auth] resetPasswordForEmail threw:", err);
  }
  return { status: "sent" };
}

export interface NewPasswordState {
  status: "idle" | "error";
  code?: AuthErrorCode;
}

/** Sets the new password for the user signed in by the recovery link (see /api/auth/callback). */
export async function updatePassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const locale = String(formData.get("locale") ?? "pt");
  if (password.length < 8) return { status: "error", code: "passwordTooShort" };
  if (password !== confirm) return { status: "error", code: "passwordsDontMatch" };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", code: "linkExpired" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[auth] updateUser failed:", error.message);
    return { status: "error", code: "resetError" };
  }
  await supabase.auth.signOut();
  redirect(`/${locale}/login?reset=ok`);
}
