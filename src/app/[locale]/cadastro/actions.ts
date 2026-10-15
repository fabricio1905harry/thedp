"use server";

import { createClient } from "@/lib/supabase/server";

export interface SignUpState {
  status: "idle" | "success" | "error";
  message?: string;
}

const text = (formData: FormData, key: string, max = 500) => String(formData.get(key) ?? "").trim().slice(0, max);

/**
 * Wholesale application: self-service signup, but the account starts
 * `pending` (handle_new_customer trigger) — the TDP approves, rejects or
 * asks for more information in Admin → Contas wholesale.
 */
export async function signUpCustomer(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const email = text(formData, "email", 200);
  const password = String(formData.get("password") ?? "");
  const name = text(formData, "name", 200);
  const companyName = text(formData, "companyName", 200);
  const companyAddress = text(formData, "companyAddress", 600);
  const deliveryAddress = text(formData, "deliveryAddress", 600) || companyAddress;
  const phone = text(formData, "phone", 60);
  const businessType = text(formData, "businessType", 80);

  if (!email || !name || !companyName || !companyAddress || !phone || !businessType || password.length < 8) {
    return { status: "error", message: "Please fill in all required fields (password: at least 8 characters)." };
  }
  if (formData.get("applicantConfirmed") !== "on") {
    return { status: "error", message: "Please confirm that you are applying as a business/retailer." };
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { status: "error", message: "Sign-up is not available yet." };
  }

  const physical = text(formData, "hasPhysicalStore", 10);
  const storeCount = Number(formData.get("storeCount"));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          locale: text(formData, "locale", 8) || "en",
          customer_type: "business",
          company_name: companyName,
          tax_id: text(formData, "taxId", 80) || null,
          company_address: companyAddress,
          delivery_address: deliveryAddress,
          website: text(formData, "website", 300) || null,
          instagram: text(formData, "instagram", 120) || null,
          phone,
          business_type: businessType,
          has_physical_store: physical === "true" || physical === "false" ? physical : null,
          store_count: Number.isFinite(storeCount) && storeCount >= 0 && formData.get("storeCount") ? String(Math.floor(storeCount)) : null,
          brands_carried: text(formData, "brandsCarried", 500) || null,
          application_message: text(formData, "applicationMessage", 2000) || null,
          referral_code: text(formData, "referralCode", 120) || null,
          applicant_confirmed: "true",
        },
      },
    });

    if (error) return { status: "error", message: error.message };
    return { status: "success" };
  } catch {
    return { status: "error", message: "Unexpected error while creating the account. Please try again." };
  }
}
