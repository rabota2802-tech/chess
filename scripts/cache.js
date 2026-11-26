import fs from "node:fs";
import crypto from "node:crypto";
const files = [
  "index.html",
  "manifest.webmanifest",
  "style.css",
  "icon-192.png",
  "icon-512.png",
  ...fs
    .readdirSync("js")
    .filter((n) => n.endsWith(".js"))
    .sort()
    .map((n) => "js/" + n),
  "data/puzzles.json",
  ...fs
    .readdirSync("vendor/stockfish")
    .filter((n) => /\.(js|wasm)$/.test(n))
    .sort()
    .map((n) => "vendor/stockfish/" + n),
];
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex"),
  assets = Object.fromEntries(files.map((f) => [f, hash(fs.readFileSync(f))])),
  template = fs.readFileSync("scripts/worker.template", "utf8");
fs.writeFileSync(
  "sw.js",
  "// Генерируется командой node scripts/cache.js\nconst assets = " +
    JSON.stringify(assets, null, 2) +
    ';\nconst revision = "' +
    hash(JSON.stringify(assets) + template).slice(0, 20) +
    '";\n' +
    template,
);
