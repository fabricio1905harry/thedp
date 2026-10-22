"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  moveCmsBlock,
  resetCmsBlock,
  saveCmsBlock,
  toggleCmsBlock,
  uploadCmsAsset,
} from "@/app/admin/conteudo/actions";
import { CMS_LOCALES, OPERATIONS, type CmsScope, type FieldDef } from "@/lib/cms-types";
import { normalizeImageUrl } from "@/lib/image-url";

type Content = Record<string, unknown>;

export interface EditorBlock {
  scope: CmsScope;
  key: string;
  label: string;
  description?: string;
  fields: FieldDef[];
  content: Content;
  active: boolean;
  operations: string[];
  customised: boolean;
  placement: boolean;
  partner: string;
  placementStart: string;
  placementEnd: string;
  isFirst: boolean;
  isLast: boolean;
}

const LOCALE_LABEL: Record<string, string> = { en: "EN (principal)", es: "ES", pt: "PT" };

export function CmsBlockEditor({ block }: { block: EditorBlock }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<Content>(block.content);
  const [operations, setOperations] = useState<string[]>(block.operations);
  const [partner, setPartner] = useState(block.partner);
  const [placementStart, setPlacementStart] = useState(block.placementStart);
  const [placementEnd, setPlacementEnd] = useState(block.placementEnd);
  const [message, setMessage] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, ok?: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && typeof res === "object" && "error" in res && (res as { error?: string }).error) {
          setMessage((res as { error: string }).error);
          return;
        }
        if (ok) setMessage(ok);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "A ação falhou.");
      }
    });
  }

  return (
    <div className={`border ${block.active ? "border-border" : "border-dashed border-border opacity-75"}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-col">
          <button type="button" disabled={pending || block.isFirst} onClick={() => run(() => moveCmsBlock(block.scope, block.key, "up"))} className="text-xs leading-none disabled:opacity-20" aria-label="Subir">▲</button>
          <button type="button" disabled={pending || block.isLast} onClick={() => run(() => moveCmsBlock(block.scope, block.key, "down"))} className="text-xs leading-none disabled:opacity-20" aria-label="Descer">▼</button>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-medium">{block.label}</p>
          <p className="text-[11px] text-muted">
            {message && !open && <span className="text-red-700 font-medium mr-2">{message}</span>}
            {block.customised ? "Personalizado" : "Conteúdo padrão"} · {block.operations.length === OPERATIONS.length ? "todas as operações" : block.operations.join(", ") || "nenhuma operação"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={block.active}
            disabled={pending}
            onChange={(e) => run(() => toggleCmsBlock(block.scope, block.key, e.target.checked))}
          />
          {block.active ? "Ligado" : "Desligado"}
        </label>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs border border-border px-3 py-1">
          {open ? "Fechar" : "Editar"}
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-4 bg-surface/40">
          {block.description && <p className="text-xs text-muted max-w-3xl">{block.description}</p>}

          <div>
            <p className="text-xs font-medium mb-1">Visível em</p>
            <div className="flex flex-wrap gap-4 text-xs">
              {OPERATIONS.map((op) => (
                <label key={op.code} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={operations.includes(op.code)}
                    onChange={(e) =>
                      setOperations((prev) => (e.target.checked ? [...prev, op.code] : prev.filter((c) => c !== op.code)))
                    }
                  />
                  {op.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {block.fields.map((field) => (
              <FieldEditor
                key={field.key}
                field={field}
                value={content[field.key]}
                onChange={(v) => setContent((c) => ({ ...c, [field.key]: v }))}
                disabled={pending}
              />
            ))}
          </div>

          {block.placement && (
            <div className="grid sm:grid-cols-3 gap-3 text-xs border-t border-border pt-3">
              <label className="flex flex-col">
                Marca / parceiro comercial (posição paga)
                <input value={partner} onChange={(e) => setPartner(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <label className="flex flex-col">
                Data de início
                <input type="date" value={placementStart} onChange={(e) => setPlacementStart(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <label className="flex flex-col">
                Data de término
                <input type="date" value={placementEnd} onChange={(e) => setPlacementEnd(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <p className="sm:col-span-3 text-muted">
                Quando a data de término passar, só esta posição na Home é encerrada — produtos, marcas e páginas continuam ativos.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    saveCmsBlock(block.scope, block.key, {
                      active: block.active,
                      operations,
                      content,
                      partner,
                      placementStart,
                      placementEnd,
                    }),
                  "Salvo."
                )
              }
              className="btn-primary px-4 py-1.5 text-xs"
            >
              Salvar
            </button>
            {block.customised && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("Restaurar o conteúdo e o estado padrão deste bloco?")) {
                    run(async () => {
                      await resetCmsBlock(block.scope, block.key);
                      setOpen(false);
                    });
                  }
                }}
                className="text-xs underline"
              >
                Restaurar padrão
              </button>
            )}
            {message && <span className="text-xs">{message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const label = (
    <span className="block text-xs font-medium mb-1">
      {field.label}
      {field.hint && <span className="font-normal text-muted"> — {field.hint}</span>}
    </span>
  );

  if (field.kind === "list") {
    const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
    const update = (next: Record<string, unknown>[]) => onChange(next);
    return (
      <div>
        {label}
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="border border-border bg-background p-3 space-y-3">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>
                  {field.itemLabel ?? "Item"} {idx + 1}
                </span>
                <span className="space-x-3">
                  <button type="button" disabled={idx === 0} onClick={() => { const n = [...items]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; update(n); }} className="underline disabled:opacity-30">Subir</button>
                  <button type="button" disabled={idx === items.length - 1} onClick={() => { const n = [...items]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; update(n); }} className="underline disabled:opacity-30">Descer</button>
                  <button type="button" onClick={() => update(items.filter((_, i) => i !== idx))} className="underline text-red-700">Remover</button>
                </span>
              </div>
              {(field.itemFields ?? []).map((sub) => (
                <FieldEditor
                  key={sub.key}
                  field={sub}
                  value={item[sub.key]}
                  disabled={disabled}
                  onChange={(v) => { const n = [...items]; n[idx] = { ...item, [sub.key]: v }; update(n); }}
                />
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() => update([...items, Object.fromEntries((field.itemFields ?? []).map((f) => [f.key, f.translatable ? { en: "", es: "", pt: "" } : ""]))])}
            className="text-xs border border-border px-3 py-1"
          >
            + Adicionar {(field.itemLabel ?? "item").toLowerCase()}
          </button>
        </div>
      </div>
    );
  }

  if (field.translatable) {
    const v = (value && typeof value === "object" ? value : {}) as Record<string, string>;
    const Input = field.kind === "textarea" ? "textarea" : "input";
    return (
      <div>
        {label}
        <div className="grid md:grid-cols-3 gap-2">
          {CMS_LOCALES.map((loc) => (
            <div key={loc}>
              <span className="block text-[10px] uppercase text-muted mb-0.5">{LOCALE_LABEL[loc]}</span>
              <Input
                value={v[loc] ?? ""}
                disabled={disabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange({ ...v, [loc]: e.target.value })}
                {...(field.kind === "textarea" ? { rows: 4 } : {})}
                className="w-full border border-border px-2 py-1 text-xs"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <label className="block">
        {label}
        <textarea value={String(value ?? "")} rows={4} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full border border-border px-2 py-1 text-xs" />
      </label>
    );
  }

  if (field.kind === "slugs") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <label className="block">
        {label}
        <textarea
          value={list.join("\n")}
          rows={5}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          className="w-full border border-border px-2 py-1 text-xs font-mono"
        />
      </label>
    );
  }

  if (field.kind === "number") {
    return (
      <label className="block max-w-[10rem]">
        {label}
        <input type="number" min={1} max={48} value={Number(value ?? 6)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full border border-border px-2 py-1 text-xs" />
      </label>
    );
  }

  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="block max-w-xs">
        {label}
        <select value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full border border-border px-2 py-1 text-xs">
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "image") {
    return <ImageField label={label} value={String(value ?? "")} onChange={onChange} disabled={disabled} />;
  }

  return (
    <label className="block">
      {label}
      <input value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full border border-border px-2 py-1 text-xs" />
    </label>
  );
}

function ImageField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = normalizeImageUrl(value, 600);

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
    <div>
      {label}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[16rem] space-y-1">
          <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="https://… ou um link do Google Drive" className="w-full border border-border px-2 py-1 text-xs" />
          <label className="text-[11px] flex items-center gap-2">
            <span className="underline cursor-pointer">{uploading ? "Enviando…" : "Enviar um arquivo"}</span>
            <input type="file" accept="image/*" className="hidden" disabled={disabled || uploading} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" referrerPolicy="no-referrer" className="h-20 w-auto border border-border object-contain bg-background" />
        )}
      </div>
    </div>
  );
}
