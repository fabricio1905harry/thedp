import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

import { calculateShipmentPackages } from "../src/lib/dhl-packaging.ts";
import { calculateShipSmartQuote, createShipSmartShipment, mapOrderPackagesToShipSmart } from "../src/lib/shipsmart.ts";

console.log("=== Smoke Test: ShipSmart & DHL Packaging Integration ===");

// 1. Calculate DHL packaging for 5 dresses (Order in USA)
const packagingResult = await calculateShipmentPackages({
  quantity: 5,
  category: "Vestidos",
  unitWeightKg: 1.6,
});

console.log("\n1. DHL Packaging Algorithm Result for 5 dresses:");
console.log(`   Packages count: ${packagingResult.number_of_packages}`);
console.log(`   Review Required: ${packagingResult.has_review_required}`);
console.log(`   Package Code: ${packagingResult.packages[0]?.packaging_code}`);
console.log(`   Dimensions: ${packagingResult.packages[0]?.length_cm}x${packagingResult.packages[0]?.width_cm}x${packagingResult.packages[0]?.height_cm} cm`);
console.log(`   Final Weight: ${packagingResult.packages[0]?.final_weight_kg} kg`);

// Map to ShipSmart packages
const shipSmartPackages = mapOrderPackagesToShipSmart(packagingResult.packages);

// 2. Request ShipSmart Quote for USA recipient
const quoteResult = await calculateShipSmartQuote({
  destination: {
    name: "Jane Doe",
    address: "5th Avenue, 100",
    city: "New York",
    state: "NY",
    postalCode: "10001",
    countryCode: "US",
  },
  packages: shipSmartPackages,
  declaredValueAmount: 1250.0,
  isDdp: false,
});

console.log("\n2. ShipSmart Quote Rate Result:");
console.log(`   Success: ${quoteResult.success}`);
console.log(`   Rates count: ${quoteResult.rates.length}`);
console.log(`   Service: ${quoteResult.rates[0].serviceName}`);
console.log(`   Price BRL: R$ ${quoteResult.rates[0].priceBrl}`);
console.log(`   Delivery Days: ${quoteResult.rates[0].estimatedDeliveryDays} dias`);

// 3. Create Shipment via ShipSmart
const shipmentResult = await createShipSmartShipment({
  orderId: "order_test_123456",
  orderNumber: "TD-10025",
  recipient: {
    name: "Jane Doe",
    email: "janedoe@example.com",
    phone: "+1 212 555 0199",
    address: "5th Avenue, 100",
    city: "New York",
    state: "NY",
    postalCode: "10001",
    countryCode: "US",
  },
  packages: shipSmartPackages,
  items: [
    {
      description: "Vestido de Festa Seda - The Dress",
      hsCode: "6204.43.00",
      quantity: 5,
      unitValue: 250.0,
      totalValue: 1250.0,
    },
  ],
  declaredValueAmount: 1250.0,
});

console.log("\n3. ShipSmart Shipment Generation Result:");
console.log(`   Success: ${shipmentResult.success}`);
console.log(`   AWB / Tracking Number: ${shipmentResult.trackingNumber}`);
console.log(`   Label URL: ${shipmentResult.labelUrl}`);

if (quoteResult.success && shipmentResult.success && shipmentResult.trackingNumber) {
  console.log("\n🎉 ALL SHIPSMART & DHL INTEGRATION TESTS PASSED 100%!");
} else {
  console.error("\n❌ SHIPSMART TEST FAILED!");
  process.exit(1);
}
