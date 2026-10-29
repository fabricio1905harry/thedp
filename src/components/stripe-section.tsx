interface StripeStatus {
  mode: "test" | "live" | "unset";
  secretKey: boolean;
  webhookSecret: boolean;
  siteUrl: boolean;
}

async function checkSite(): Promise<{ state: "unset" | "unreachable" | "ok"; url?: string; status?: StripeStatus }> {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!url) return { state: "unset" };
  try {
    const res = await fetch(`${url}/api/stripe/status`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { state: "unreachable", url };
    return { state: "ok", url, status: (await res.json()) as StripeStatus };
  } catch {
    return { state: "unreachable", url };
  }
}

const Dot = ({ ok }: { ok: boolean }) => <span className={ok ? "text-emerald-700" : "text-red-700"}>{ok ? "✔" : "✖"}</span>;

/** Stripe status of the storefront deployment + the setup steps (test / sandbox mode first). */
export async function StripeSection() {
  const site = await checkSite();
  const st = site.status;
  const webhookUrl = `${site.url ?? "https://<site>"}/api/stripe/webhook`;

  return (
    <section className="space-y-3 text-xs max-w-2xl">
      <h2 className="text-sm font-medium uppercase tracking-wide">Stripe (cartão)</h2>

      <div className="border border-border p-3 space-y-1">
        {site.state === "unset" && (
          <p>
            Para ver o estado do Stripe aqui, defina <code>NEXT_PUBLIC_SITE_URL</code> neste deploy (Admin) com o endereço do site.
          </p>
        )}
        {site.state === "unreachable" && <p className="text-red-700">Não consegui consultar {site.url}/api/stripe/status (site fora do ar ou ainda sem este deploy).</p>}
        {st && (
          <>
            <p>
              <Dot ok={st.secretKey} /> Chave secreta (<code>STRIPE_SECRET_KEY</code>) no site —{" "}
              {st.mode === "test" ? (
                <strong className="text-amber-700">MODO TESTE (sandbox): nenhuma cobrança real</strong>
              ) : st.mode === "live" ? (
                <strong>MODO REAL (cobranças reais)</strong>
              ) : (
                "não definida"
              )}
            </p>
            <p>
              <Dot ok={st.webhookSecret} /> Segredo do webhook (<code>STRIPE_WEBHOOK_SECRET</code>) no site
            </p>
            <p>
              <Dot ok={st.siteUrl} /> <code>NEXT_PUBLIC_SITE_URL</code> no site (links de retorno do pagamento)
            </p>
          </>
        )}
      </div>

      <div className="text-muted space-y-2">
        <p className="font-medium text-foreground">Configurar em modo teste (sandbox)</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>No painel do Stripe, ative <strong>Modo de teste</strong> (chave no canto superior) e copie a <em>Secret key</em> <code>sk_test_…</code> em Desenvolvedores → Chaves de API.</li>
          <li>
            Em Desenvolvedores → Webhooks → <em>Adicionar endpoint</em>, use <code>{webhookUrl}</code> com os eventos{" "}
            <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>,{" "}
            <code>checkout.session.expired</code>, <code>checkout.session.async_payment_failed</code>,{" "}
            <code>payment_intent.payment_failed</code>, <code>charge.refunded</code> e <code>charge.dispute.created</code>. Copie o <em>Signing secret</em> <code>whsec_…</code>.
          </li>
          <li>
            Na Vercel, no projeto do <strong>site</strong> (não o do Admin), crie <code>STRIPE_SECRET_KEY</code> = <code>sk_test_…</code> e{" "}
            <code>STRIPE_WEBHOOK_SECRET</code> = <code>whsec_…</code> e faça um novo deploy. Nunca cole essas chaves em chat ou no código.
          </li>
          <li>Habilite “Cartão / Stripe” para o canal acima (ou para um pedido específico) e pague um pedido de teste com o cartão <code>4242 4242 4242 4242</code>, qualquer data futura e CVC.</li>
          <li>Outros cartões de teste: <code>4000 0000 0000 9995</code> (recusado por saldo) e <code>4000 0025 0000 3155</code> (exige autenticação 3-D Secure).</li>
          <li>Para ir ao modo real depois: troque as duas variáveis pelas chaves <code>sk_live_…</code> / <code>whsec_…</code> do endpoint em modo real e refaça o deploy.</li>
        </ol>
        <p>
          Um pagamento aprovado marca o pedido como PAGO automaticamente; se o cartão for recusado, o comprador vê a mensagem de falha e pode tentar de novo.
        </p>
      </div>
    </section>
  );
}
