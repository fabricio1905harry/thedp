"use client";

import Link from "next/link";
import { moveEntity, toggleEntity } from "@/app/admin/entidades/actions";
import { ENTITY, type EntityKind } from "@/lib/entities";
import { Msg, btnGhost, useRun } from "@/components/admin-ui";
import { normalizeImageUrl } from "@/lib/image-url";

export interface EntityRow {
  id: string;
  title: string;
  slug: string;
  cover: string | null;
  active: boolean;
  featured: boolean;
  /** "Visível no site" / "Agendado" / "Expirado" … */
  visibility: { label: string; tone: "ok" | "warn" | "off" };
  products: number;
  note?: string;
}

const TONE = { ok: "bg-green-100 text-green-900", warn: "bg-amber-100 text-amber-900", off: "bg-surface text-muted" };

export function EntityList({ kind, rows }: { kind: EntityKind; rows: EntityRow[] }) {
  const cfg = ENTITY[kind];
  const { pending, message, run } = useRun();
  return (
    <div className="space-y-3">
      <Msg message={message} />
      {rows.length === 0 && <p className="text-sm text-muted border border-dashed border-border p-6">Nada cadastrado ainda.</p>}
      {rows.map((r, i) => {
        const thumb = normalizeImageUrl(r.cover, 200);
        return (
          <div key={r.id} className="border border-border p-3 flex flex-wrap items-center gap-4">
            <div className="w-16 h-16 bg-surface shrink-0 overflow-hidden">
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Link href={`/admin/${cfg.route}/${r.id}`} className="font-medium hover:underline">
                {r.title || r.slug}
              </Link>
              <p className="text-xs text-muted">
                /{cfg.siteRoute}/{r.slug} · {r.products} produto(s){r.featured ? " · destaque" : ""}
              </p>
              {r.note && <p className="text-xs mt-0.5">{r.note}</p>}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-sm ${TONE[r.visibility.tone]}`}>{r.visibility.label}</span>
            <div className="flex items-center gap-2">
              <label className="text-xs flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={r.active}
                  disabled={pending}
                  onChange={(e) => run(() => toggleEntity(kind, r.id, e.target.checked), e.target.checked ? "Ativado." : "Desativado.")}
                />
                ON
              </label>
              <button disabled={pending || i === 0} onClick={() => run(() => moveEntity(kind, r.id, "up"), "Ordem atualizada.")} className={btnGhost} aria-label="Subir">↑</button>
              <button disabled={pending || i === rows.length - 1} onClick={() => run(() => moveEntity(kind, r.id, "down"), "Ordem atualizada.")} className={btnGhost} aria-label="Descer">↓</button>
              <Link href={`/admin/${cfg.route}/${r.id}`} className={btnGhost}>
                Editar
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
