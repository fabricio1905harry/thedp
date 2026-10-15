import { createClient } from "@/lib/supabase/server";
import { PaymentRulesEditor } from "@/components/payment-rules-editor";
import { saveBankInstructions, saveNumericSetting } from "./actions";

const SETTINGS = [
  { key: "bank_processing_fee_brl", label: "Bank Processing Fee (BRL, charged per Bank Transfer payment)", fallback: 135 },
  { key: "reserve_markup_pct", label: "Reserve for Later Delivery — % over product cost", fallback: 10 },
  { key: "margin_target_pct", label: "Margin target % (below → Action Center). Empty = off", fallback: null },
] as const;

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const [{ data: channels }, { data: methods }, { data: rules }, { data: settings }] = await Promise.all([
    supabase.from("sales_channels").select("code, name").order("sort"),
    supabase.from("payment_methods").select("code, name").eq("active", true).order("sort"),
    supabase
      .from("payment_method_rules")
      .select("scope, channel_code, customer_id, method_code, enabled, customers!payment_method_rules_customer_id_fkey ( email, company_name )")
      .in("scope", ["channel", "customer"]),
    supabase.from("app_settings").select("key, value"),
  ]);
  const settingValue = new Map((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl mb-1">Payments</h1>
        <p className="text-sm text-muted">
          Availability hierarchy: channel default → customer exception → order exception. The most specific rule wins.
        </p>
      </div>

      <PaymentRulesEditor
        channels={channels ?? []}
        methods={methods ?? []}
        rules={(rules ?? []) as never}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">Settings</h2>
        {SETTINGS.map((s) => {
          const current = settingValue.get(s.key);
          return (
            <form key={s.key} action={saveNumericSetting.bind(null, s.key)} className="flex flex-wrap items-end gap-2 text-xs">
              <label className="flex flex-col">
                {s.label}
                <input
                  name="value"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={current === null || current === undefined ? (s.fallback ?? "") : String(current)}
                  className="border border-border px-2 py-1 w-40"
                />
              </label>
              <button type="submit" className="border border-border px-3 py-1">Save</button>
            </form>
          );
        })}
        <form action={saveBankInstructions} className="flex flex-col gap-2 text-xs max-w-xl">
          <label className="flex flex-col">
            Bank transfer instructions (shown to the buyer when Bank Transfer is enabled for the order)
            <textarea
              name="instructions"
              rows={6}
              defaultValue={typeof settingValue.get("bank_transfer_instructions") === "string" ? (settingValue.get("bank_transfer_instructions") as string) : ""}
              placeholder={"Beneficiary: …\nBank: …\nIBAN / SWIFT: …"}
              className="border border-border px-2 py-1 font-mono"
            />
          </label>
          <button type="submit" className="border border-border px-3 py-1 self-start">Save instructions</button>
        </form>
        <p className="text-[11px] text-muted">
          The bank fee is converted to the order currency with the current FX rate when each transfer is registered;
          a Reserve deposit + a later balance by transfer = two fees.
        </p>
      </section>

      <section className="space-y-2 text-xs max-w-2xl">
        <h2 className="text-sm font-medium uppercase tracking-wide">Stripe (card)</h2>
        <p className="text-muted">
          Card payments are taken on the <strong>site</strong> deployment. There, set <code>STRIPE_SECRET_KEY</code> and{" "}
          <code>STRIPE_WEBHOOK_SECRET</code>, and create a Stripe webhook pointing to{" "}
          <code>https://&lt;site&gt;/api/stripe/webhook</code> (events: checkout.session.completed,
          checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.created). Then enable Stripe per
          channel above, per customer, or per order (order page → “Enable Stripe for this order”). A paid card payment
          marks the order PAID automatically.
        </p>
      </section>
    </div>
  );
}
