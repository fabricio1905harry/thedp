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

/** One editor for Marcas / Coleções / Lookbooks / Edits (ON/OFF, ordem, placement pago, produtos). */
export function EntityEditor({
  kind,
  initial,
  productOptions,
  stockLine,
}: {
  kind: EntityKind;
  initial: EntityPayload;
  productOptions: PickOption[];
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
        <ImageInput label="Imagem de capa" value={p.cover_url} onChange={(v) => set("cover_url", v)} />
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
        {kind === "collections" && (
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Mostrar a partir de">
              <input type="date" value={p.starts_at} onChange={(e) => set("starts_at", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mostrar até">
              <input type="date" value={p.ends_at} onChange={(e) => set("ends_at", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Alerta de estoque: mínimo de estilos disponíveis" hint="0 = sem alerta. Abaixo disso, entra no Action Center.">
              <input
                type="number"
                min={0}
                value={p.alert_min_styles}
                onChange={(e) => set("alert_min_styles", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
        )}
        {stockLine && <p className="text-sm">{stockLine}</p>}
      </section>

      <section className="border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Placement pago</h2>
        <p className="text-xs text-muted">Com datas preenchidas, o item some do site sozinho quando o período termina (e só aparece depois do início).</p>
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
