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
  hint: hint ?? "Paste an image URL or a Google Drive link (shared as “anyone with the link”), or upload a file.",
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
    description: "Leave sections empty to show the “content being prepared” notice. Sections are shown in the order listed.",
    defaultActive: true,
    defaultSort: sort,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Page title", "Leave empty to use the standard title."),
      area("intro", "Introduction"),
      {
        key: "sections",
        label: "Sections",
        kind: "list",
        itemLabel: "Section",
        itemFields: [text("heading", "Heading"), area("body", "Text")],
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
      "Main banner. When possible keep headline, text and CTA as text (not inside the image) so languages, SEO and mobile adapt. If the artwork already carries the text, leave the headline empty and upload one image per language.",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      image("desktop_image", "Desktop image"),
      image("mobile_image", "Mobile image"),
      text("alt", "Alt text"),
      text("headline", "Headline"),
      area("text", "Supporting text"),
      text("cta_text", "CTA text"),
      url("cta_link", "CTA link"),
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
    label: "Institutional banner",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("headline", "Headline"), text("subheadline", "Subheadline")],
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
    label: "Ready to Ship — positioning",
    description: "The first thing the buyer should understand: ready-to-ship stock, confirmed before payment.",
    defaultActive: true,
    defaultSort: 30,
    defaultOperations: INTL_B2B,
    fields: [
      {
        key: "items",
        label: "Highlights",
        kind: "list",
        itemLabel: "Highlight",
        itemFields: [text("text", "Text")],
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
    label: "How it works",
    defaultActive: true,
    defaultSort: 40,
    defaultOperations: INTL_B2B,
    fields: [
      text("title", "Title"),
      area("intro", "Intro"),
      {
        key: "steps",
        label: "Steps",
        kind: "list",
        itemLabel: "Step",
        itemFields: [text("title", "Title"), area("text", "Text")],
      },
      text("payment_note", "Payment methods line"),
      area("reserve_note", "Reservation / later delivery text"),
      text("reserve_cta", "“Learn more” label"),
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
    label: "Start small",
    defaultActive: true,
    defaultSort: 50,
    defaultOperations: INTL_B2B,
    fields: [text("headline", "Headline"), area("text", "Text")],
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
    label: "Best sellers",
    description:
      "Automatic = all-time sales ranking among products with stock available now (products without stock leave the module on their own). Manual = you choose and order the products.",
    defaultActive: true,
    defaultSort: 60,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Title"),
      {
        key: "mode",
        label: "Mode",
        kind: "select",
        options: [
          { value: "automatic", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ],
      },
      { key: "count", label: "Number of products", kind: "number" },
      { key: "slugs", label: "Products (manual mode) — one slug per line, in display order", kind: "slugs" },
      text("cta_text", "“View all” label"),
      url("cta_link", "“View all” link"),
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
    label: "Featured products",
    description: "Manually selected products (slug = the product address, shown in Admin → Produtos).",
    defaultActive: true,
    defaultSort: 70,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Title"),
      { key: "count", label: "Number of products", kind: "number" },
      { key: "slugs", label: "Products — one slug per line, in display order", kind: "slugs" },
    ],
    defaults: {
      title: t("Featured products", "Productos destacados", "Produtos em destaque"),
      count: 6,
      slugs: [],
    },
  },
  {
    scope: "home",
    key: "featured_video",
    label: "Featured video / campaign film",
    defaultActive: false,
    defaultSort: 80,
    defaultOperations: ALL_OPERATIONS,
    placement: true,
    fields: [
      text("title", "Title"),
      area("text", "Supporting text"),
      url("video_url", "Video URL (YouTube, Vimeo or a direct .mp4)"),
      image("thumbnail_desktop", "Thumbnail — desktop"),
      image("thumbnail_mobile", "Thumbnail — mobile"),
      text("cta_text", "CTA text"),
      url("cta_link", "CTA link"),
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
    label: "Become a brand",
    defaultActive: true,
    defaultSort: 90,
    defaultOperations: INTL_B2B,
    fields: [text("title", "Title"), area("text", "Text"), text("cta_text", "CTA text"), url("cta_link", "CTA link")],
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
    label: "About — hero",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ALL_OPERATIONS,
    fields: [image("image", "Photo"), text("title", "Title"), area("intro", "Introduction")],
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
    label: "About — our story",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("title", "Title"), area("text", "Text")],
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
    label: "About — our journey (timeline)",
    description: "Add, remove and reorder milestones. Dates are optional.",
    defaultActive: true,
    defaultSort: 30,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Title"),
      {
        key: "items",
        label: "Milestones",
        kind: "list",
        itemLabel: "Milestone",
        itemFields: [plain("year", "Date / year (optional)"), text("title", "Title"), area("text", "Text"), image("image", "Image (optional)")],
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
    label: "About — our vision",
    defaultActive: true,
    defaultSort: 40,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("title", "Title"), area("text", "Text")],
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
    label: "About — meet the founders",
    description: "Draft texts based on the brief — review and replace with the final bios.",
    defaultActive: true,
    defaultSort: 50,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Title"),
      {
        key: "people",
        label: "People",
        kind: "list",
        itemLabel: "Person",
        itemFields: [plain("name", "Name"), text("role", "Role"), area("bio", "Short bio"), image("photo", "Photo (optional)")],
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
    label: "About — institutional film",
    description: "Master film of about 45–60 seconds.",
    defaultActive: false,
    defaultSort: 60,
    defaultOperations: ALL_OPERATIONS,
    fields: [text("title", "Title"), url("video_url", "Video URL (YouTube, Vimeo or a direct .mp4)"), image("poster", "Poster image")],
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
    label: "Contact — introduction and channels",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Title"),
      area("text", "Introduction"),
      plain("whatsapp", "WhatsApp number or link", "Leave empty to use the number from Admin → WhatsApp."),
      plain("email", "Contact e-mail"),
      area("extra", "Additional contact information (optional)"),
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
    label: "Contact — form",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ALL_OPERATIONS,
    fields: [
      text("title", "Form title"),
      {
        key: "subjects",
        label: "Subject options",
        kind: "list",
        itemLabel: "Subject",
        itemFields: [plain("value", "Code (no spaces, e.g. brand)"), text("label", "Label")],
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
    label: "Contact — wholesale account CTA",
    defaultActive: true,
    defaultSort: 30,
    defaultOperations: INTL_B2B,
    fields: [area("text", "Text"), text("cta_text", "Button text"), url("cta_link", "Button link")],
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
    label: "Contact — brands / partnerships CTA",
    defaultActive: true,
    defaultSort: 40,
    defaultOperations: INTL_B2B,
    fields: [area("text", "Text"), text("cta_text", "Button text"), url("cta_link", "Button link")],
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
    label: "Top announcement bar (international site)",
    defaultActive: true,
    defaultSort: 10,
    defaultOperations: ["intl_b2b", "intl_b2c"],
    fields: [text("text", "Text", "Leave empty to use the standard text."), url("link", "Link (optional)")],
    defaults: { text: t("", "", ""), link: "" },
  },
  {
    scope: "site",
    key: "national_notice",
    label: "Top notice bar (national site)",
    defaultActive: true,
    defaultSort: 20,
    defaultOperations: ["br_b2b", "br_b2c"],
    fields: [text("text", "Text", "Leave empty to use the standard text."), url("link", "Link (optional)")],
    defaults: { text: t("", "", ""), link: "" },
  },

  // ------------------------------------------------------------- PAGES
  pageDef("faq", "FAQ", 10),
  pageDef("terms", "Terms of use", 20),
  pageDef("privacy", "Privacy policy", 30),
  pageDef("returns", "Exchanges and returns", 40),
];

export function getBlockDef(scope: string, key: string): BlockDef | undefined {
  return BLOCK_DEFS.find((b) => b.scope === scope && b.key === key);
}

export const CMS_SCOPE_LABELS: Record<string, string> = {
  home: "Home",
  about: "About",
  contact: "Contact",
  site: "Site bars",
  pages: "Pages (FAQ, terms…)",
};
