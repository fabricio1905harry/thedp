/**
 * pt-BR display labels for the Action Center. action_types.label and
 * action_items.title are stored in English by the SQL feeders (migrations
 * 0027 / 0029 / 0031) and src/lib/fx-auto.ts; the admin renders them in
 * Portuguese through these helpers.
 */

const ACTION_TYPE_LABELS_PT: Record<string, string> = {
  payments_to_verify: "Pagamentos a verificar",
  payment_difference: "Diferenças de pagamento",
  customer_approval: "Contas atacado pendentes",
  order_request: "Order Requests",
  stock_confirmation_pending: "Confirmação de estoque pendente",
  buyer_decision_pending: "Decisão/substituição do comprador pendente",
  payment_coordination_required: "Coordenação de pagamento necessária",
  expired_unpaid_order: "Pedidos expirados não pagos / follow-up necessário",
  contact_message: "Mensagens de contato",
  restock_opportunity: "Oportunidades de reposição",
  reserve_actions: "Ações de Reserve",
  ready_for_fulfillment: "Prontos para expedição",
  dhl_quote_required: "Cotação DHL necessária",
  dhl_shipping_actions: "DHL / ações de envio",
  dhl_errors: "Erros DHL",
  export_documentation_required: "Documentação de exportação / número da NF necessário",
  chargeback_cancellation: "Chargeback / cancelamentos",
  margin_below_target: "Margem abaixo da meta",
  sync_issues: "Problemas de sincronização",
  fx_update_failed: "Falha na atualização do câmbio",
  products_to_review: "Produtos para revisar",
  category_review_required: "Revisão de categoria necessária",
  shipping_data_required: "Dados de envio necessários",
  images_to_review: "Imagens para revisar",
  content_to_review: "Conteúdo para revisar",
  colors_to_review: "Cores para revisar",
  collection_low_stock: "Alerta de estoque da coleção",
  restock_demand: "Demanda de reposição (Avise-me)",
};

/** pt-BR label for an action type code; falls back to the stored label. */
export function actionTypeLabelPt(code: string, fallback: string): string {
  return ACTION_TYPE_LABELS_PT[code] ?? fallback;
}

const STATIC_TITLES_PT: Record<string, string> = {
  "New Order Request": "Nova Order Request",
  "Confirm stock with supplier": "Confirmar estoque com o fornecedor",
  "Waiting buyer decision / substitution": "Aguardando decisão / substituição do comprador",
  "PAYMENT COORDINATION REQUIRED — stock could not be held":
    "COORDENAÇÃO DE PAGAMENTO NECESSÁRIA — não foi possível segurar o estoque",
  "EXPIRED UNPAID ORDER — FOLLOW-UP REQUIRED": "PEDIDO EXPIRADO NÃO PAGO — FOLLOW-UP NECESSÁRIO",
  "Reserve confirmed — buy/commit goods with supplier": "Reserve confirmada — comprar/comprometer mercadoria com o fornecedor",
  "Paid — ready for fulfillment": "Pago — pronto para expedição",
  "Canceled order with confirmed payment — refund/credit decision":
    "Pedido cancelado com pagamento confirmado — decidir reembolso/crédito",
  "CHARGEBACK opened": "CHARGEBACK aberto",
  "Product waiting for review": "Produto aguardando revisão",
  "Category missing": "Categoria ausente",
  "Weight / HS code missing": "Peso / código HS ausente",
  "Waiting for more information from the applicant": "Aguardando mais informações do solicitante",
  "New wholesale account application": "Nova solicitação de conta atacado",
  "Inform freight & import duties (after stock confirmation)":
    "Informar frete e impostos de importação (após confirmação de estoque)",
  "HS code / weight / dimensions inherited from category — review":
    "NCM / peso / dimensões herdados da categoria — revisar",
};

const PAYMENT_METHODS_PT: Record<string, string> = {
  "bank transfer": "Bank Transfer",
  stripe: "Stripe",
};

const DYNAMIC_TITLES_PT: [RegExp, (...m: string[]) => string][] = [
  [/^Margin (.+)% \(target (.+)%\)$/, (_, m, t) => `Margem ${m}% (meta ${t}%)`],
  [/^(\d+) image\(s\) to review$/, (_, n) => `${n} imagem(ns) para revisar`],
  [
    /^Verify (.+) payment \((.+)\)$/,
    (_, method, kind) => `Verificar pagamento ${PAYMENT_METHODS_PT[method.toLowerCase()] ?? method} (${kind})`,
  ],
  [/^Received (\S+) vs expected (\S+) (\S+)$/, (_, r, e, c) => `Recebido ${r} vs esperado ${e} ${c}`],
  [
    /^(\d+) affected customer\(s\) · (\d+) lost unit\(s\) · source stock available$/,
    (_, b, u) => `${b} cliente(s) afetado(s) · ${u} unidade(s) perdida(s) · estoque disponível no fornecedor`,
  ],
  [/^Sync failed: (\d+) item\(s\) with errors$/, (_, n) => `Falha na sincronização: ${n} item(ns) com erro`],
  [/^(\d+) supplier color\(s\) to review$/, (_, n) => `${n} cor(es) do fornecedor para revisar`],
  [/^(\d+) buyer\(s\) waiting for restock$/, (_, n) => `${n} comprador(es) aguardando reposição`],
  [/^(.+): (\d+)\/(\d+) styles available \(minimum (\d+)\)$/, (_, name, a, t, m) => `${name}: ${a}/${t} estilos disponíveis (mínimo ${m})`],
  [/^New (.+) registration$/, (_, t) => `Novo cadastro ${t}`],
  [/^FX update failed: ([\s\S]*)$/, (_, msg) => `Falha na atualização do câmbio: ${msg}`],
];

/** pt-BR version of an action item title; unknown titles are returned unchanged. */
export function actionTitlePt(title: string): string {
  const fixed = STATIC_TITLES_PT[title];
  if (fixed) return fixed;
  for (const [re, fmt] of DYNAMIC_TITLES_PT) {
    const m = title.match(re);
    if (m) return fmt(...m);
  }
  return title;
}
