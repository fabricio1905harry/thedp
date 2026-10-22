"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInvoiceTemplate } from "@/app/admin/invoice/actions";
import type { InvoiceTemplate } from "@/lib/invoice";

const FIELDS: { key: keyof InvoiceTemplate; label: string; area?: boolean; hint?: string }[] = [
  { key: "company_name", label: "Nome da empresa (remetente)" },
  { key: "company_tax_id", label: "CNPJ / Tax ID" },
  { key: "company_address", label: "Endereço" },
  { key: "company_city", label: "Cidade" },
  { key: "company_postal_code", label: "CEP" },
  { key: "company_country_code", label: "País (2 letras, ex.: BR)" },
  { key: "company_email", label: "E-mail" },
  { key: "company_phone", label: "Telefone" },
  { key: "origin_country", label: "País de origem das mercadorias" },
  { key: "number_prefix", label: "Prefixo da numeração", hint: "Ex.: INV → INV-2026-0001 (sequência reinicia a cada ano)" },
  { key: "bank_details", label: "Dados bancários", area: true },
  { key: "notes", label: "Observações", area: true },
  { key: "footer", label: "Rodapé", area: true },
];

export function InvoiceTemplateForm({ initial }: { initial: InvoiceTemplate }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<InvoiceTemplate>(initial);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveInvoiceTemplate(values);
      setMessage({ error: Boolean(result.error), text: result.error ?? result.info ?? "OK" });
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="border border-border p-4 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className={`text-xs space-y-1 ${f.area ? "md:col-span-2" : ""}`}>
            <span className="text-muted">{f.label}</span>
            {f.area ? (
              <textarea value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} rows={3} className="w-full border border-border px-2 py-1.5 text-sm" />
            ) : (
              <input value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className="w-full border border-border px-2 py-1.5 text-sm" />
            )}
            {f.hint && <span className="block text-[11px] text-muted">{f.hint}</span>}
          </label>
        ))}
      </div>
      <button type="button" disabled={pending} onClick={save} className="bg-foreground text-background text-xs px-4 py-2 disabled:opacity-40">
        Salvar
      </button>
      {message && <p className={`text-xs ${message.error ? "text-red-700" : ""}`}>{message.text}</p>}
    </div>
  );
}
