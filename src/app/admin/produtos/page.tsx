import { createClient } from "@/lib/supabase/server";
import { ProductModerationTable } from "@/components/product-moderation-table";
import { ProductFilters } from "@/components/product-filters";
import Link from "next/link";

const PAGE_SIZE = 30;

async function getCategories() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select("category")
      .not("category", "is", null);
    const set = new Set<string>();
    for (const row of data ?? []) {
      if (row.category) set.add(row.category);
    }
    return Array.from(set).sort();
  } catch {
    return [];
  }
}

async function getProducts({
  q,
  status,
  category,
  page,
}: {
  q: string;
  status: string;
  category: string;
  page: number;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    let query = supabase
      .from("products")
      .select(
        `
        id, title, category, status, price_brl, connector_id,
        connectors!products_connector_id_fkey ( supplier_name ),
        product_connectors ( connector_id, connectors ( supplier_name ) ),
        product_images ( storage_path, position )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (q) query = query.ilike("title", `%${q}%`);
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);

    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[admin/produtos] getProducts error:", error);
      return null;
    }

    const products = (data ?? []).map((p) => {
      const supplierNames: string[] = [];
      if (p.connectors && typeof p.connectors === "object" && "supplier_name" in p.connectors) {
        supplierNames.push((p.connectors as { supplier_name: string }).supplier_name);
      }
      if (Array.isArray(p.product_connectors)) {
        for (const pc of p.product_connectors) {
          if (pc.connectors && typeof pc.connectors === "object" && "supplier_name" in pc.connectors) {
            const name = (pc.connectors as { supplier_name: string }).supplier_name;
            if (!supplierNames.includes(name)) {
              supplierNames.push(name);
            }
          }
        }
      }
      const sortedImages = Array.isArray(p.product_images)
        ? [...p.product_images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        : [];
      return {
        id: p.id,
        title: p.title,
        category: p.category,
        status: p.status,
        price_brl: p.price_brl,
        suppliers: supplierNames,
        imageUrl: sortedImages[0]?.storage_path ?? null,
      };
    });

    return { products, total: count ?? products.length };
  } catch {
    return null;
  }
}

export default async function AdminProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status ?? "";
  const category = params.category ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const [result, categories] = await Promise.all([
    getProducts({ q, status, category, page }),
    getCategories(),
  ]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">Produtos</h1>
      <p className="text-sm text-muted mb-6">
        Publicar/despublicar individualmente ou em massa (CAT-04), edição de
        preço/markup/HS code (ADM-03). O volume do catálogo ainda depende dos
        conectores de fornecedores no n8n (tarefa #10).
      </p>

      <ProductFilters categories={categories} initialQ={q} initialStatus={status} initialCategory={category} />

      {result === null ? (
        <p className="text-sm text-muted mt-4">Não foi possível carregar os produtos.</p>
      ) : result.products.length === 0 ? (
        <p className="text-sm text-muted mt-4">
          {q || status || category
            ? "Nenhum produto corresponde a estes filtros."
            : "Nenhum produto ainda — a importação automática (CAT-01) está bloqueada até a escolha dos 5 fornecedores (decisão pendente #4 do PRD)."}
        </p>
      ) : (
        <>
          <ProductModerationTable products={result.products} />
          <div className="flex items-center justify-between mt-4 text-xs text-muted">
            <span>
              {result.total} produto{result.total === 1 ? "" : "s"} — página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-3">
              <PageLink
                page={page - 1}
                disabled={page <= 1}
                q={q}
                status={status}
                category={category}
              >
                ← Anterior
              </PageLink>
              <PageLink
                page={page + 1}
                disabled={page >= totalPages}
                q={q}
                status={status}
                category={category}
              >
                Próxima →
              </PageLink>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  q,
  status,
  category,
  children,
}: {
  page: number;
  disabled: boolean;
  q: string;
  status: string;
  category: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="opacity-40">{children}</span>;
  }
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (status) sp.set("status", status);
  if (category) sp.set("category", category);
  sp.set("page", String(page));
  return (
    <Link href={`/admin/produtos?${sp.toString()}`} className="hover:text-accent">
      {children}
    </Link>
  );
}
