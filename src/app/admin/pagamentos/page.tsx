import { createClient } from "@/lib/supabase/server";
import { PaymentRulesEditor } from "@/components/payment-rules-editor";
import { saveBankInstructions, saveNumericSetting } from "./actions";
import { StripeSection } from "@/components/stripe-section";

const SETTINGS = [
  { key: "bank_processing_fee_brl", label: "Taxa bancária (BRL, cobrada por pagamento via Bank Transfer)", fallback: 135 },
  { key: "reserve_markup_pct", label: "Reserve for Later Delivery — % sobre o custo do produto", fallback: 10 },
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
        <h1 className="font-serif text-2xl mb-1">Pagamentos</h1>
        <p className="text-sm text-muted">
          Hierarquia de disponibilidade: padrão do canal → exceção do cliente → exceção do pedido. A regra mais específica prevalece.
        </p>
      </div>

      <PaymentRulesEditor
        channels={channels ?? []}
        methods={methods ?? []}
        rules={(rules ?? []) as never}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">Configurações</h2>
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
              <button type="submit" className="border border-border px-3 py-1">Salvar</button>
            </form>
          );
        })}
        <form action={saveBankInstructions} className="flex flex-col gap-2 text-xs max-w-xl">
          <label className="flex flex-col">
            Instruções de Bank Transfer (transferência bancária) — exibidas ao comprador quando Bank Transfer está habilitado para o pedido
            <textarea
              name="instructions"
              rows={6}
              defaultValue={typeof settingValue.get("bank_transfer_instructions") === "string" ? (settingValue.get("bank_transfer_instructions") as string) : ""}
              placeholder={"Beneficiary: …\nBank: …\nIBAN / SWIFT: …"}
              className="border border-border px-2 py-1 font-mono"
            />
          </label>
          <button type="submit" className="border border-border px-3 py-1 self-start">Salvar instruções</button>
        </form>
        <p className="text-[11px] text-muted">
          A meta de margem agora é única e fica em Precificação (margem desejada global, por categoria ou por produto).
        </p>
        <p className="text-[11px] text-muted">
          A taxa bancária é convertida para a moeda do pedido com a taxa de câmbio vigente quando cada transferência é registrada;
          um depósito de Reserve + um saldo posterior por transferência = duas taxas.
        </p>
      </section>

      <StripeSection />
    </div>
  );
}
