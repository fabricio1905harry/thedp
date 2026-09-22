import { getPackagingTypes, getCapacityRules } from "@/lib/dhl-packaging";
import { PackagingManager } from "@/components/packaging-manager";

export default async function AdminEmbalagensPage() {
  const [types, rules] = await Promise.all([
    getPackagingTypes(),
    getCapacityRules(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl mb-1">Configuração de Embalagens DHL</h1>
        <p className="text-xs text-muted max-w-2xl leading-relaxed">
          Cadastre as medidas oficiais DHL (comprimento, largura, altura, peso da caixa vazia e peso máximo) e as regras de capacidade por categoria. O sistema utilizará estas configurações para selecionar e calcular automaticamente os volumes nos pedidos internacionais.
        </p>
      </div>

      <PackagingManager types={types} rules={rules} />
    </div>
  );
}
