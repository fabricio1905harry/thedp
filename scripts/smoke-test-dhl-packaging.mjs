import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { calculateShipmentPackages } from "../src/lib/dhl-packaging.ts";

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

process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== Smoke Test: DHL Automatic Packaging Calculation ===");

// 1. Test 4 Dresses -> Expect DHL_PACKAGE_1
const res4 = await calculateShipmentPackages({ quantity: 4, category: "Dresses" });
console.log("\n--- Test 1: 4 Dresses ---");
console.log("Packages count:", res4.number_of_packages);
console.log("Package 1 code:", res4.packages[0]?.packaging_code, "| Qty:", res4.packages[0]?.quantity);
if (res4.packages[0]?.packaging_code !== "DHL_PACKAGE_1") {
  console.error("FAILED Test 1: Expected DHL_PACKAGE_1");
  process.exit(1);
}

// 2. Test 8 Dresses -> Expect DHL_PACKAGE_2
const res8 = await calculateShipmentPackages({ quantity: 8, category: "Dresses" });
console.log("\n--- Test 2: 8 Dresses ---");
console.log("Packages count:", res8.number_of_packages);
console.log("Package 1 code:", res8.packages[0]?.packaging_code, "| Qty:", res8.packages[0]?.quantity);
if (res8.packages[0]?.packaging_code !== "DHL_PACKAGE_2") {
  console.error("FAILED Test 2: Expected DHL_PACKAGE_2");
  process.exit(1);
}

// 3. Test 17 Dresses -> Expect DHL_BOX_8
const res17 = await calculateShipmentPackages({ quantity: 17, category: "Dresses" });
console.log("\n--- Test 3: 17 Dresses ---");
console.log("Packages count:", res17.number_of_packages);
console.log("Package 1 code:", res17.packages[0]?.packaging_code, "| Qty:", res17.packages[0]?.quantity);
if (res17.packages[0]?.packaging_code !== "DHL_BOX_8") {
  console.error("FAILED Test 3: Expected DHL_BOX_8");
  process.exit(1);
}

// 4. Test 25 Dresses -> Expect Volume 1: DHL_BOX_8 (20 pcs), Volume 2: DHL_PACKAGE_1 (5 pcs)
const res25 = await calculateShipmentPackages({ quantity: 25, category: "Dresses" });
console.log("\n--- Test 4: 25 Dresses ---");
console.log("Packages count:", res25.number_of_packages);
console.log("Package 1:", res25.packages[0]?.packaging_code, `(${res25.packages[0]?.quantity} pcs)`);
console.log("Package 2:", res25.packages[1]?.packaging_code, `(${res25.packages[1]?.quantity} pcs)`);

if (
  res25.number_of_packages !== 2 ||
  res25.packages[0]?.packaging_code !== "DHL_BOX_8" ||
  res25.packages[0]?.quantity !== 20 ||
  res25.packages[1]?.packaging_code !== "DHL_PACKAGE_1" ||
  res25.packages[1]?.quantity !== 5
) {
  console.error("FAILED Test 4: Expected Vol 1: DHL_BOX_8 (20 pcs) + Vol 2: DHL_PACKAGE_1 (5 pcs)");
  process.exit(1);
}

// 5. Test status review required when dimensions are 0
console.log("\n--- Test 5: Check status for unconfigured dimensions ---");
console.log("Status:", res4.packages[0]?.status);
console.log("Has review required:", res4.has_review_required);
if (!res4.has_review_required || res4.packages[0]?.status !== "PACKAGING_REVIEW_REQUIRED") {
  console.error("FAILED Test 5: Expected PACKAGING_REVIEW_REQUIRED for 0 dimensions");
  process.exit(1);
}

console.log("\n=== ALL DHL PACKAGING TESTS PASSED 100%! ===");
