"use server";

import { createClient } from "@/lib/supabase/server";

export interface SignUpState {
  status: "idle" | "success" | "error";
  message?: string;
}

/**
 * AUTH-01: self-service signup, but the account starts `pending` (see the
 * handle_new_customer trigger in supabase/migrations/0001_init.sql) —
 * approval is a manual admin action (AUTH-03), not automatic.
 */
export async function signUpCustomer(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const locale = String(formData.get("locale") ?? "pt");
  const customerType = String(formData.get("customerType") ?? "individual");
  const companyName = String(formData.get("companyName") ?? "");
  const taxId = String(formData.get("taxId") ?? "");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      status: "error",
      message:
        "Cadastro ainda não disponível: o banco de dados do projeto está em provisionamento.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          locale,
          customer_type: customerType,
          company_name: customerType === "business" ? companyName : null,
          tax_id: customerType === "business" ? taxId : null,
        },
      },
    });

    if (error) return { status: "error", message: error.message };
    return { status: "success" };
  } catch {
    return {
      status: "error",
      message: "Erro inesperado ao criar o cadastro. Tente novamente.",
    };
  }
}
