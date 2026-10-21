"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChannelPaymentDefault, setCustomerPaymentRule } from "@/app/admin/pagamentos/actions";

interface Rule {
  scope: string;
  channel_code: string | null;
  customer_id: string | null;
  method_code: string;
  enabled: boolean;
  customers?: { email: string; company_name: string | null } | null;
}

export function PaymentRulesEditor({
  channels,
  methods,
  rules,
}: {
  channels: { code: string; name: string }[];
  methods: { code: string; name: string }[];
  rules: Rule[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const [value, setValue] = useState("on");

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha");
      }
    });
  };

  const channelRule = (ch: string, m: string) =>
    rules.find((r) => r.scope === "channel" && r.channel_code === ch && r.method_code === m)?.enabled ?? false;
  const customerRules = rules.filter((r) => r.scope === "customer");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide mb-2">1. Padrões por canal</h2>
        <table className="text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="pr-4 py-1">Canal</th>
              {methods.map((m) => <th key={m.code} className="pr-4 py-1">{m.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.code}>
                <td className="pr-4 py-1">{ch.name}</td>
                {methods.map((m) => (
                  <td key={m.code} className="pr-4 py-1">
                    <input
                      type="checkbox"
                      checked={channelRule(ch.code, m.code)}
                      disabled={pending}
                      onChange={(e) => run(() => setChannelPaymentDefault(ch.code, m.code, e.target.checked))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide mb-2">2. Exceções por cliente</h2>
        <form
          className="flex flex-wrap items-end gap-2 text-xs mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setCustomerPaymentRule(email, method, value === "inherit" ? null : value === "on"));
          }}
        >
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail do cliente" className="border border-border px-2 py-1" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="border border-border px-2 py-1">
            {methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
          <select value={value} onChange={(e) => setValue(e.target.value)} className="border border-border px-2 py-1">
            <option value="on">Permitir</option>
            <option value="off">Bloquear</option>
            <option value="inherit">Remover exceção</option>
          </select>
          <button type="submit" disabled={pending} className="border border-border px-3 py-1">Salvar</button>
        </form>
        {customerRules.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma exceção por cliente.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {customerRules.map((r) => (
              <li key={`${r.customer_id}-${r.method_code}`}>
                {r.customers?.company_name || r.customers?.email} — {methods.find((m) => m.code === r.method_code)?.name}:{" "}
                <strong>{r.enabled ? "permitido" : "bloqueado"}</strong>{" "}
                <button type="button" className="underline" onClick={() => r.customers && run(() => setCustomerPaymentRule(r.customers!.email, r.method_code, null))}>
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted">3. As exceções por pedido são definidas na página de cada pedido (Formas de pagamento deste pedido).</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
