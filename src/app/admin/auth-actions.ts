"use server";

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
