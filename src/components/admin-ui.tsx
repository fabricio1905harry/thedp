"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadCmsAsset } from "@/app/admin/conteudo/actions";
import { normalizeImageUrl } from "@/lib/image-url";

/**
 * Small admin building blocks for the catalog phase 2 screens (pt-BR).
 * Server actions return `{ error?: string }`; `useRun` shows it inline
 * (production Next hides thrown messages, so actions never throw).
 */

export type ActionResult = { error?: string; ok?: boolean; id?: string } | void;

export function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function run(fn: () => Promise<ActionResult>, okText = "Salvo.", after?: (r: ActionResult) => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && res.error) {
          setMessage({ text: res.error, error: true });
          return;
        }
        setMessage({ text: okText, error: false });
        after?.(res);
        router.refresh();
      } catch {
        setMessage({ text: "A ação falhou. Tente novamente.", error: true });
      }
    });
  }
  return { pending, message, run, setMessage };
}

export function Msg({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return (
    <p role="status" className={`text-xs ${message.error ? "text-red-600" : "text-green-700"}`}>
      {message.text}
    </p>
  );
}

export const inputCls = "w-full border border-border px-2 py-1.5 text-sm rounded-sm";
export const btnCls =
  "bg-foreground text-background px-4 py-2 text-xs uppercase tracking-wide font-medium rounded-sm disabled:opacity-50";
export const btnGhost = "border border-border px-3 py-1.5 text-xs rounded-sm hover:bg-surface disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block mt-1 text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export type Loc = { en?: string; es?: string; pt?: string };

/** EN (master) / ES / PT inputs. */
export function LocalizedInput({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: Loc;
  onChange: (v: Loc) => void;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      {(["en", "es", "pt"] as const).map((l) => (
        <div key={l} className="flex items-start gap-2">
          <span className="w-16 shrink-0 pt-1.5 text-[11px] text-muted">{l === "en" ? "EN (principal)" : l.toUpperCase()}</span>
          {multiline ? (
            <textarea rows={3} value={value[l] ?? ""} onChange={(e) => onChange({ ...value, [l]: e.target.value })} className={inputCls} />
          ) : (
            <input value={value[l] ?? ""} onChange={(e) => onChange({ ...value, [l]: e.target.value })} className={inputCls} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Image by URL / Google Drive link / uploaded file. */
export function ImageInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = normalizeImageUrl(value, 400);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadCmsAsset(fd);
    setUploading(false);
    if (res.url) onChange(res.url);
    else setError(res.error ?? "Falha no envio.");
  }

  return (
    <div className="text-xs">
      <p className="font-medium">{label}</p>
      <div className="mt-1 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[14rem] space-y-1">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… ou link do Google Drive" className={inputCls} />
          <label className="text-[11px] flex items-center gap-2">
            <span className="underline cursor-pointer">{uploading ? "Enviando…" : "Enviar um arquivo"}</span>
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" referrerPolicy="no-referrer" className="h-16 w-auto border border-border object-contain bg-background" />
        )}
      </div>
    </div>
  );
}

export interface PickOption {
  id: string;
  label: string;
  sub?: string;
}

/** Search + pick products; the selected list keeps its order (up/down/remove). */
export function ProductPicker({
  options,
  value,
  onChange,
  ordered = true,
}: {
  options: PickOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  ordered?: boolean;
}) {
  const [q, setQ] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const term = q.trim().toLowerCase();
  const results = term
    ? options.filter((o) => !value.includes(o.id) && `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(term)).slice(0, 12)
    : [];

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-2 text-xs">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto por título ou slug…" className={inputCls} />
      {results.length > 0 && (
        <ul className="border border-border divide-y divide-border bg-background max-h-56 overflow-auto">
          {results.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => { onChange([...value, o.id]); setQ(""); }} className="w-full text-left px-2 py-1.5 hover:bg-surface">
                {o.label} <span className="text-muted">{o.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length === 0 ? (
        <p className="text-muted">Nenhum produto selecionado.</p>
      ) : (
        <ul className="space-y-1">
          {value.map((id, i) => (
            <li key={id} className="flex items-center gap-2 border border-border bg-background px-2 py-1">
              <span className="flex-1 truncate">{byId.get(id)?.label ?? id} <span className="text-muted">{byId.get(id)?.sub}</span></span>
              {ordered && (
                <>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" className="px-1 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Descer" className="px-1 disabled:opacity-30">↓</button>
                </>
              )}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label="Remover" className="px-1 text-red-600">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
