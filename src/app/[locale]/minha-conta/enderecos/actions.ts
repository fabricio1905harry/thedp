"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AddressInput {
  country: string;
  state: string;
  city: string;
  line1: string;
  line2: string;
  postalCode: string;
  phone: string;
}

async function requireCustomerId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, customerId: user.id };
}

/** INT-09: address collection for international shipping. */
export async function addAddress(input: AddressInput) {
  const { supabase, customerId } = await requireCustomerId();
  const { error } = await supabase.from("addresses").insert({
    customer_id: customerId,
    country: input.country,
    state: input.state || null,
    city: input.city || null,
    line1: input.line1,
    line2: input.line2 || null,
    postal_code: input.postalCode || null,
    phone: input.phone || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/minha-conta/enderecos");
}

export async function deleteAddress(addressId: string) {
  const { supabase } = await requireCustomerId();
  const { error } = await supabase.from("addresses").delete().eq("id", addressId);
  if (error) throw new Error(error.message);
  revalidatePath("/minha-conta/enderecos");
}
