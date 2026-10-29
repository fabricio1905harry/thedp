"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCustomerStatus } from "@/app/admin/clientes/actions";

export interface Applicant {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  status: string;
  company_name: string | null;
  tax_id: string | null;
  company_address: string | null;
  delivery_address: string | null;
  website: string | null;
  instagram: string | null;
  phone: string | null;
  business_type: string | null;
  has_physical_store: boolean | null;
  store_count: number | null;
  brands_carried: string | null;
  application_message: string | null;
  referral_code: string | null;
  review_note: string | null;
  locale: string | null;
}

export function CustomerApprovalRow({ customer }: { customer: Applicant }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(customer.review_note ?? "");
  const [asking, setAsking] = useState(false);

  const run = (status: "approved" | "rejected" | "more_info") => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setCustomerStatus(customer.id, status, note);
        if (res?.emailNote) setError(res.emailNote);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha na ação.");
      }
    });
  };

  const details: [string, string | null][] = [
    ["Comprador", customer.name],
    ["E-mail", customer.email],
    ["WhatsApp / Telefone", customer.phone],
    ["Tipo de negócio", customer.business_type],
    ["CNPJ / nº de registro fiscal", customer.tax_id],
    ["Endereço da empresa", customer.company_address],
    ["Endereço de entrega", customer.delivery_address],
    ["Website", customer.website],
    ["Instagram", customer.instagram],
    ["Loja física", customer.has_physical_store === null ? null : customer.has_physical_store ? "Sim" : "Não"],
    ["Número de lojas", customer.store_count === null ? null : String(customer.store_count)],
    ["Marcas trabalhadas", customer.brands_carried],
    ["Indicado por (nome/código do representante)", customer.referral_code],
    ["Idioma", customer.locale?.toUpperCase() ?? null],
    ["Mensagem", customer.application_message],
  ];

  return (
    <div className="border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium">{customer.company_name || customer.name || customer.email}</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 ${customer.status === "more_info" ? "bg-amber-100 text-amber-900" : "bg-surface border border-border"}`}>
          {customer.status === "more_info" ? "AGUARDANDO MAIS INFORMAÇÕES" : "PENDENTE"}
        </span>
        <span className="text-xs text-muted">{new Date(customer.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
      </div>

      <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-xs">
        {details
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-muted shrink-0">{k}:</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
      </dl>

      {(asking || customer.status === "more_info") && (
        <label className="block text-xs">
          Informações solicitadas ao candidato (enviadas por e-mail)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full border border-border px-2 py-1" />
        </label>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <button disabled={pending} onClick={() => run("approved")} className="btn-primary px-3 py-1.5">APROVAR</button>
        <button disabled={pending} onClick={() => run("rejected")} className="border border-border px-3 py-1.5 disabled:opacity-50">REJEITAR</button>
        {asking || customer.status === "more_info" ? (
          <button disabled={pending} onClick={() => run("more_info")} className="border border-foreground px-3 py-1.5 font-medium disabled:opacity-50">
            ENVIAR SOLICITAÇÃO DE MAIS INFORMAÇÕES
          </button>
        ) : (
          <button disabled={pending} onClick={() => setAsking(true)} className="border border-border px-3 py-1.5 disabled:opacity-50">
            SOLICITAR MAIS INFORMAÇÕES
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
