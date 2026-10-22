import { createClient } from "@/lib/supabase/server";
import { ColorsAdmin } from "@/components/colors-admin";
import { colorKey } from "@/lib/colors";

export const metadata = { title: "Cores — Admin" };

export default async function ColorsPage() {
  const supabase = await createClient();
  const [{ data: colors }, { data: map }, { data: variantColors }] = await Promise.all([
    supabase.from("tdp_colors").select("id, name_en, name_es, name_pt, hex, active, sort").order("sort"),
    supabase.from("supplier_color_map").select("supplier_key, supplier_color, tdp_color_id, status, manual_override"),
    supabase.from("variants").select("color").limit(50000),
  ]);

  const uses = new Map<string, number>();
  for (const v of variantColors ?? []) uses.set(colorKey(v.color), (uses.get(colorKey(v.color)) ?? 0) + 1);

  const rows = (map ?? [])
    .map((m) => ({ ...m, uses: uses.get(m.supplier_key) ?? 0 }))
    .sort((a, b) => Number(b.status === "needs_review") - Number(a.status === "needs_review") || a.supplier_color.localeCompare(b.supplier_color));
  const pending = rows.filter((r) => r.status === "needs_review").length;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Cores</h1>
        <p className="text-sm text-muted mt-1">
          O texto de cor do fornecedor é interno. No site, o comprador vê o nome da cor TDP no idioma dele e o filtro usa só as cores TDP.
          Cores sem correspondência ficam fora do filtro até serem revisadas.
        </p>
        <p className="mt-2 text-sm">
          <span className={`inline-block px-2 py-0.5 text-xs rounded-sm ${pending ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>
            {pending ? `${pending} cor(es) do fornecedor para revisar` : "Nenhuma cor pendente"}
          </span>
        </p>
      </div>
      <ColorsAdmin colors={colors ?? []} rows={rows} />
    </div>
  );
}
