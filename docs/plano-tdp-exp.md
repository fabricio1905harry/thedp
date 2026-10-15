# Plano — implementação do documento "TDP EXP"

Fonte: `TDP EXP (3).pdf` (Drive). Lido por inteiro (≈86 mil caracteres).
Escopo do documento: plataforma de distribuição de moda brasileira — **Internacional B2B** (thedressingproject.com, branco & preto) como operação de lançamento, com a estrutura pronta para Nacional B2B, Nacional DTC e Internacional DTC (thedressingproject.com.br, preto & branco).

## 1. Como o documento foi organizado aqui

O documento tem ~15 grandes blocos. Cada um virou um **épico**. A coluna "Estado" compara com o que o código já tinha.

| # | Épico (seção do documento) | Estado antes | Fase |
|---|---|---|---|
| 1 | Arquitetura de marcas/domínios, módulos ON/OFF por operação | só `site_mode` (.com × .com.br) | **1A** CMS com ON/OFF, ordem e visibilidade por operação |
| 2 | Idiomas EN (master) / ES / PT editáveis | next-intl só para textos fixos | **1A** conteúdo editável por idioma, master em EN |
| 3 | Menu SHOP · COLLECTIONS · LOOKBOOKS · ABOUT · CONTACT (+ BRANDS, EDITS) | menu antigo (novidades/destaques/atacado) | **1B** |
| 4 | Home em módulos (Hero, How it Works, Start Small, Best Sellers, Featured…) | home de e-commerce genérica | **1B** (módulos sem entidade própria) · **2** (Collection/Brands/Lookbooks/Edits) |
| 5 | Shop com filtros, ordenação, "avise-me" | catálogo simples por categoria | **1B** (filtros/ordenação) · **2** (Notify Me, filtros normalizados) |
| 6 | About (história, jornada, visão, founders, filme) | página vazia | **1C** |
| 7 | Contact (formulário, status NEW/IN PROGRESS/RESOLVED) | página vazia | **1C** |
| 8 | Cadastro wholesale + aprovação (Approve/Reject/Request more info) | cadastro simples | **1D** |
| 9 | Order Request (carrinho com estimativas, "Availability will be confirmed before payment") | checkout antigo | **1D** (textos e fluxo) |
| 10 | Order Confirmation Flow (Original Request preservado, Confirmed Order) | feito (pedido 0030) | ✔ + **2** visão lado a lado no My Account |
| 11 | Inventory Reservation Logic (24h/48h/Custom/Cannot reserve) | feito (0026) | ✔ + **1D** Stripe não funciona após expirar |
| 12 | Duties & Taxes por mercado (Prepaid / Upon import / Customer choice) | valor manual por pedido | **2** |
| 13 | Payment Flow (Bank + upload de comprovante, Stripe) | Bank manual + Stripe (PR #4) | **2** upload de comprovante, "Payment failed — try again" |
| 14 | Ship now × Reserve for later delivery (depósito, lembretes, UPCOMING SHIPMENTS, 180 dias) | cálculo do depósito (0025) | **1C** página "Learn more" · **3** fluxo completo |
| 15 | DHL (shipment, pickup, tracking, documentos, preparação de produto) | cotação/embalagem existentes | **3** |
| 16 | Notificações e status map (e-mail/WhatsApp/SMS por evento, templates EN/ES/PT) | fila `email_outbox` sem envio | **3** |
| 17 | Invoice automática (PDF) + Fase 2 fiscal | não existe | **3** (modelo da Marcela) |
| 18 | Carrinho abandonado (e-mails 2h e 24h, tela no Admin) | não existe | **3** |
| 19 | Pedido mínimo por regra + Volume Pricing (OFF no lançamento) | não existe | **2** |
| 20 | Dados do produto (NCM/HS mestre, país de origem, peso/dimensão por fornecedor+categoria) | `hs_code`, peso e dimensão por produto | **2** |
| 21 | Normalização de tamanhos (`M / US 6 (BR 40)`) e cores (tabela EN/ES/PT aprovada) | `size_us/size_eu` parciais | **2** |
| 22 | Precificação (custo BRL + preparo + câmbio + margem-alvo, alertas) | custo + markup fixo | **2** |
| 23 | Product page (galeria, grid de quantidade, acordeões, favoritos) | grid de quantidade já existe | **1D** textos e blocos · **2** favoritos/tamanhos |
| 24 | Brands, Collections, Lookbooks shoppable, TDP Edits (CMS, placements pagos, alertas de estoque da coleção) | não existem | **2** |
| 25 | Câmbio (BCE/BCB, frequência configurável) | diário + botão (0028) | **2** frequência configurável + PTAX |

## 2. Fases

### Fase 1 — fundação visual e de conteúdo (esta entrega)
- **1A — CMS.** Tabela `cms_blocks` (ON/OFF, ordem, visibilidade por operação, conteúdo EN/ES/PT). Textos padrão ficam no código; o Admin só grava o que for alterado e pode "voltar ao padrão". Editor em *Admin → Conteúdo do site*. Links do Google Drive viram URL de imagem automaticamente.
- **1B — Layout.** Header, menu e footer novos (branco & preto, editorial). Home por módulos: Hero, banner institucional, Ready to Ship, How it Works (4 passos), Start Small, Best Sellers (automático + manual), Featured Products, Featured Video, Become a Brand. Página **Shop** com filtros e ordenação.
- **1C — Institucional.** About (com a foto do Drive), Contact com formulário e caixa de entrada no Admin, página "Reserve for Later Delivery — Learn more".
- **1D — Fluxo do comprador.** Cadastro wholesale completo e aprovação com "Request more information"; carrinho/checkout viram **Order Request**; página de pedido com "ORDER REQUEST RECEIVED"; product page com os textos do documento; quantidade já no pedido visível nos cards; link do Stripe passa a expirar junto com a reserva.

### Fase 2 — catálogo e regras comerciais
Collections · Lookbooks shoppable · TDP Edits · Brands (+ placements pagos, datas, alertas "10/5 styles") · Notify Me · Favoritos · tabela de tamanhos e de cores (EN/ES/PT aprovados) · NCM/HS mestre com revisão · Duties & Taxes por mercado · pedido mínimo + volume pricing · motor de precificação com margem-alvo · upload de comprovante · "Payment failed — try again" · My Account com Original Request × Confirmed Order · frequência do câmbio configurável.

### Fase 3 — operação pós-pagamento
Reserve for Later Delivery completo (data, lembretes 14/8/7 dias, overdue, UPCOMING SHIPMENTS, 180 dias) · DHL shipment / pickup / tracking / documentos · preparação do produto (etiquetas) · notificações com templates por evento/canal/idioma (e provedor de e-mail/WhatsApp) · invoice PDF · carrinho abandonado · fiscal (NF-e de exportação, depende do contador).

## 3. Decisões e dependências que não são de código
1. **Provedor de e-mail** (Resend, SES…) e número/API de WhatsApp: hoje as mensagens ficam na fila `email_outbox`.
2. **Modelo da invoice** (Marcela → Harry) e **tabela mestre de NCM/HS** com a contabilidade.
3. **Arquivo DHL de embalagens** e calibração de capacidade por caixa (já existe uma base).
4. **Textos aprovados nas 3 línguas** dos e-mails/WhatsApp transacionais (o documento pede que não sejam traduzidos por IA a cada envio).
5. **Textos finais do About** (bios das founders, marcos da jornada, filme) — o sistema traz rascunhos baseados no documento, editáveis no Admin.
6. **Número do WhatsApp** e **e-mail** comerciais da operação.
7. **Câmbio:** o documento pede atualização semanal pelo Banco Central; o sistema hoje atualiza diariamente (BCE). Na fase 2 a frequência e a fonte ficam configuráveis.

## 4. Pontos do documento que já estavam implementados
Pedido original preservado + Confirmed Order · reserva temporária 24h/48h/Custom/Cannot reserve com expiração · pagamento por Bank Transfer com confirmação manual (nunca automática) e por Stripe · pagamento só liberado após o Confirmed Order · depósito do Reserve = custo + 10% mostrado como percentual · alertas de margem · Action Center · WhatsApp fixo · frete/impostos informados após conferência.
