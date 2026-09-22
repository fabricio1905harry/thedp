import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(path.join(rootDir, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("=== Apagando Produtos Criados Pelos Testes e Sementes ===");

const { data: products } = await supabase.from("products").select("id, slug, title");

console.log("Produtos encontrados:", products);

if (products && products.length > 0) {
  const idsToDelete = products.map((p) => p.id);
  const { error } = await supabase.from("products").delete().in("id", idsToDelete);

  if (error) {
    console.error("Erro ao deletar produtos:", error.message);
  } else {
    console.log(`✅ ${products.length} produtos e suas imagens associadas foram removidos com sucesso!`);
  }
} else {
  console.log("Nenhum produto encontrado para remoção.");
}
