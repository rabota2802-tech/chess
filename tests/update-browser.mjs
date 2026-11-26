import { createRequire } from "node:module";
import http from "node:http";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
let version = "old",
  online = true;
const server = http.createServer((req, res) => {
  if (!online) {
    req.socket.destroy();
    return;
  }
  const f =
    new URL(req.url, "http://localhost").pathname.slice("/chess/".length) ||
    "index.html";
  if (
    !/^(?:index\.html|sw\.js|icon-(?:192|512)\.png|style\.css|manifest\.webmanifest|js\/[\w-]+\.js|data\/puzzles\.json|vendor\/stockfish\/[\w.-]+)$/.test(
      f,
    )
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const bytes =
      version === "old"
        ? execFileSync("git", ["show", "8659489:" + f])
        : version === "broken" && f === "style.css"
          ? ""
          : fs.readFileSync(f);
    res.setHeader(
      "content-type",
      {
        js: "text/javascript",
        html: "text/html",
        css: "text/css",
        wasm: "application/wasm",
      }[f.split(".").at(-1)] || "application/octet-stream",
    );
    res.setHeader("cache-control", "no-store");
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const addr = "http://127.0.0.1:" + server.address().port + "/chess/",
  b = await chromium.launch(
    process.env.CHROME ? { executablePath: process.env.CHROME } : {},
  );
try {
  const ctx = await b.newContext(),
    p = await ctx.newPage();
  await p.goto(addr);
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await p.reload();
  await p.click("[data-sq=e2]");
  await p.click("[data-sq=e4]");
  await p.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("offline-chess-v1")).moves.length === 2,
  );
  const raw = await p.evaluate(() => localStorage.getItem("offline-chess-v1"));
  version = "broken";
  const failed = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return new Promise(async (resolve) => {
      r.addEventListener("updatefound", () => {
        const w = r.installing;
        w.addEventListener("statechange", () => {
          if (w.state === "redundant") resolve(true);
        });
      });
      await r.update();
    });
  });
  assert(failed);
  online = false;
  await p.reload();
  assert.equal(await p.locator("[data-sq]").count(), 64);
  online = true;
  version = "new";
  await p.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return new Promise(async (resolve) => {
      r.addEventListener("updatefound", () => {
        const w = r.installing;
        w.addEventListener("statechange", () => {
          if (w.state === "installed") resolve(true);
        });
      });
      await r.update();
    });
  });
  await p.close();
  const q = await ctx.newPage();
  await q.goto(addr);
  await q.waitForSelector("#resume");
  await q.click("#resume");
  assert.equal(
    await q.evaluate(() => localStorage.getItem("offline-chess-v1")),
    raw,
  );
  assert.equal(await q.locator("[data-why]").count(), 2);
  console.log(
    "PASS: повреждённое обновление оставило 1.0 доступной офлайн; после исправления 1.1 восстановила оба полухода и исходную запись.",
  );
} finally {
  await b.close();
  server.close();
}
