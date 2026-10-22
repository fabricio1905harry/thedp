import { getLatestFxRates, isStale, FX_STALE_DAYS } from "@/lib/fx";
import { FxRateField } from "@/components/fx-rate-field";
import { FxUpdateNowButton } from "@/components/fx-update-now-button";
import { FxSettingsForm } from "@/components/fx-settings-form";
import { getFxSettings } from "@/lib/fx-auto";

export default async function AdminCambioPage() {
  const rates = await getLatestFxRates();
  const fxSettings = await getFxSettings();
  const hasStaleRate =
    (rates.USD && isStale(rates.USD.fetchedAt)) ||
    (rates.EUR && isStale(rates.EUR.fetchedAt));

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">Configurações Financeiras & Câmbio</h1>
      <p className="text-sm text-muted mb-6 max-w-xl">
        A cotação é atualizada automaticamente (fonte e frequência configuráveis abaixo) e pode ser
        atualizada na hora com ATUALIZAR CÂMBIO AGORA ou digitada manualmente abaixo. O preço exibido para os
        compradores usa sempre a última cotação salva. Cotações sem atualização há mais de {FX_STALE_DAYS} dias
        são sinalizadas com um alerta; falhas na atualização automática entram no Action Center.
      </p>

      <FxSettingsForm settings={fxSettings} />

      <FxUpdateNowButton />

      {hasStaleRate && (
        <div className="mb-6 p-4 bg-surface border-2 border-foreground text-foreground text-sm rounded-md max-w-2xl">
          <strong>⚠️ Alerta de Câmbio Desatualizado:</strong> Uma ou mais cotações de moeda não são atualizadas há mais de {FX_STALE_DAYS} dias. Verifique os valores abaixo e salve a nova taxa para garantir a precificação correta.
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        <FxRateField
          quote="USD"
          currentRate={rates.USD?.rate ?? null}
          fetchedAt={rates.USD?.fetchedAt ?? null}
          updatedByEmail={rates.USD?.updatedByEmail ?? null}
          stale={rates.USD ? isStale(rates.USD.fetchedAt) : false}
        />
        <FxRateField
          quote="EUR"
          currentRate={rates.EUR?.rate ?? null}
          fetchedAt={rates.EUR?.fetchedAt ?? null}
          updatedByEmail={rates.EUR?.updatedByEmail ?? null}
          stale={rates.EUR ? isStale(rates.EUR.fetchedAt) : false}
        />
      </div>
    </div>
  );
}
