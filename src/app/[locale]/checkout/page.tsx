import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckoutPanel } from "@/components/checkout-panel";

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");

  const supabase = await createClient();
  const { data: addresses } = await supabase
    .from("addresses")
    .select("id, country, city, line1, postal_code")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 lg:py-16 space-y-6">
      <div className="border-b border-border pb-4">
        <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-semibold">
          Finalização do Pedido Internacional
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-normal text-foreground">
          Checkout & Frete DHL Express
        </h1>
      </div>

      <CheckoutPanel addresses={addresses ?? []} />
    </div>
  );
}
