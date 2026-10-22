import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getColorResolver } from "@/lib/colors";
import { Link } from "@/i18n/navigation";
import { getShopCatalog, type ShopProduct } from "@/lib/catalog";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { ProductCard } from "@/components/product-card";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";

type SP = { category?: string; size?: string; color?: string; sort?: string; new?: string; min?: string; max?: string };

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const NEW_IN_DAYS = 30;

function daysAgoMs(days: number) {
  return Date.now() - days * 86400000;
}

function sizeRank(size: string) {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  if (i >= 0) return i;
  const n = parseFloat(size);
  return Number.isNaN(n) ? 999 : 100 + n;
}

function priceOf(p: ShopProduct) {
  return p.pricing?.priceUsd ?? p.pricing?.priceEur ?? p.pricing?.priceBrl ?? null;
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = await getTranslations("shop");
  const locale = await getLocale();
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);
  const catalog = await getShopCatalog(approved);

  const categories = [...new Set(catalog.map((p) => p.category).filter(Boolean) as string[])].sort();
  const sizes = [...new Set(catalog.flatMap((p) => p.sizes))].sort((a, b) => sizeRank(a) - sizeRank(b));
  // Filter uses the normalized TDP colors (named in the buyer's language); unmapped supplier colors are not listed.
  const colorResolver = await getColorResolver(locale);
  const presentColors = new Set(catalog.flatMap((p) => p.colors));
  const colors = colorResolver.options.filter((c) => presentColors.has(c.id));

  const min = sp.min ? Number(sp.min) : null;
  const max = sp.max ? Number(sp.max) : null;
  const cutoff = daysAgoMs(NEW_IN_DAYS);

  let products = catalog.filter(
    (p) =>
      (!sp.category || p.category?.toLowerCase() === sp.category.toLowerCase()) &&
      (!sp.size || p.sizes.includes(sp.size)) &&
      (!sp.color || p.colors.includes(sp.color)) &&
      (sp.new !== "1" || new Date(p.createdAt).getTime() >= cutoff) &&
      (!approved || min === null || (priceOf(p) ?? 0) >= min) &&
      (!approved || max === null || (priceOf(p) ?? Infinity) <= max)
  );

  const sort = sp.sort ?? "new";
  products = [...products].sort((a, b) => {
    if (a.soldOut !== b.soldOut) return a.soldOut ? 1 : -1;
    if (sort === "price_asc") return (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity);
    if (sort === "price_desc") return (priceOf(b) ?? -1) - (priceOf(a) ?? -1);
    if (sort === "best") return b.sales - a.sales || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const link = (patch: Partial<SP>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };
  const chip = (active: boolean) =>
    `inline-block border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] ${active ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`;
  const hasFilters = Boolean(sp.category || sp.size || sp.color || sp.new || sp.min || sp.max);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14">
      <div className="mb-8 sm:mb-10">
        <h1 className="font-serif text-4xl sm:text-5xl">{t("title")}</h1>
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted">{t("results", { n: products.length })}</p>
      </div>

      <div className="grid lg:grid-cols-[14rem_1fr] gap-10">
        <aside className="space-y-7 text-sm">
          <details open className="lg:[&>summary]:hidden" >
            <summary className="lg:hidden text-[11px] font-semibold uppercase tracking-[0.2em] cursor-pointer mb-3">{t("filters")}</summary>
            <div className="space-y-7">
              <Facet title={t("sortBy")}>
                {[
                  ["new", t("sortNew")],
                  ["best", t("sortBest")],
                  ...(approved ? [["price_asc", t("sortPriceAsc")], ["price_desc", t("sortPriceDesc")]] : []),
                ].map(([value, label]) => (
                  <Link key={value} href={link({ sort: value })} className={chip(sort === value)}>
                    {label}
                  </Link>
                ))}
              </Facet>

              <Facet title={t("newIn")}>
                <Link href={link({ new: sp.new === "1" ? undefined : "1" })} className={chip(sp.new === "1")}>
                  {t("newInDays", { n: NEW_IN_DAYS })}
                </Link>
              </Facet>

              {categories.length > 0 && (
                <Facet title={t("category")}>
                  <Link href={link({ category: undefined })} className={chip(!sp.category)}>{t("all")}</Link>
                  {categories.map((c) => (
                    <Link key={c} href={link({ category: c })} className={chip(sp.category?.toLowerCase() === c.toLowerCase())}>
                      {c}
                    </Link>
                  ))}
                </Facet>
              )}

              {sizes.length > 0 && (
                <Facet title={t("size")}>
                  {sizes.map((s) => (
                    <Link key={s} href={link({ size: sp.size === s ? undefined : s })} className={chip(sp.size === s)}>
                      {s}
                    </Link>
                  ))}
                </Facet>
              )}

              {colors.length > 0 && (
                <Facet title={t("color")}>
                  {colors.map((c) => (
                    <Link key={c.id} href={link({ color: sp.color === c.id ? undefined : c.id })} className={chip(sp.color === c.id)}>
                      {c.name}
                    </Link>
                  ))}
                </Facet>
              )}

              {approved && (
                <form action="/shop" method="get" className="space-y-2">
                  {Object.entries(sp).filter(([k, v]) => v && k !== "min" && k !== "max").map(([k, v]) => (
                    <input key={k} type="hidden" name={k} value={String(v)} />
                  ))}
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">{t("price")}</p>
                  <div className="flex gap-2">
                    <input name="min" type="number" min={0} defaultValue={sp.min} placeholder="min" className="w-full border border-border px-2 py-1.5 text-xs" />
                    <input name="max" type="number" min={0} defaultValue={sp.max} placeholder="max" className="w-full border border-border px-2 py-1.5 text-xs" />
                  </div>
                  <button type="submit" className="text-[11px] uppercase tracking-[0.15em] underline">{t("apply")}</button>
                </form>
              )}

              {hasFilters && (
                <Link href="/shop" className="text-[11px] uppercase tracking-[0.15em] underline">
                  {t("clear")}
                </Link>
              )}
            </div>
          </details>
        </aside>

        <div>
          {products.length === 0 ? (
            <p className="text-sm text-muted py-16 text-center border border-dashed border-border">{t("noResults")}</p>
          ) : (
            <div className="grid stagger grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
              {products.map((product, i) => (
                <ProductCard key={product.id} product={product} siteMode={siteMode} priority={i < 4} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
