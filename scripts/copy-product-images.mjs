import { mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destDir = path.join(rootDir, "public", "images", "products");

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const brainDir = "C:\\Users\\Harry.Dev\\.gemini\\antigravity-ide\\brain\\94201971-8a7d-4b17-bc6a-7f4007d702e1";
const files = readdirSync(brainDir);

const mappings = [
  { prefix: "vestido_um_ombro", target: "vestido-um-ombro.png" },
  { prefix: "vestido_longo_seresta", target: "vestido-longo-seresta.png" },
  { prefix: "vestido_midalia_seda", target: "vestido-midalia-seda.png" },
  { prefix: "vestido_evase_elegante", target: "vestido-evase-elegante.png" },
];

for (const m of mappings) {
  const file = files.find((f) => f.startsWith(m.prefix) && f.endsWith(".png"));
  if (file) {
    const srcPath = path.join(brainDir, file);
    const destPath = path.join(destDir, m.target);
    copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} -> ${m.target}`);
  } else {
    console.warn(`File with prefix ${m.prefix} not found.`);
  }
}
