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
          Tabela do PDF (pág. 116): BR 36 a 56 com a letra e o tamanho US de cada um. Medidas em cm (busto, cintura, quadril) são editáveis; as
          polegadas do site são calculadas a partir delas (faixas como “79-86” são aceitas). O PDF não usa tamanho EU: o site mostra
          “M / US 6 (BR 40)”. “Apelidos” são outros nomes que o fornecedor usa para o mesmo tamanho (ex.: P, G, GG, 3G), separados por vírgula.
        </p>
      </div>
      <SizeChartAdmin rows={data ?? []} />
    </div>
  );
}
