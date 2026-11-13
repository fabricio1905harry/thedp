"use client";

import { useActionState, useState } from "react";
import { saveWhatsAppSettings, type WhatsAppSaveState } from "@/app/admin/whatsapp/actions";
import type { WhatsAppSettings } from "@/lib/whatsapp";

const KINDS = [
  ["general", "Geral (qualquer página)", ""],
  ["product", "Página de produto", "Use {product} (nome + código) e {url}."],
  ["order", "Páginas de pedido", "Use {order} para o número do pedido."],
] as const;

const initial: WhatsAppSaveState = { status: "idle" };

/** "5511999999999" → "+55 11 99999-9999" (Brazil); other countries: "+<digits>". */
export function formatWhatsApp(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (!d) return "";
  const br = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return `+${d}`;
}

export function WhatsAppSettingsForm({ settings }: { settings: WhatsAppSettings }) {
  const [state, formAction, pending] = useActionState(saveWhatsAppSettings, initial);
  const [number, setNumber] = useState(settings.number);
  const [active, setActive] = useState(settings.active);
  const digits = number.replace(/\D/g, "");
  const valid = digits.length >= 10 && digits.length <= 15;

  return (
    <form action={formAction} className="space-y-5 text-sm">
      <section className="border border-border p-4 space-y-3 bg-white">
        <h2 className="text-xs font-semibold uppercase tracking-wide">Número do WhatsApp da TDP</h2>
        <p className="text-[12px] text-muted">
          É o único lugar para trocar o número: vale para o botão flutuante, o rodapé, a página de Contato e a ajuda “fale com nossa
          equipe” da página de produto.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 w-64">
            <span className="text-xs">Número com código do país e DDD</span>
            <input
              name="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="55 11 99999-9999"
              inputMode="tel"
              autoComplete="off"
              className={`border px-2 py-1.5 ${digits && !valid ? "border-red-600" : "border-border"}`}
            />
          </label>
          {digits && valid && (
            <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="border border-foreground px-3 py-1.5 text-xs">
              Testar no WhatsApp ↗
            </a>
          )}
        </div>
        <p className="text-[12px]">
          {!digits ? (
            <span className="text-muted">Sem número, o WhatsApp não aparece no site.</span>
          ) : valid ? (
            <>No site: <strong>{formatWhatsApp(digits)}</strong></>
          ) : (
            <span className="text-red-700">Número incompleto: use código do país + DDD + número (ex.: 55 11 99999-9999).</span>
          )}
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Mostrar o botão flutuante do WhatsApp no site (desktop e celular)
        </label>
      </section>

      <p className="text-xs text-muted">Mensagens que já vêm escritas quando o visitante clica (no idioma do site):</p>
      {KINDS.map(([kind, label, hint]) => (
        <fieldset key={kind} className="border border-border p-3 space-y-2">
          <legend className="text-xs font-medium uppercase px-1">{label}</legend>
          {hint && <p className="text-[11px] text-muted">{hint}</p>}
          {(["en", "es", "pt"] as const).map((loc) => (
            <label key={loc} className="flex flex-col text-xs">
              {loc.toUpperCase()}
              <textarea name={`${kind}_${loc}`} defaultValue={settings.messages[kind][loc]} rows={2} className="border border-border px-2 py-1" />
            </label>
          ))}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-background py-3">
        <button type="submit" disabled={pending || Boolean(digits && !valid)} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {state.status !== "idle" && (
          <span role="status" className={`text-xs ${state.status === "error" ? "text-red-700" : "text-emerald-800"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
