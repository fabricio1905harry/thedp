import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RecoverCart } from "@/components/recover-cart";

/**
 * Link from the abandoned-cart e-mails: restores the saved cart into the
 * browser cart and sends the buyer to /carrinho. The token is a random UUID
 * that only exists in the e-mail sent to the cart's owner.
 */
export default async function RecoverCartPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getTranslations("postpay");
  const uuid = /^[0-9a-f-]{36}$/i.test(token ?? "") ? token! : null;

  let items: Record<string, unknown>[] = [];
  if (uuid) {
    const supabase = createServiceRoleClient();
    const { data: cart } = await supabase.from("carts").select("id, status").eq("recovery_token", uuid).maybeSingle();
    if (cart && cart.status === "active") {
      const { data } = await supabase.from("cart_items").select("qty, snapshot").eq("cart_id", cart.id);
      items = (data ?? []).map((row) => ({ ...(row.snapshot as Record<string, unknown>), qty: row.qty }));
      await supabase.from("carts").update({ recovery_clicked_at: new Date().toISOString() }).eq("id", cart.id);
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-serif text-2xl">{t("recoverUnavailableTitle")}</h1>
        <p className="text-sm text-muted">{t("recoverUnavailableText")}</p>
        <Link href="/carrinho" className="inline-block underline text-sm">
          {t("recoverGoCart")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
      <h1 className="font-serif text-2xl">{t("recoverRestoring")}</h1>
      <RecoverCart items={items} />
    </div>
  );
}
