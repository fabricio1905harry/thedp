import { createClient } from "@/lib/supabase/server";
import { SizeChartAdmin } from "@/components/size-chart-admin";

export const metadata = { title: "Tamanhos — Admin" };

export default async function SizesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("size_chart").select("*").order("sort");
  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Tabela de tamanhos</h1>
        <p className="text-sm text-muted mt-1">
          Tabela inicial sugerida (BR 36–46 → US 2–12, EU = BR, letras XS–XXL): <strong>o cliente precisa validar</strong>. No site, o comprador vê
          o tamanho no idioma dele (US + BR para inglês, EU para espanhol/Europa) e o botão “Guia de tamanhos”. “Apelidos” são outros nomes
          que o fornecedor usa para o mesmo tamanho (ex.: P, G, GG), separados por vírgula.
        </p>
      </div>
      <SizeChartAdmin rows={data ?? []} />
    </div>
  );
}
