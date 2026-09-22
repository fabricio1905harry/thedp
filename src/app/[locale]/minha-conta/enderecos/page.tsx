import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddressList } from "@/components/address-list";
import { AddressForm } from "@/components/address-form";

export default async function AddressesPage() {
  const t = await getTranslations("address");
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");

  const supabase = await createClient();
  const { data: addresses } = await supabase
    .from("addresses")
    .select("id, country, state, city, line1, line2, postal_code, phone")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-8">{t("title")}</h1>
      <AddressList addresses={addresses ?? []} />
      <h2 className="text-sm font-medium mb-4 uppercase tracking-wide">{t("addTitle")}</h2>
      <AddressForm />
    </div>
  );
}
