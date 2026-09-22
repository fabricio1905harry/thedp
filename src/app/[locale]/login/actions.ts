"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "error";
  message?: string;
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const locale = String(formData.get("locale") ?? "pt");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      status: "error",
      message: "Login ainda não disponível: banco de dados em provisionamento.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: error.message };

  redirect(`/${locale}`);
}

export async function logoutAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "pt");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}
