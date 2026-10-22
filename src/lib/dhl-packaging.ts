import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export interface PackagingType {
  id: string;
  code: string;
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  emptyWeightKg: number;
  maxWeightKg: number;
  active: boolean;
}

export interface CapacityRule {
  id: string;
  packagingTypeId: string;
  packagingTypeCode: string;
  packagingTypeName: string;
  category: string;
  minQuantity: number;
  maxQuantity: number;
  active: boolean;
}

export interface OrderPackageResultItem {
  package_number: number;
  packaging_code: string;
  packaging_name: string;
  quantity: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  products_weight_kg: number;
  empty_package_weight_kg: number;
  final_weight_kg: number;
  status: "OK" | "PACKAGING_REVIEW_REQUIRED";
  note?: string;
}

export interface ShipmentCalculationResult {
  total_items: number;
  number_of_packages: number;
  has_review_required: boolean;
  packages: OrderPackageResultItem[];
}

export const DEFAULT_SHIPPING_WEIGHT_KG = 1.60;

/** Fetch all packaging types from DB */
export async function getPackagingTypes(): Promise<PackagingType[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("packaging_types")
    .select("*")
    .order("code", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    lengthCm: Number(row.length_cm ?? 0),
    widthCm: Number(row.width_cm ?? 0),
    heightCm: Number(row.height_cm ?? 0),
    emptyWeightKg: Number(row.empty_weight_kg ?? 0),
    maxWeightKg: Number(row.max_weight_kg ?? 0),
    active: row.active ?? true,
  }));
}

/** Fetch all packaging capacity rules from DB */
export async function getCapacityRules(): Promise<CapacityRule[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("packaging_capacity_rules")
    .select(`
      id, packaging_type_id, category, min_quantity, max_quantity, active,
      packaging_types ( code, name )
    `)
    .order("category", { ascending: true })
    .order("min_quantity", { ascending: true });

  return (data ?? []).map((row) => {
    const pt = Array.isArray(row.packaging_types)
      ? row.packaging_types[0]
      : row.packaging_types;
    return {
      id: row.id,
      packagingTypeId: row.packaging_type_id,
      packagingTypeCode: pt?.code ?? "",
      packagingTypeName: pt?.name ?? "",
      category: row.category,
      minQuantity: Number(row.min_quantity ?? 1),
      maxQuantity: Number(row.max_quantity ?? 20),
      active: row.active ?? true,
    };
  });
}

export interface ItemsInput {
  category?: string;
  quantity: number;
  unitWeightKg?: number;
}

/**
 * Core function: calculateShipmentPackages
 * EvaluatesConfirmed Order quantity, selects smallest suitable DHL package,
 * validates weight & dimensions, and recursively splits into multiple packages when needed.
 */
export async function calculateShipmentPackages(
  input: ItemsInput | ItemsInput[],
  categoryName = "Dresses"
): Promise<ShipmentCalculationResult> {
  const items = Array.isArray(input) ? input : [input];
  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  if (totalItems <= 0) {
    return {
      total_items: 0,
      number_of_packages: 0,
      has_review_required: false,
      packages: [],
    };
  }

  const [types, rules] = await Promise.all([getPackagingTypes(), getCapacityRules()]);
  const unitWeight = items.find((i) => i.unitWeightKg)?.unitWeightKg || DEFAULT_SHIPPING_WEIGHT_KG;
  return planShipmentPackages(types, rules, totalItems, unitWeight, categoryName);
}

/** Pieces of `unitWeightKg` a box can really take: min(quantity rule, weight limit). */
export function effectiveCapacity(rule: CapacityRule, type: PackagingType, unitWeightKg: number): number {
  const byWeight =
    type.maxWeightKg > 0 && unitWeightKg > 0
      ? Math.floor((type.maxWeightKg - type.emptyWeightKg + 1e-9) / unitWeightKg)
      : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(rule.maxQuantity, byWeight));
}

function volumeOf(t: PackagingType) {
  const v = t.lengthCm * t.widthCm * t.heightCm;
  return v > 0 ? v : Number.POSITIVE_INFINITY;
}

/**
 * Pure planner (unit-testable): picks, for the pieces still to ship, the
 * smallest box that fits BOTH the quantity and the weight capacity
 * (pieces x unit weight + empty box <= max weight). When nothing fits all
 * the remaining pieces, fills the box with the largest effective capacity
 * and repeats.
 */
export function planShipmentPackages(
  types: PackagingType[],
  rules: CapacityRule[],
  totalItems: number,
  unitWeight: number,
  categoryName = "Dresses"
): ShipmentCalculationResult {
  const activeTypes = new Map<string, PackagingType>();
  for (const t of types) {
    if (t.active) activeTypes.set(t.id, t);
  }

  // Filter active capacity rules matching category (e.g. Dresses / Vestidos case-insensitive)
  const catFilter = categoryName.trim().toLowerCase();
  const matchedRules = rules.filter(
    (r) =>
      r.active &&
      (r.category.trim().toLowerCase() === catFilter ||
        r.category.trim().toLowerCase() === "dresses" ||
        r.category.trim().toLowerCase() === "vestidos") &&
      activeTypes.has(r.packagingTypeId)
  );

  let remainingQty = totalItems;
  const packagesResult: OrderPackageResultItem[] = [];
  let packageNumber = 1;

  while (remainingQty > 0) {
    let chosenRule: CapacityRule | undefined;
    let allocatedQty = remainingQty;

    const cap = (r: CapacityRule) => effectiveCapacity(r, activeTypes.get(r.packagingTypeId)!, unitWeight);

    // STEP 1: boxes whose quantity AND weight capacity take ALL remaining pieces;
    // pick the smallest (volume, then capacity). Rules whose min quantity is met come first.
    const fitting = matchedRules.filter((r) => cap(r) >= remainingQty);
    if (fitting.length > 0) {
      const rank = (r: CapacityRule) => [
        remainingQty >= r.minQuantity ? 0 : 1,
        volumeOf(activeTypes.get(r.packagingTypeId)!),
        r.maxQuantity,
      ];
      fitting.sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        for (let i = 0; i < ra.length; i++) {
          if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
        }
        return 0;
      });
      chosenRule = fitting[0];
    } else {
      // STEP 2: nothing takes everything — fill the box with the largest effective capacity.
      const largest = [...matchedRules].sort((a, b) => cap(b) - cap(a));
      chosenRule = largest[0];
      if (chosenRule) allocatedQty = Math.min(remainingQty, Math.max(1, cap(chosenRule)));
    }

    if (!chosenRule) {
      // No rules defined in DB
      const productsWeight = Number((remainingQty * unitWeight).toFixed(2));
      packagesResult.push({
        package_number: packageNumber,
        packaging_code: "UNCONFIGURED_PACKAGING",
        packaging_name: "Embalagem Não Configurada",
        quantity: remainingQty,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        products_weight_kg: productsWeight,
        empty_package_weight_kg: 0,
        final_weight_kg: productsWeight,
        status: "PACKAGING_REVIEW_REQUIRED",
        note: "Nenhuma regra de capacidade DHL cadastrada para a categoria.",
      });
      break;
    }

    const packagingType = activeTypes.get(chosenRule.packagingTypeId)!;
    const productsWeight = Number((allocatedQty * unitWeight).toFixed(2));
    const emptyWeight = Number(packagingType.emptyWeightKg.toFixed(2));
    const finalWeight = Number((productsWeight + emptyWeight).toFixed(2));

    // Validate dimensions and weight
    const missingDims =
      packagingType.lengthCm <= 0 ||
      packagingType.widthCm <= 0 ||
      packagingType.heightCm <= 0;

    const exceedsWeight =
      packagingType.maxWeightKg > 0 && finalWeight > packagingType.maxWeightKg;

    const status: "OK" | "PACKAGING_REVIEW_REQUIRED" =
      missingDims || exceedsWeight ? "PACKAGING_REVIEW_REQUIRED" : "OK";

    let note: string | undefined;
    if (missingDims) {
      note = "Dimensões da embalagem DHL zeradas ou pendentes de cadastro no Admin.";
    } else if (exceedsWeight) {
      note = `Peso final (${finalWeight} kg) excede o limite máximo permitido (${packagingType.maxWeightKg} kg).`;
    }

    packagesResult.push({
      package_number: packageNumber,
      packaging_code: packagingType.code,
      packaging_name: packagingType.name,
      quantity: allocatedQty,
      length_cm: packagingType.lengthCm,
      width_cm: packagingType.widthCm,
      height_cm: packagingType.heightCm,
      products_weight_kg: productsWeight,
      empty_package_weight_kg: emptyWeight,
      final_weight_kg: finalWeight,
      status,
      note,
    });

    remainingQty -= allocatedQty;
    packageNumber++;
  }

  const hasReviewRequired = packagesResult.some(
    (p) => p.status === "PACKAGING_REVIEW_REQUIRED"
  );

  return {
    total_items: totalItems,
    number_of_packages: packagesResult.length,
    has_review_required: hasReviewRequired,
    packages: packagesResult,
  };
}
