import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NcmAdmin } from "@/components/ncm-admin";

export const metadata = { title: "NCM / HS — Admin" };

export default async function NcmPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "revisao" } = await searchParams;
  const supabase = await createClient();
  const [{ data: codes }, { data: defaults }, { data: cats }, { data: review }, { count: missing }, { data: rules }] = await Promise.all([
    supabase.from("hs_codes_master").select("*").order("code"),
    supabase.from("category_shipping_defaults").select("*").order("category"),
    supabase.from("products").select("category").neq("status", "archived").not("category", "is", null).limit(5000),
    supabase
      .from("products")
      .select("id, title, slug, category, composition, hs_code, weight_g, dims_cm, shipping_inherited")
      .eq("hs_review_status", "needs_review")
      .neq("status", "archived")
      .order("title")
      .limit(500),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .neq("status", "archived")
      .or("hs_code.is.null,hs_code.eq.,weight_g.is.null"),
    supabase.from("hs_rules").select("*").order("category").order("composition_label"),
  ]);
  const categories = [...new Set([...(cats ?? []).map((c) => c.category as string), ...(defaults ?? []).map((d) => d.category as string)])].sort();

  const tabs = [
    ["revisao", `Revisão (${review?.length ?? 0})`],
    ["regras", `Regras por composição (${rules?.length ?? 0})`],
    ["categorias", "Padrões por categoria"],
    ["mestre", "Tabela mestre NCM/HS"],
  ];
  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="font-serif text-2xl">NCM / HS</h1>
        <p className="text-sm text-muted mt-1">
          Tabela mestre de códigos, regras por categoria + composição, padrões de peso/dimensões por categoria e fila de revisão. Produtos sem dados herdam o padrão da categoria e
          ficam em “precisa revisar” (também no Action Center, em “Dados de envio necessários”).
          {typeof missing === "number" && missing > 0 && ` ${missing} produto(s) ainda sem NCM ou peso.`}
        </p>
      </div>
      <nav className="flex gap-2 text-sm">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/admin/ncm?tab=${k}`} className={`px-3 py-1.5 border rounded-sm ${tab === k ? "bg-foreground text-background border-foreground" : "border-border"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <NcmAdmin tab={tab} codes={codes ?? []} defaults={defaults ?? []} categories={categories} review={review ?? []} rules={rules ?? []} />
    </div>
  );
}
