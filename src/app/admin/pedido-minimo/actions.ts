"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

export type ActionResult = { error?: string };

export interface MinimumRuleInput {
  name: string;
  /** sales channel code, or "" for every operation */
  operation: string;
  scope: "operation" | "category" | "brand" | "product";
  /** category / brand name, or the product slug */
  scopeValue: string;
  minType: "amount" | "units";
  minValue: number;
  currency: "BRL" | "USD" | "EUR";
  active: boolean;
  labels: { en: string; es: string; pt: string };
  message: { en: string; es: string; pt: string };
}

const compact = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/admin/pedido-minimo");
    return {};
  } catch (err) {
    console.error("[admin/pedido-minimo]", err);
    return { error: err instanceof Error ? err.message : "Falha na ação." };
  }
}

export async function createMinimumRule(input: MinimumRuleInput): Promise<ActionResult> {
  return run(async () => {
    const staff = await getCurrentStaff();
    if (!staff) throw new Error("Não autorizado");
    const name = input.name.trim();
    if (!name) throw new Error("Dê um nome para a regra.");
    if (!Number.isFinite(input.minValue) || input.minValue <= 0) throw new Error("O mínimo deve ser maior que zero.");
    if (input.minType === "units" && !Number.isInteger(input.minValue)) throw new Error("O mínimo em unidades deve ser um número inteiro.");

    const supabase = await createClient();
    let scopeValue: string | null = input.scope === "operation" ? null : input.scopeValue.trim();
    if (input.scope !== "operation" && !scopeValue) throw new Error("Informe a categoria, marca ou produto da regra.");
    if (input.scope === "product") {
      const { data: product } = await supabase.from("products").select("id").eq("slug", scopeValue!).maybeSingle();
      if (!product) throw new Error(`Produto não encontrado pelo slug "${scopeValue}".`);
      scopeValue = product.id as string;
    }

    const { data, error } = await supabase
      .from("order_minimum_rules")
      .insert({
        name,
        operation: input.operation || null,
        scope: input.scope,
        scope_value: scopeValue,
        min_type: input.minType,
        min_value: input.minValue,
        currency: input.currency,
        active: input.active,
        labels: compact(input.labels),
        message: compact(input.message),
        updated_by: staff.id,
      })
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("A regra não foi salva (sem permissão?).");
  });
}

export async function setMinimumRuleActive(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const staff = await getCurrentStaff();
    if (!staff) throw new Error("Não autorizado");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("order_minimum_rules")
      .update({ active, updated_at: new Date().toISOString(), updated_by: staff.id })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Regra não encontrada ou sem permissão.");
  });
}

export async function deleteMinimumRule(id: string): Promise<ActionResult> {
  return run(async () => {
    const staff = await getCurrentStaff();
    if (!staff) throw new Error("Não autorizado");
    const supabase = await createClient();
    const { data, error } = await supabase.from("order_minimum_rules").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Regra não encontrada ou sem permissão.");
  });
}
