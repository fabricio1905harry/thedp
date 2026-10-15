# Respostas + implementação — Payment, Sync, Imagens, Dashboard/Action Center, WhatsApp, Stock Hold

Data: 15/10/2026 · Branch: `claude/brave-turing-ohw9o5`

Legenda: **SIM** = funciona assim no código desta branch · **PRECISA AJUSTAR** = parte feita, falta algo (descrito) · **NÃO** = não existe.
Observação importante: antes desta branch, vários itens abaixo **não** funcionavam como descrito (detalhado em "Como estava"). Tudo vale depois de aplicar as migrations `0024`–`0028` e fazer o deploy.

---

## Ajustes no PAYMENT

| # | Item | Status | Onde |
|---|------|--------|------|
| 1 | Disponibilidade: padrão por canal → exceção por cliente → exceção por pedido (mais específico prevalece) | **SIM** | `payment_method_rules` + `available_payment_methods()` (0025). Admin → Pagamentos (canal e cliente) e página do pedido (exceção do pedido). Padrão inicial: Stripe desligado no International B2B, Pix só nos canais Brasil — editável. |
| 2 | Bank Processing Fee **por pagamento** via Bank Transfer, valor em BRL no Admin convertido para a moeda do pedido | **SIM** | Trigger em `payments` (0025): cada transferência registrada recebe 1 taxa; Reserve + saldo por transferência = 2 taxas. Valor BRL e convertido ficam gravados no pagamento. |

Pendente fora destes ajustes: não existe integração Stripe nem tela de pagamento para o buyer (instruções de transferência / checkout de cartão). Hoje o pagamento é registrado e confirmado pela TDP no Admin.

---

## Pontos em aberto (SIM / NÃO / PRECISA AJUSTAR)

1. **Sync / alterações manuais — SIM.** Campo editado à mão vira "🔒 protegido" (`products.locked_fields`) e o sync não sobrescreve mais; os demais continuam sincronizando. Botão "Reset to source" por campo.
   *Como estava:* o ingest sobrescrevia todos os campos a cada sync (inclusive zerava o markup quando o n8n não mandava).
2. **Override de estoque por cor + tamanho — SIM.** Valor digitado na matriz vira override manual e prevalece sobre os syncs até "Reset to Source Stock/Availability" (0 = indisponível).
   *Dependência:* o n8n precisa enviar estoque por variante no payload: `variants: [{ size, color, stock }]`.
3. **Imagem nova em produto publicado — SIM.** Produto continua publicado com as aprovadas; a nova entra como PENDING REVIEW e não aparece no site.
   *Como estava:* o trigger apagava imagens que não vinham no array do fornecedor, o ingest recriava a galeria inteira e todo produto novo entrava publicado.
4. **OUT OF STOCK → catálogo — SIM**, com uma decisão para vocês: marcamos o estoque **da fonte** como 0, então se o próximo sync informar estoque a variante reabre sozinha (e gera Restock Opportunity). Se o feed do fornecedor puder vir desatualizado, a alternativa é bloquear via override manual até alguém liberar. **Qual preferem?** ORDER ONLY / OTHER REASON muda só o pedido.
5. **Alterar o pedido antes do Confirmed Order — PRECISA AJUSTAR.** Lado TDP: SIM — remover, adicionar, substituir (por SKU = produto + cor + tamanho), mudar quantidade, status por linha e "Generate Confirmed Order". Falta o lado buyer: tela para ele revisar/aprovar a composição e pagar (hoje ele vê o pedido e o status, mas não há botão de pagamento).
6. **Reserve for Later Delivery — SIM** no cálculo: custo total dos produtos + % configurável (padrão 10%), mostrado como % equivalente do valor de venda; a mercadoria só vira "Reserved" quando o pagamento do depósito é **confirmado**. Falta a escolha da modalidade pelo buyer (hoje a TDP liga no pedido).
7. **Precificação / arredondamento em 9 — NÃO.** A planilha não está no repositório nem chegou até mim; hoje o preço é custo + markup fixo em BRL, convertido pelo câmbio, sem arredondamento. **Preciso da planilha** (regras de markup por canal/categoria, em qual moeda arredonda e se é "x9" ou "x99").
8. **Câmbio diário + UPDATE FX NOW — SIM, sem problema nem custo técnico relevante.** É 1 chamada/dia a uma API gratuita (referência BCE via Frankfurter) e o recálculo dos preços já era automático. Implementado: cron diário, botão UPDATE FX NOW em Câmbio, entrada manual mantida; falha vira pendência no Action Center e sucesso vira só informação.
   *Decisão para vocês:* referência BCE ou PTAX/BCB? Aplicar algum spread? Lembrete: os preços em USD/EUR mudam todo dia junto com o câmbio.

---

## Imagens — viabilidade

Nada aqui é fora da curva. Feito nesta branch:

- Estados **PENDING REVIEW / APPROVED / HIDDEN / REJECTED** (+ `replaced` interno). Toda imagem de fornecedor entra pendente. O site mostra só as APPROVED.
- Admin (no produto e na fila **Imagens p/ revisar**): miniaturas, seleção múltipla, **APPROVE SELECTED / REJECT SELECTED**, aprovar/rejeitar individual, ocultar/reativar, **MAIN IMAGE/COVER**, reordenar, upload próprio (arquivo ou URL).
- **Publicação:** exige 1 aprovada + capa (trava no banco); pendentes não bloqueiam. Aprovar imagem nova não muda a capa.
- **Crop/ajuste 2:3:** editor manual (zoom + posição) que grava só as coordenadas — o arquivo original não é alterado. **Sem crop automático:** sem ajuste, a foto aparece inteira dentro do quadro 2:3 (os cards antes usavam 3:4 com corte, que podia cortar barra/cauda).
- **Replace mantendo vínculo SOURCE IMAGE → TDP VERSION:** a versão TDP herda posição/capa; a original fica como `replaced`, e o sync a reconhece como já tratada.
- **Memória das rejeitadas:** o sync nunca apaga linhas e compara pela "impressão digital" da URL; rejeitada nunca volta.
- **Duplicidade:** a mesma foto em resoluções diferentes (sufixos `-1200x1800`, `_large`, `?width=`, `@2x`…) vira uma só, mantendo a de melhor resolução.
- **Central de pendências:** card "Images to Review — N" que leva direto para a fila.

**Ainda não feito:**
- Detectar a mesma foto com **nomes de arquivo totalmente diferentes**: precisa de um worker que baixe a imagem e calcule um hash perceptual. É viável, só não é trivial.
- **Outros assets** (Featured Collection, Lookbook, TDP Edit, Brand Hero, About, Founders, Become a Brand): ainda não existe CMS para eles; o hero da home é arquivo estático. A proposta é uma tabela de "slots" com variantes Desktop/Mobile × EN/ES/PT e dimensões validadas por slot. Isso fica para a próxima etapa.

---

## Dashboard + Action Center — o que está contemplado

**Feito:**
- **Filtros:** período (Today / 7 / 30 / This Month / This Year / Custom) + canal + moeda de visualização. A conversão é só para visualização: cada pagamento guarda a própria cotação, então o histórico não muda.
- **KPIs:** todos os da lista, incluindo Chargebacks, Cancellations e Payment Method Mix (quantidade e valor).
  - **Comparação selecionável:** período anterior, mesmo período do ano anterior ou intervalo custom, com variação em %.
  - **Evolução mês a mês** de qualquer KPI (clique no KPI): 3 / 6 / 12 meses ou ano consolidado.
- **Regra do faturamento:** Revenue = só a mercadoria dos pagamentos **confirmados**, pela data da confirmação (Reserve 6k em maio + 4k em junho cai certo em cada mês).
  - Frete, seguro, surcharges DHL, duties, export declaration, bank fee e outras taxas ficam fora, mas aparecem abertos em "Operational charges collected" (Freight, Insurance, Fuel, Demand, Export Declaration, Other DHL, Duties & Taxes, Bank Fees, Other).
  - **Total Collected** fica separado.
- **Margem:** o primeiro pagamento confirmado reconhece 100% do custo do pedido e os seguintes só receita. Isso fica gravado por transação.
- **Outstanding Order Value com aging** 0–30 / 31–60 / 61–90 / 90+, clicável para ver os pedidos.
- **Lost Sales:** registro automático no OUT OF STOCK, com página completa e consolidação por Product / Brand / Color / Size / Produto + cor + tamanho (Lost Units, Value, # Buyers, # Orders, Restocks, Recovered Units/Revenue) e ranking.
  - **Restock Opportunity** é gerada automaticamente quando o sync traz estoque de volta.
  - Fluxo LOST → RESTOCK OPPORTUNITY → CONTACTED → RECOVERED / NOT RECOVERED, com Recovery Rate.
- **Gráficos:** Revenue over time (evolução), Sales by Channel, Funnel, Top Products / Brands / Customers, Sales by Country, Orders by Status.
- **Action Center:**
  - Cards clicáveis e fila única ACTION REQUIRED (Priority / Action / Reference / Customer-Product / Value / Waiting).
  - Prioridade pelos 6 grupos + CRITICAL acima de tudo; dentro do grupo, pesa valor, nº de buyers/pedidos e tempo de espera.
  - Ordenação System Priority / Highest Value / Oldest / Newest, e **PIN** manual.
  - As pendências fecham sozinhas quando a ação é feita (aprovar imagem, confirmar pagamento, avançar o pedido, preencher categoria/peso/HS…). "Mark as Resolved" só existe para tipos sem ação objetiva.
  - Information × Action: sync ok, câmbio ok e custo alterado com margem ok viram histórico (`system_events`); falhas viram pendência.
- **Regra geral:** a lista de tipos é uma tabela (`action_types`). Qualquer funcionalidade nova registra um tipo e chama `raise_action()` / `resolve_action()`.

**Precisa adaptação / depende de outros módulos:**
- **DHL Quote Required, DHL Errors, Export Documentation / NF:** os tipos existem, mas o fluxo de cotação/documentação DHL ainda não gera esses eventos. Vou ligar quando esse módulo for fechado.
- **Chargeback:** hoje a TDP marca o status manualmente. Automático só com o webhook do Stripe, quando houver Stripe.
- **"Shipping Charged vs Actual DHL Cost":** os valores cobrados já estão separados; falta gravar o custo real da DHL por envio.
- **Margin Below Target:** vem desligado até vocês definirem a meta % em Admin → Pagamentos.
- **Performance:** o dashboard calcula em memória e aguenta bem dezenas de milhares de pagamentos; acima disso, migramos para views SQL.

**Fora da curva tecnicamente?** Não. Os pontos mais pesados são integrações externas: Stripe, provedor de e-mail e o worker de hash perceptual de imagens.

---

## WhatsApp — **SIM**

- Botão flutuante em desktop e mobile.
- Admin → WhatsApp: ativo/inativo, número e mensagens General / Product / Order em EN / ES / PT.
- Contexto automático: na página de produto vai nome/código + URL; nas páginas de pedido, o número do pedido. Nenhum dado pessoal ou valor entra na mensagem.
- Evento `whatsapp_click` com página/origem, gravado no banco e enviado ao `dataLayer`/`gtag`, se existirem.

## Temporary Stock Hold — **SIM** (≠ Reserve Order)

- Ao gerar o Confirmed Order, a TDP escolhe 24h / 48h / Custom / Cannot Reserve. O prazo conta a partir da liberação e o buyer vê "Inventory Reserved Until …".
- **Expirou sem pagamento:**
  - status PAYMENT WINDOW EXPIRED e pagamento desabilitado;
  - o estoque deixa de contar como reservado e o pedido é mantido;
  - e-mail ao buyer **enfileirado**;
  - pendência EXPIRED UNPAID ORDER — FOLLOW-UP REQUIRED no Action Center.
- **Reserva impossível:** status AVAILABILITY CONFIRMED — PAYMENT COORDINATION REQUIRED, botão CONTACT US TO COMPLETE YOUR ORDER (WhatsApp) e pendência imediata no Action Center.
- **Reabrir:** depois de reconfirmar o estoque e recalcular, "reopen payment" define um novo prazo.
- **Dependências:** o cron horário (Vercel) precisa da variável `CRON_SECRET`, e o envio real de e-mails precisa de um provedor (Resend, SES…). Hoje o e-mail fica na fila `email_outbox`.

---

## Correções encontradas na análise

- **Segurança:** a página de pedido do buyer buscava o pedido só pelo ID usando service role, então qualquer usuário logado via pedidos de outros. Agora a busca filtra pelo dono.
- Admin → detalhe do pedido consultava colunas inexistentes (`quantity`, `price`).
- A lista de pedidos do Admin não tinha link para o detalhe.
- O checkout criava o pedido direto como "Em separação"; agora entra como **Order Request**.

## Para colocar no ar

1. `npm run db:migrate` (aplica 0024–0028). Ele faz backfill das imagens atuais como APPROVED, com a primeira de cada produto como capa, então nada some do site.
2. Variáveis na Vercel: `CRON_SECRET` (obrigatória para os crons) e, opcionalmente, `FX_API_URL`. Os crons ficam em `vercel.json`.
3. n8n: mandar `variants: [{size, color, stock}]` para o estoque por variante. Produtos novos passam a entrar como **draft**.
4. Admin → WhatsApp: ativar e informar o número.
5. Admin → Pagamentos: revisar os padrões por canal e a taxa (R$ 135).
