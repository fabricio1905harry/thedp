import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const checks = [
  ["auth health (apikey=anon)", `${url}/auth/v1/health`, { apikey: anonKey }],
  [
    "rest root (service_role)",
    `${url}/rest/v1/`,
    { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  ],
  [
    "rest root (anon)",
    `${url}/rest/v1/`,
    { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  ],
  [
    "rest table probe (anon)",
    `${url}/rest/v1/does_not_exist_yet?select=*&limit=1`,
    { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  ],
];

for (const [label, endpoint, headers] of checks) {
  try {
    const res = await fetch(endpoint, { headers });
    const text = await res.text();
    console.log(`${label}: ${res.status} ${text.slice(0, 200)}`);
  } catch (err) {
    console.log(`${label}: ERROR ${err.message}`);
  }
}
