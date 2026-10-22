import { ALL_OPERATIONS, type BlockDef, type FieldDef } from "@/lib/cms-types";

/**
 * Editable blocks and their DEFAULT content (EN master + ES/PT drafts).
 * Source: "TDP EXP" — Home, About and Contact sections. Everything here can
 * be changed in Admin → Conteúdo do site without a developer.
 */

const t = (en: string, es: string, pt: string) => ({ en, es, pt });

const text = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: "text", translatable: true, hint });
const area = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: "textarea", translatable: true, hint });
const plain = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: "text", hint });
const url = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: "url", hint });
const image = (key: string, label: string, hint?: string): FieldDef => ({
  key,
  label,
  kind: "image",
  hint: hint ?? "Cole a URL de uma imagem ou um link do Google Drive (compartilhado como “qualquer pessoa com o link”), ou envie um arquivo.",
});

const INTL_B2B = ["intl_b2b" as const];

/** Drive photo supplied for the About page (shared publicly). */
export const ABOUT_PHOTO_DRIVE_URL = "https://drive.google.com/file/d/1WwgaqwUjNE8mWy84zrF6VhXuEc67peYA/view?usp=drivesdk";

/** Institutional text page: title, introduction and an ordered list of sections. */
function pageDef(key: string, label: string, sort: number): BlockDef {
  return {
    scope: "pages",
    key,
    label,
    description: "Deixe as seções vazias para mostrar o aviso de “conteúdo em preparação”. As seções aparecem na ordem da lista.",
    defaultActive: true,
    defaultSort: sort,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Título da página", "Deixe vazio para usar o título padrão."),
      area("intro", "Introdução"),
      {
        key: "sections",
        label: "Seções",
        kind: "list",
        itemLabel: "Seção",
        itemFields: [text("heading", "Subtítulo"), area("body", "Texto")],
      },
    ],
    defaults: { title: t("", "", ""), intro: t("", "", ""), sections: [] },
  };
}

export const BLOCK_DEFS: BlockDef[] = [
  // -------------------------------------------------------------- HOME
  {
    scope: "home",
    key: "hero",
    label: "Hero",
    description:
      "Banner principal. Sempre que possível, mantenha título, texto e CTA como texto (não dentro da imagem) para que idiomas, SEO e mobile se adaptem. Se a arte já traz o texto, deixe o título vazio e envie uma imagem por idioma.",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      image("desktop_image", "Imagem desktop"),
      image("mobile_image", "Imagem mobile"),
      text("alt", "Texto alternativo (alt)"),
      text("headline", "Título principal"),
      area("text", "Texto de apoio"),
      text("cta_text", "Texto do CTA"),
      url("cta_link", "Link do CTA"),
    ],
    defaults: {
      desktop_image: "/brand/banner-horizontal-1.png",
      mobile_image: "/brand/banner-vertical-mobile.png",
      alt: t(
        "The Dressing Project — ready to ship, express worldwide wholesale",
        "The Dressing Project — listo para enviar, mayorista exprés a todo el mundo",
        "The Dressing Project — pronta entrega, atacado expresso para o mundo"
      ),
      headline: t("", "", ""),
      text: t("", "", ""),
      cta_text: t("Create a wholesale account", "Crear una cuenta mayorista", "Criar conta de atacado"),
      cta_link: "/cadastro",
    },
  },
  {
    scope: "home",
    key: "institutional_banner",
    label: "Banner institucional",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("headline", "Título principal"), text("subheadline", "Subtítulo")],
    defaults: {
      headline: t("THE DRESSING PROJECT", "THE DRESSING PROJECT", "THE DRESSING PROJECT"),
      subheadline: t(
        "A new way to source Brazilian fashion",
        "Una nueva forma de abastecerse de moda brasileña",
        "Uma nova forma de abastecer sua loja com moda brasileira"
      ),
    },
  },
  {
    scope: "home",
    key: "ready_to_ship",
    label: "Pronta entrega — posicionamento",
    description: "A primeira coisa que o comprador deve entender: estoque de pronta entrega, confirmado antes do pagamento.",
    defaultActive: true,
    defaultSort: 30,
    defaultOperations: INTL_B2B,
    fields: [
      {
        key: "items",
        label: "Destaques",
        kind: "list",
        itemLabel: "Destaque",
        itemFields: [text("text", "Texto")],
      },
    ],
    defaults: {
      items: [
        { text: t("Ready to ship", "Listo para enviar", "Pronta entrega") },
        {
          text: t(
            "Availability confirmed before payment",
            "Disponibilidad confirmada antes del pago",
            "Disponibilidade confirmada antes do pagamento"
          ),
        },
        { text: t("Express worldwide wholesale", "Mayorista exprés a todo el mundo", "Atacado expresso para o mundo") },
        { text: t("No minimum opening order", "Sin pedido mínimo de apertura", "Sem pedido mínimo de abertura") },
      ],
    },
  },
  {
    scope: "home",
    key: "how_it_works",
    label: "Como funciona",
    defaultActive: true,
    defaultSort: 40,
    defaultOperations: INTL_B2B,
    fields: [
      text("title", "Título"),
      area("intro", "Introdução"),
      {
        key: "steps",
        label: "Etapas",
        kind: "list",
        itemLabel: "Etapa",
        itemFields: [text("title", "Título"), area("text", "Texto")],
      },
      text("payment_note", "Linha de formas de pagamento"),
      area("reserve_note", "Texto de reserva / entrega posterior"),
      text("reserve_cta", "Texto do “Saiba mais”"),
    ],
    defaults: {
      title: t("How it works", "Cómo funciona", "Como funciona"),
      intro: t(
        "Our selection is sourced from existing ready-to-ship inventory. Because availability moves quickly, we confirm each order before payment. When inventory reservation is available, the reservation period will be clearly indicated in your confirmed order.",
        "Nuestra selección proviene de inventario existente listo para enviar. Como la disponibilidad cambia rápido, confirmamos cada pedido antes del pago. Cuando es posible reservar el inventario, el período de reserva se indicará claramente en tu pedido confirmado.",
        "Nossa seleção vem de estoque existente de pronta entrega. Como a disponibilidade muda rápido, confirmamos cada pedido antes do pagamento. Quando for possível reservar o estoque, o prazo da reserva será indicado claramente no seu pedido confirmado."
      ),
      steps: [
        {
          title: t("You choose", "Tú eliges", "Você escolhe"),
          text: t(
            "Explore our ready-to-ship selection and submit your order request.",
            "Explora nuestra selección lista para enviar y envía tu solicitud de pedido.",
            "Explore nossa seleção de pronta entrega e envie seu pedido."
          ),
        },
        {
          title: t("We confirm", "Nosotros confirmamos", "Nós confirmamos"),
          text: t(
            "We confirm the availability of each item before payment.",
            "Confirmamos la disponibilidad de cada artículo antes del pago.",
            "Confirmamos a disponibilidade de cada item antes do pagamento."
          ),
        },
        {
          title: t("You review", "Tú revisas", "Você revisa"),
          text: t(
            "Review your confirmed order, including final quantities, shipping and applicable duties and taxes.",
            "Revisa tu pedido confirmado, con cantidades finales, envío e impuestos y aranceles aplicables.",
            "Revise seu pedido confirmado, com quantidades finais, frete e impostos e taxas aplicáveis."
          ),
        },
        {
          title: t("Pay & ship", "Paga y enviamos", "Pague e enviamos"),
          text: t(
            "Complete payment using the available payment methods and we take care of international shipping.",
            "Completa el pago con los métodos disponibles y nosotros nos encargamos del envío internacional.",
            "Conclua o pagamento pelos métodos disponíveis e nós cuidamos do envio internacional."
          ),
        },
      ],
      payment_note: t(
        "Payment methods may include bank transfer and credit card, when available.",
        "Los métodos de pago pueden incluir transferencia bancaria y tarjeta de crédito, cuando estén disponibles.",
        "Os métodos de pagamento podem incluir transferência bancária e cartão de crédito, quando disponíveis."
      ),
      reserve_note: t(
        "When available, confirmed inventory may be temporarily reserved while you complete payment. Reservation details will be shown in your confirmed order. Need the styles later? Reserve confirmed inventory now and schedule delivery when you're ready.",
        "Cuando es posible, el inventario confirmado puede reservarse temporalmente mientras completas el pago. Los detalles de la reserva se mostrarán en tu pedido confirmado. ¿Necesitas los modelos más adelante? Reserva el inventario confirmado ahora y programa la entrega cuando estés listo.",
        "Quando possível, o estoque confirmado pode ser reservado temporariamente enquanto você conclui o pagamento. Os detalhes da reserva aparecerão no seu pedido confirmado. Precisa dos modelos mais tarde? Reserve o estoque confirmado agora e programe a entrega quando quiser."
      ),
      reserve_cta: t("Learn more", "Saber más", "Saiba mais"),
    },
  },
  {
    scope: "home",
    key: "start_small",
    label: "Comece pequeno",
    defaultActive: true,
    defaultSort: 50,
    defaultOperations: INTL_B2B,
    fields: [text("headline", "Título principal"), area("text", "Texto")],
    defaults: {
      headline: t(
        "START SMALL. DISCOVER WHAT SELLS.",
        "EMPIEZA CON POCO. DESCUBRE LO QUE SE VENDE.",
        "COMECE PEQUENO. DESCUBRA O QUE VENDE."
      ),
      text: t(
        "No minimum opening order. Start with a smaller selection, experience the product and our service, and build your next orders from there.",
        "Sin pedido mínimo de apertura. Empieza con una selección más pequeña, conoce el producto y nuestro servicio, y construye tus próximos pedidos a partir de ahí.",
        "Sem pedido mínimo de abertura. Comece com uma seleção menor, conheça o produto e o nosso serviço e construa seus próximos pedidos a partir daí."
      ),
    },
  },
  {
    scope: "home",
    key: "best_sellers",
    label: "Mais vendidos",
    description:
      "Automático = ranking de vendas de todos os tempos entre produtos com estoque disponível agora (produtos sem estoque saem do módulo sozinhos). Manual = você escolhe e ordena os produtos.",
    defaultActive: true,
    defaultSort: 60,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Título"),
      {
        key: "mode",
        label: "Modo",
        kind: "select",
        options: [
          { value: "automatic", label: "Automático" },
          { value: "manual", label: "Manual" },
        ],
      },
      { key: "count", label: "Quantidade de produtos", kind: "number" },
      { key: "slugs", label: "Produtos (modo manual) — um slug por linha, na ordem de exibição", kind: "slugs" },
      text("cta_text", "Texto do “Ver tudo”"),
      url("cta_link", "Link do “Ver tudo”"),
    ],
    defaults: {
      title: t("Best sellers", "Más vendidos", "Mais vendidos"),
      mode: "automatic",
      count: 6,
      slugs: [],
      cta_text: t("View all", "Ver todo", "Ver tudo"),
      cta_link: "/shop",
    },
  },
  {
    scope: "home",
    key: "featured_products",
    label: "Produtos em destaque",
    description: "Produtos escolhidos manualmente (slug = o endereço do produto, mostrado em Admin → Produtos).",
    defaultActive: true,
    defaultSort: 70,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Título"),
      { key: "count", label: "Quantidade de produtos", kind: "number" },
      { key: "slugs", label: "Produtos — um slug por linha, na ordem de exibição", kind: "slugs" },
    ],
    defaults: {
      title: t("Featured products", "Productos destacados", "Produtos em destaque"),
      count: 6,
      slugs: [],
    },
  },
  // ---- Catalog phase 2 modules (hide themselves while there is nothing active to show)
  {
    scope: "home",
    key: "featured_brands",
    label: "Marcas em destaque",
    description: "Mostra as marcas marcadas como “destaque” em Admin → Marcas. O módulo some sozinho se não houver marcas ativas em destaque.",
    defaultActive: true,
    defaultSort: 72,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Título"),
      { key: "count", label: "Quantidade de marcas", kind: "number" },
      text("cta_text", "Texto do “Ver tudo”"),
      url("cta_link", "Link do “Ver tudo”"),
    ],
    defaults: {
      title: t("Featured brands", "Marcas destacadas", "Marcas em destaque"),
      count: 4,
      cta_text: t("View all brands", "Ver todas las marcas", "Ver todas as marcas"),
      cta_link: "/marcas",
    },
  },
  {
    scope: "home",
    key: "featured_collection",
    label: "Coleção em destaque",
    description: "Mostra uma coleção com seus produtos. Deixe o slug vazio para usar a primeira coleção ativa marcada como destaque.",
    defaultActive: true,
    defaultSort: 74,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Título (vazio = título da coleção)"),
      plain("slug", "Slug da coleção (opcional)"),
      { key: "count", label: "Quantidade de produtos", kind: "number" },
      text("cta_text", "Texto do CTA"),
    ],
    defaults: {
      title: t("", "", ""),
      slug: "",
      count: 6,
      cta_text: t("View collection", "Ver colección", "Ver coleção"),
    },
  },
  {
    scope: "home",
    key: "featured_lookbooks",
    label: "Lookbooks (Shop the look)",
    description: "Mostra os lookbooks marcados como “destaque” em Admin → Lookbooks.",
    defaultActive: true,
    defaultSort: 76,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Título"),
      { key: "count", label: "Quantidade de lookbooks", kind: "number" },
      text("cta_text", "Texto do “Ver tudo”"),
      url("cta_link", "Link do “Ver tudo”"),
    ],
    defaults: {
      title: t("Shop the look", "Compra el look", "Shop the look"),
      count: 3,
      cta_text: t("All lookbooks", "Todos los lookbooks", "Todos os lookbooks"),
      cta_link: "/lookbooks",
    },
  },
  {
    scope: "home",
    key: "tdp_edits",
    label: "TDP Edits",
    description: "Mostra os edits editoriais marcados como “destaque” em Admin → Edits.",
    defaultActive: true,
    defaultSort: 78,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Título"),
      { key: "count", label: "Quantidade de edits", kind: "number" },
      text("cta_text", "Texto do “Ver tudo”"),
      url("cta_link", "Link do “Ver tudo”"),
    ],
    defaults: {
      title: t("TDP Edits", "TDP Edits", "TDP Edits"),
      count: 3,
      cta_text: t("All edits", "Todos los edits", "Todos os edits"),
      cta_link: "/edits",
    },
  },
  {
    scope: "home",
    key: "featured_video",
    label: "Vídeo em destaque / filme de campanha",
    defaultActive: false,
    defaultSort: 80,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Título"),
      area("text", "Texto de apoio"),
      url("video_url", "URL do vídeo (YouTube, Vimeo ou um .mp4 direto)"),
      image("thumbnail_desktop", "Miniatura — desktop"),
      image("thumbnail_mobile", "Miniatura — mobile"),
      text("cta_text", "Texto do CTA"),
      url("cta_link", "Link do CTA"),
    ],
    defaults: {
      title: t("", "", ""),
      text: t("", "", ""),
      video_url: "",
      thumbnail_desktop: "",
      thumbnail_mobile: "",
      cta_text: t("", "", ""),
      cta_link: "",
    },
  },
  {
    scope: "home",
    key: "become_a_brand",
    label: "Seja uma marca parceira",
    defaultActive: true,
    defaultSort: 90,
    defaultOperations: INTL_B2B,
    fields: [text("title", "Título"), area("text", "Texto"), text("cta_text", "Texto do CTA"), url("cta_link", "Link do CTA")],
    defaults: {
      title: t(
        "Interested in joining The Dressing Project?",
        "¿Te interesa unirte a The Dressing Project?",
        "Quer fazer parte da The Dressing Project?"
      ),
      text: t(
        "Explore distribution and commercial opportunities with us.",
        "Explora oportunidades de distribución y comerciales con nosotros.",
        "Conheça oportunidades de distribuição e comerciais conosco."
      ),
      cta_text: t("BECOME A BRAND", "SER UNA MARCA", "SER UMA MARCA"),
      cta_link: "/contato?subject=brand",
    },
  },

  // ------------------------------------------------------------- ABOUT
  {
    scope: "about",
    key: "hero",
    label: "Sobre — Hero",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ALL_OPERATIONS,
    fields: [image("image", "Foto"), text("title", "Título"), area("intro", "Introdução")],
    defaults: {
      image: ABOUT_PHOTO_DRIVE_URL,
      title: t("The Dressing Project", "The Dressing Project", "The Dressing Project"),
      intro: t(
        "A fashion distribution platform built on almost 10 years of experience in fashion, physical and digital retail, and international trade fairs.",
        "Una plataforma de distribución de moda construida sobre casi 10 años de experiencia en moda, comercio físico y digital y ferias internacionales.",
        "Uma plataforma de distribuição de moda construída sobre quase 10 anos de experiência em moda, varejo físico e digital e feiras internacionais."
      ),
    },
  },
  {
    scope: "about",
    key: "history",
    label: "Sobre — nossa história",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("title", "Título"), area("text", "Texto")],
    defaults: {
      title: t("Our story", "Nuestra historia", "Nossa história"),
      text: t(
        "The Dressing Project is approaching 10 years in the fashion market, with a physical and digital operation and a real track record of selling fashion.",
        "The Dressing Project está cerca de cumplir 10 años en el mercado de la moda, con operación física y digital y un historial real de venta de moda.",
        "A The Dressing Project está chegando aos 10 anos no mercado de moda, com operação física e digital e histórico real de venda de moda."
      ),
    },
  },
  {
    scope: "about",
    key: "journey",
    label: "Sobre — nossa trajetória (linha do tempo)",
    description: "Adicione, remova e reordene os marcos. As datas são opcionais.",
    defaultActive: true,
    defaultSort: 30,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Título"),
      {
        key: "items",
        label: "Marcos",
        kind: "list",
        itemLabel: "Marco",
        itemFields: [plain("year", "Data / ano (opcional)"), text("title", "Título"), area("text", "Texto"), image("image", "Imagem (opcional)")],
      },
    ],
    defaults: {
      title: t("Our journey", "Nuestro recorrido", "Nossa trajetória"),
      items: [
        {
          year: "",
          title: t("Fairs and events", "Ferias y eventos", "Feiras e eventos"),
          text: t(
            "Presence at industry events and fairs, including Paris Fashion Week and Casar, and experience in international trade fairs.",
            "Presencia en eventos y ferias del sector, incluidos Paris Fashion Week y Casar, y experiencia en ferias internacionales.",
            "Presença em eventos e feiras do setor, incluindo Paris Fashion Week e Casar, e experiência em feiras internacionais."
          ),
          image: "",
        },
        {
          year: "",
          title: t("International operation", "Operación internacional", "Operação internacional"),
          text: t(
            "The start of our international operation.",
            "El inicio de nuestra operación internacional.",
            "O início da nossa operação internacional."
          ),
          image: "",
        },
        {
          year: "",
          title: t("A fashion distribution platform", "Una plataforma de distribución de moda", "Uma plataforma de distribuição de moda"),
          text: t(
            "The evolution of The Dressing Project into a fashion distribution platform.",
            "La evolución de The Dressing Project hacia una plataforma de distribución de moda.",
            "A evolução da The Dressing Project para uma plataforma de distribuição de moda."
          ),
          image: "",
        },
      ],
    },
  },
  {
    scope: "about",
    key: "vision",
    label: "Sobre — nossa visão",
    defaultActive: true,
    defaultSort: 40,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("title", "Título"), area("text", "Texto")],
    defaults: {
      title: t("Our vision", "Nuestra visión", "Nossa visão"),
      text: t(
        "To evolve The Dressing Project into a fashion distribution platform and digital showroom, connecting products and brands to national and international markets.",
        "Evolucionar The Dressing Project hacia una plataforma de distribución y showroom digital de moda, conectando productos y marcas con los mercados nacional e internacional.",
        "Evoluir a The Dressing Project para uma plataforma de distribuição e showroom digital de moda, conectando produtos e marcas aos mercados nacional e internacional."
      ),
    },
  },
  {
    scope: "about",
    key: "founders",
    label: "Sobre — conheça os fundadores",
    description: "Textos provisórios baseados no briefing — revise e substitua pelas biografias finais.",
    defaultActive: true,
    defaultSort: 50,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Título"),
      {
        key: "people",
        label: "Pessoas",
        kind: "list",
        itemLabel: "Pessoa",
        itemFields: [plain("name", "Nome"), text("role", "Cargo"), area("bio", "Mini biografia"), image("photo", "Foto (opcional)")],
      },
    ],
    defaults: {
      title: t("Meet the founders", "Conoce a los fundadores", "Conheça os fundadores"),
      people: [
        {
          name: "Marcela Paoliello",
          role: t("Founder & Fashion Director", "Fundadora y Directora de Moda", "Fundadora e Diretora de Moda"),
          bio: t(
            "Founder and fashion director of The Dressing Project. Her path in fashion, her product curation and her creative and commercial vision shape the platform.",
            "Fundadora y directora de moda de The Dressing Project. Su trayectoria en la moda, su curaduría de producto y su visión creativa y comercial dan forma a la plataforma.",
            "Fundadora e diretora de moda da The Dressing Project. Sua trajetória na moda, sua curadoria de produto e sua visão criativa e comercial dão forma à plataforma."
          ),
          photo: "",
        },
        {
          name: "Ricardo Affonso",
          role: t("Co-Founder & Business Strategy", "Cofundador y Estrategia de Negocio", "Cofundador e Estratégia de Negócio"),
          bio: t(
            "Co-founder responsible for the strategic development of the business, with more than 19 years of experience in finance, strategic planning, e-commerce and business performance.",
            "Cofundador responsable del desarrollo estratégico del negocio, con más de 19 años de experiencia en finanzas, planificación estratégica, e-commerce y desempeño de negocios.",
            "Cofundador responsável pelo desenvolvimento estratégico do negócio, com mais de 19 anos de experiência em finanças, planejamento estratégico, e-commerce e performance de negócios."
          ),
          photo: "",
        },
      ],
    },
  },
  {
    scope: "about",
    key: "film",
    label: "Sobre — filme institucional",
    description: "Filme principal de cerca de 45–60 segundos.",
    defaultActive: false,
    defaultSort: 60,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("title", "Título"), url("video_url", "URL do vídeo (YouTube, Vimeo ou um .mp4 direto)"), image("poster", "Imagem de capa (poster)")],
    defaults: {
      title: t("Institutional film", "Película institucional", "Filme institucional"),
      video_url: "",
      poster: "",
    },
  },

  // ----------------------------------------------------------- CONTACT
  {
    scope: "contact",
    key: "intro",
    label: "Contato — introdução e canais",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Título"),
      area("text", "Introdução"),
      plain("whatsapp", "Número ou link do WhatsApp", "Deixe vazio para usar o número de Admin → WhatsApp."),
      plain("email", "E-mail de contato"),
      area("extra", "Informações de contato adicionais (opcional)"),
    ],
    defaults: {
      title: t("Get in touch", "Ponte en contacto", "Fale conosco"),
      text: t(
        "Our team is available to assist with wholesale accounts, orders, products, shipping and general inquiries.",
        "Nuestro equipo está disponible para ayudarte con cuentas mayoristas, pedidos, productos, envíos y consultas generales.",
        "Nossa equipe está disponível para ajudar com contas de atacado, pedidos, produtos, envio e dúvidas em geral."
      ),
      whatsapp: "",
      email: "",
      extra: t("", "", ""),
    },
  },
  {
    scope: "contact",
    key: "form",
    label: "Contato — formulário",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Título do formulário"),
      {
        key: "subjects",
        label: "Opções de assunto",
        kind: "list",
        itemLabel: "Assunto",
        itemFields: [plain("value", "Código (sem espaços, ex.: brand)"), text("label", "Rótulo")],
      },
    ],
    defaults: {
      title: t("Send us a message", "Envíanos un mensaje", "Envie uma mensagem"),
      subjects: [
        { value: "wholesale", label: t("Wholesale Account", "Cuenta mayorista", "Conta de atacado") },
        { value: "order", label: t("Order Support", "Soporte de pedidos", "Suporte de pedidos") },
        { value: "product", label: t("Product Information", "Información de producto", "Informações de produto") },
        { value: "shipping", label: t("Shipping & Duties", "Envío e impuestos", "Frete e impostos") },
        { value: "payments", label: t("Payments", "Pagos", "Pagamentos") },
        { value: "brand", label: t("Brand Partnership", "Alianza de marca", "Parceria de marca") },
        { value: "other", label: t("Other", "Otro", "Outro") },
      ],
    },
  },
  {
    scope: "contact",
    key: "wholesale_cta",
    label: "Contato — CTA de conta de atacado",
    defaultActive: true,
    defaultSort: 30,
    defaultOperations: INTL_B2B,
    fields: [area("text", "Texto"), text("cta_text", "Texto do botão"), url("cta_link", "Link do botão")],
    defaults: {
      text: t(
        "Interested in accessing wholesale pricing and placing orders?",
        "¿Te interesa acceder a precios mayoristas y hacer pedidos?",
        "Quer acessar os preços de atacado e fazer pedidos?"
      ),
      cta_text: t("CREATE A WHOLESALE ACCOUNT", "CREAR UNA CUENTA MAYORISTA", "CRIAR CONTA DE ATACADO"),
      cta_link: "/cadastro",
    },
  },
  {
    scope: "contact",
    key: "brand_cta",
    label: "Contato — CTA de marcas / parcerias",
    defaultActive: true,
    defaultSort: 40,
    defaultOperations: INTL_B2B,
    fields: [area("text", "Texto"), text("cta_text", "Texto do botão"), url("cta_link", "Link do botão")],
    defaults: {
      text: t(
        "Interested in joining The Dressing Project or exploring distribution and commercial opportunities with us?",
        "¿Te interesa unirte a The Dressing Project o explorar oportunidades de distribución y comerciales con nosotros?",
        "Quer fazer parte da The Dressing Project ou conhecer oportunidades de distribuição e comerciais conosco?"
      ),
      cta_text: t("BECOME A BRAND", "SER UNA MARCA", "SER UMA MARCA"),
      cta_link: "/contato?subject=brand",
    },
  },
  // -------------------------------------------------------------- SITE
  {
    scope: "site",
    key: "announcement",
    label: "Barra de anúncio no topo (site internacional)",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ["intl_b2b", "intl_b2c"],
    fields: [text("text", "Texto", "Deixe vazio para usar o texto padrão."), url("link", "Link (opcional)")],
    defaults: { text: t("", "", ""), link: "" },
  },
  {
    scope: "site",
    key: "national_notice",
    label: "Barra de aviso no topo (site nacional)",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ["br_b2b", "br_b2c"],
    fields: [text("text", "Texto", "Deixe vazio para usar o texto padrão."), url("link", "Link (opcional)")],
    defaults: { text: t("", "", ""), link: "" },
  },

  // ------------------------------------------------------------- PAGES
  pageDef("faq", "FAQ", 10),
  pageDef("terms", "Termos de uso", 20),
  pageDef("privacy", "Política de privacidade", 30),
  pageDef("returns", "Trocas e devoluções", 40),
];

export function getBlockDef(scope: string, key: string): BlockDef | undefined {
  return BLOCK_DEFS.find((b) => b.scope === scope && b.key === key);
}

export const CMS_SCOPE_LABELS: Record<string, string> = {
  home: "Home",
  about: "Sobre",
  contact: "Contato",
  site: "Barras do site",
  pages: "Páginas (FAQ, termos…)",
};
