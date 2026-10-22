import { createClient } from "@/lib/supabase/server";
import { DEFAULT_INVOICE_TEMPLATE, type InvoiceTemplate } from "@/lib/invoice";
import { InvoiceTemplateForm } from "@/components/invoice-template-form";

export default async function InvoiceSettingsPage() {
  const supabase = await createClient();
  const [{ data: setting }, { data: counters }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "invoice_template").maybeSingle(),
    supabase.from("invoice_counters").select("year, last_number").order("year", { ascending: false }).limit(5),
  ]);
  const initial = { ...DEFAULT_INVOICE_TEMPLATE, ...((setting?.value ?? {}) as Partial<InvoiceTemplate>) };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Configurações da invoice</h1>
        <p className="text-sm text-muted">
          Dados da empresa, dados bancários e observações usados no PDF da commercial invoice. O modelo final do cliente ainda está pendente: o layout lê tudo daqui. Os dados do remetente também alimentam o envio DHL.
        </p>
      </div>
      <InvoiceTemplateForm initial={initial} />
      <section className="border border-border p-4 text-xs">
        <h2 className="uppercase tracking-wider text-muted mb-1">Numeração</h2>
        {(counters ?? []).length === 0 ? (
          <p className="text-muted">Nenhuma invoice emitida ainda.</p>
        ) : (
          <ul>
            {(counters ?? []).map((c) => (
              <li key={c.year}>
                {c.year}: última emitida nº {c.last_number}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
