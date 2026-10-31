"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEntity, saveEntity } from "@/app/admin/entidades/actions";
import { ENTITY, type EntityKind, type EntityPayload, type LookbookImageInput } from "@/lib/entities";
import {
  Field,
  ImageInput,
  LocalizedInput,
  Msg,
  ProductPicker,
  btnCls,
  btnGhost,
  inputCls,
  useRun,
  type PickOption,
} from "@/components/admin-ui";

const OPS: [string, string][] = [
  ["intl_b2b", "Internacional B2B"],
  ["intl_b2c", "Internacional B2C"],
  ["br_b2b", "Brasil B2B"],
  ["br_b2c", "Brasil B2C"],
];

/** One editor for Marcas / Coleções / Lookbooks / Edits (ON/OFF, ordem, placement pago, produtos). */
export function EntityEditor({
  kind,
  initial,
  productOptions,
  brandOptions = [],
  collectionOptions = [],
  stockLine,
}: {
  kind: EntityKind;
  initial: EntityPayload;
  productOptions: PickOption[];
  brandOptions?: PickOption[];
  collectionOptions?: PickOption[];
  /** Collections: "4/10 estilos disponíveis" summary. */
  stockLine?: string;
}) {
  const cfg = ENTITY[kind];
  const router = useRouter();
  const { pending, message, run } = useRun();
  const [p, setP] = useState<EntityPayload>(initial);
  const set = <K extends keyof EntityPayload>(k: K, v: EntityPayload[K]) => setP((prev) => ({ ...prev, [k]: v }));

  function save() {
    run(
      () => saveEntity(kind, p),
      "Salvo.",
      (res) => {
        if (res && "id" in res && res.id && !p.id) router.replace(`/admin/${cfg.route}/${res.id}`);
      }
    );
  }

  function remove() {
    if (!p.id || !confirm(`Excluir ${cfg.singular.toLowerCase()} definitivamente? Isso não pode ser desfeito.`)) return;
    run(() => deleteEntity(kind, p.id!), "Excluído.", () => router.replace(`/admin/${cfg.route}`));
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <section className="border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold">Conteúdo</h2>
        {kind === "brands" ? (
          <Field label="Nome da marca">
            <input value={p.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </Field>
        ) : (
          <LocalizedInput label="Título" value={p.title} onChange={(v) => set("title", v)} />
        )}
        <Field label="Endereço (slug)" hint="Aparece na URL do site. Deixe vazio para gerar a partir do título.">
          <input value={p.slug} onChange={(e) => set("slug", e.target.value)} className={inputCls} />
        </Field>
        <ImageInput label="Imagem de capa — desktop" value={p.cover_url} onChange={(v) => set("cover_url", v)} />
        <ImageInput label="Imagem de capa — mobile (opcional)" value={p.cover_mobile_url} onChange={(v) => set("cover_mobile_url", v)} />
        {kind === "brands" && (
          <>
            <ImageInput label="Logo" value={p.logo_url} onChange={(v) => set("logo_url", v)} />
            <Field label="País">
              <input value={p.country} onChange={(e) => set("country", e.target.value)} className={inputCls} />
            </Field>
          </>
        )}
        <LocalizedInput
          label={kind === "edits" ? "Texto editorial" : kind === "brands" ? "História da marca" : "História / texto"}
          value={p.story}
          onChange={(v) => set("story", v)}
          multiline
        />
      </section>

      <section className="border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Publicação</h2>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.active} onChange={(e) => set("active", e.target.checked)} /> Ativo (ON no site)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.featured} onChange={(e) => set("featured", e.target.checked)} /> Destaque (módulo da Home)
          </label>
          <label className="flex items-center gap-2">
            Ordem
            <input type="number" value={p.sort} onChange={(e) => set("sort", Number(e.target.value))} className={`${inputCls} w-24`} />
          </label>
        </div>
        <fieldset className="text-sm">
          <legend className="text-xs font-medium mb-1">Visível nas operações</legend>
          <div className="flex flex-wrap gap-4">
            {OPS.map(([code, label]) => (
              <label key={code} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={p.visible_ops.includes(code)}
                  onChange={(e) => set("visible_ops", e.target.checked ? [...p.visible_ops, code] : p.visible_ops.filter((o) => o !== code))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === "collections" && (
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Mostrar a partir de">
              <input type="date" value={p.starts_at} onChange={(e) => set("starts_at", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mostrar até">
              <input type="date" value={p.ends_at} onChange={(e) => set("ends_at", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Alerta COLLECTION INVENTORY REVIEW (estilos disponíveis ≤)" hint="Padrão 10. 0 = sem este alerta.">
              <input type="number" min={0} value={p.alert_review_styles} onChange={(e) => set("alert_review_styles", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Alerta LOW INVENTORY — REVIEW REQUIRED (estilos disponíveis ≤)" hint="Padrão 5. 0 = sem este alerta.">
              <input type="number" min={0} value={p.alert_low_styles} onChange={(e) => set("alert_low_styles", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Lembrete antes do fim da coleção (dias)" hint="Aviso no Action Center quando faltarem tantos dias para “Mostrar até”.">
              <input type="number" min={0} value={p.alert_end_days} onChange={(e) => set("alert_end_days", Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        )}
        {stockLine && <p className="text-sm">{stockLine}</p>}
      </section>

      <section className="border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Placement pago</h2>
        <p className="text-xs text-muted">
          As datas controlam só o destaque pago (selo de parceiro e posição de destaque). Quando o período termina o destaque encerra, mas a marca, coleção, lookbook, edit e seus produtos continuam no site. Lembretes (7 dias, 1 dia e no dia) aparecem no Action Center e por e-mail.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.paid_placement} onChange={(e) => set("paid_placement", e.target.checked)} /> Placement pago (mostra “parceiro”)
        </label>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Parceiro">
            <input value={p.partner} onChange={(e) => set("partner", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Início">
            <input type="date" value={p.placement_start} onChange={(e) => set("placement_start", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fim">
            <input type="date" value={p.placement_end} onChange={(e) => set("placement_end", e.target.value)} className={inputCls} />
          </Field>
        </div>
      </section>

      {kind === "lookbooks" && (
        <section className="border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">Vínculos do lookbook</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Marca relacionada">
              <select value={p.brand_id} onChange={(e) => set("brand_id", e.target.value)} className={inputCls}>
                <option value="">— nenhuma —</option>
                {brandOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Coleção relacionada">
              <select value={p.collection_id} onChange={(e) => set("collection_id", e.target.value)} className={inputCls}>
                <option value="">— nenhuma —</option>
                {collectionOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      )}

      {kind === "edits" && (
        <>
          <section className="border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold">Imagens editoriais</h2>
            {p.gallery.map((url, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <ImageInput label={`Imagem ${i + 1}`} value={url} onChange={(v) => set("gallery", p.gallery.map((g, k) => (k === i ? v : g)))} />
                </div>
                <button type="button" onClick={() => set("gallery", p.gallery.filter((_, k) => k !== i))} className="text-xs text-red-600 pb-2">Remover</button>
              </div>
            ))}
            <button type="button" onClick={() => set("gallery", [...p.gallery, ""])} className={btnGhost}>+ Adicionar imagem</button>
          </section>
          <section className="border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold">Marcas deste edit</h2>
            <ProductPicker options={brandOptions} value={p.brandIds} onChange={(ids) => set("brandIds", ids)} ordered />
          </section>
        </>
      )}

      {kind !== "lookbooks" ? (
        <section className="border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">Produtos {kind === "brands" ? "da marca" : kind === "collections" ? "da coleção" : "do edit"}</h2>
          {kind === "brands" && <p className="text-xs text-muted">Os produtos escolhidos passam a pertencer a esta marca; os removidos ficam sem marca.</p>}
          <ProductPicker options={productOptions} value={p.productIds} onChange={(ids) => set("productIds", ids)} ordered={kind !== "brands"} />
        </section>
      ) : (
        <LookbookImages images={p.images} onChange={(images) => set("images", images)} productOptions={productOptions} />
      )}

      <div className="flex items-center gap-3">
        <button disabled={pending} onClick={save} className={btnCls}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {p.id && (
          <button disabled={pending} onClick={remove} className={btnGhost}>
            Excluir
          </button>
        )}
        <Msg message={message} />
      </div>
    </div>
  );
}

function LookbookImages({
  images,
  onChange,
  productOptions,
}: {
  images: LookbookImageInput[];
  onChange: (v: LookbookImageInput[]) => void;
  productOptions: PickOption[];
}) {
  const update = (i: number, patch: Partial<LookbookImageInput>) => onChange(images.map((im, k) => (k === i ? { ...im, ...patch } : im)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <section className="border border-border p-4 space-y-4">
      <h2 className="text-sm font-semibold">Imagens “Shop the look”</h2>
      <p className="text-xs text-muted">Cada imagem do lookbook tem uma lista de produtos que aparecem como cards “Shop the look”.</p>
      {images.map((im, i) => (
        <div key={im.id ?? `new-${i}`} className="border border-border p-3 space-y-3 bg-background">
          <div className="flex items-center justify-between text-xs">
            <strong>Imagem {i + 1}</strong>
            <span className="space-x-2">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="disabled:opacity-30">↓</button>
              <button type="button" onClick={() => onChange(images.filter((_, k) => k !== i))} className="text-red-600">Remover</button>
            </span>
          </div>
          <ImageInput label="Imagem" value={im.image_url} onChange={(v) => update(i, { image_url: v })} />
          <LocalizedInput label="Legenda (opcional)" value={im.caption} onChange={(v) => update(i, { caption: v })} />
          <div>
            <p className="text-xs font-medium mb-1">Produtos desta imagem</p>
            <ProductPicker options={productOptions} value={im.productIds} onChange={(ids) => update(i, { productIds: ids })} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...images, { image_url: "", caption: { en: "", es: "", pt: "" }, productIds: [] }])} className={btnGhost}>
        + Adicionar imagem
      </button>
    </section>
  );
}
