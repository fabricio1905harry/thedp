# Site e Painel Admin em deploys separados

Mesmo repositório, **dois projetos na Vercel**. A variável `APP_TARGET` define o que cada deploy atende:

| Deploy | `APP_TARGET` | Domínio (exemplo) | Atende |
|---|---|---|---|
| Site | `site` | `thedressingproject.com` | loja (`/pt`, `/en`, `/es`…), `/api/events`. `/admin` responde 404 |
| Painel | `admin` | `admin.thedressingproject.com` | só `/admin`, `/api/cron/*`, `/api/ingest/*`. O resto redireciona para `/admin` |
| (sem variável) | — | desenvolvimento local / deploy único antigo | tudo, como antes |

## Passo a passo na Vercel

**1. Projeto atual → vira o SITE**
- Settings → Environment Variables → adicione `APP_TARGET = site` (Production e Preview) → Redeploy.
- Pode remover deste projeto: `CRON_SECRET` (os crons rodam no painel).

**2. Novo projeto → PAINEL**
- Add New → Project → mesmo repositório `fabricio1905harry/thedp`, branch `main`.
- Environment Variables (as mesmas do site, mais duas):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `APP_TARGET = admin`
  - `CRON_SECRET` (qualquer valor secreto)
- Settings → Domains → `admin.seudominio.com`.
- Os crons (`vercel.json`) existem nos dois projetos, mas só o painel executa; no site respondem "skipped".

**3. Supabase (Authentication → URL Configuration)**
- Inclua o domínio do painel em *Redirect URLs*. O painel tem login próprio (e-mail e senha) e só aceita contas `operator`/`admin`; a sessão do site não vale no painel, e vice-versa (domínios diferentes).

**4. n8n**
- Aponte o webhook de ingestão para `https://admin.seudominio.com/api/ingest/product` (mesma chave `x-api-key`).

## Testado
Build único, subindo com cada `APP_TARGET`:
- `site`: `/admin*` → 404; `/api/ingest` → 404; `/api/events` ativo.
- `admin`: `/`, `/pt` → redireciona para `/admin`; `/api/events` → 404; `/api/ingest` e `/api/cron` ativos (401 sem chave).
- sem variável: tudo ativo.

## Observações
- `APP_TARGET` é lida em tempo de execução: trocar o valor exige apenas Redeploy.
- O painel envia `X-Robots-Tag: noindex` e `robots: noindex`.
- Separar também o **código** em dois apps (monorepo) continua possível depois; esta etapa já isola domínio, rotas, login e crons.

## Stripe (pagamento por cartão)

O pagamento acontece no **site**. No projeto do site, na Vercel, adicione:

| Variável | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | chave secreta do Stripe (`sk_live_…` ou `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | segredo do webhook (`whsec_…`), veja abaixo |

No painel do Stripe → Developers → Webhooks → *Add endpoint*:
- URL: `https://<dominio-do-site>/api/stripe/webhook`
- Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`
- Copie o *Signing secret* para `STRIPE_WEBHOOK_SECRET` e faça Redeploy.

No Admin: habilite o Stripe por canal/cliente/pedido (Pagamentos, ou na página do pedido → "Enable Stripe for this order"). O cartão confirmado marca o pedido como **Pago** automaticamente; reembolso e chargeback do Stripe atualizam o pagamento sozinhos.
