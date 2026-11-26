// Build only the distributable client. Never overwrite an existing destination.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv[2]) throw Error("Укажите новую папку вывода");
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: false });
const appFiles = [
  "index.html",
  "manifest.webmanifest",
  "style.css",
  "icon-192.png",
  "icon-512.png",
  "data/puzzles.json",
  ...fs
    .readdirSync(path.join(root, "js"))
    .filter((n) => n.endsWith(".js"))
    .sort()
    .map((n) => "js/" + n),
  "vendor/stockfish/stockfish-17-lite-single.js",
  "vendor/stockfish/stockfish-17-lite-single.wasm",
];
const licenseFiles = [
  "LICENSES.md",
  "vendor/stockfish/Copying.txt",
  "vendor/stockfish/source.tar.gz",
  "vendor/stockfish/SHA256SUMS",
];
const guard =
  'if (self.location.hostname.toLowerCase().replace(/\\.$/,"") === "rabota2802-tech.github.io") throw Error("Тестовую сборку открывайте на отдельном домене.");\n';
const hash = (v) => createHash("sha256").update(v).digest("hex");
const assets = {};
for (const name of [...appFiles, ...licenseFiles]) {
  let bytes = fs.readFileSync(path.join(root, name));
  if (name === "manifest.webmanifest") {
    const m = JSON.parse(bytes);
    Object.assign(m, {
      id: "./preview-id",
      name: "Шахматы 1.1 — тест",
      short_name: "Шахматы ТЕСТ",
    });
    bytes = Buffer.from(JSON.stringify(m));
  }
  if (name === "index.html")
    bytes = Buffer.from(
      bytes
        .toString()
        .replace("<title>Шахматы</title>", "<title>Шахматы 1.1 — тест</title>")
        .replace("<b>Шахматы</b>", "<b>Шахматы · Тест 1.1</b>"),
    );
  if (name === "js/app.js") bytes = Buffer.from(guard + bytes.toString());
  if (appFiles.includes(name)) assets[name] = hash(bytes);
  const dest = path.join(out, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}
const template = fs.readFileSync(
  path.join(root, "scripts/worker.template"),
  "utf8",
);
fs.writeFileSync(
  path.join(out, "sw.js"),
  guard +
    "const assets=" +
    JSON.stringify(assets) +
    ';\nconst revision="preview-' +
    hash(JSON.stringify(assets) + template + guard).slice(0, 20) +
    '";\n' +
    template,
);
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(out);
