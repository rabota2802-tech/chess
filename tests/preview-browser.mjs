import http from "node:https";
import { X509Certificate, createHash } from "node:crypto";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const dir = mkdtempSync(path.join(tmpdir(), "chess-preview-")),
  preview = path.join(dir, "site"),
  servers = [];
let browser;
try {
  execFileSync(process.execPath, ["scripts/preview.mjs", preview]);
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-keyout",
      dir + "/key",
      "-out",
      dir + "/cert",
    ],
    { stdio: "ignore" },
  );
  const tls = {
    key: await fs.readFile(dir + "/key"),
    cert: await fs.readFile(dir + "/cert"),
  };
  async function serve(old) {
    const server = http.createServer(tls, async (req, res) => {
      const rel =
        new URL(req.url, "https://localhost").pathname.slice(1) || "index.html";
      if (!/^[a-zA-Z0-9._/-]+$/.test(rel) || rel.includes("..")) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        const bytes = old
          ? execFileSync("git", ["show", "8659489:" + rel], {
              stdio: ["ignore", "pipe", "ignore"],
            })
          : await fs.readFile(path.join(preview, rel));
        res.setHeader(
          "content-type",
          {
            js: "text/javascript",
            html: "text/html",
            css: "text/css",
            json: "application/json",
            wasm: "application/wasm",
            webmanifest: "application/manifest+json",
          }[rel.split(".").at(-1)] || "application/octet-stream",
        );
        res.end(bytes);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
    servers.push(server);
    return "https://127.0.0.1:" + server.address().port + "/";
  }
  const stable = await serve(true),
    rc = await serve(false);
  const spki = new X509Certificate(tls.cert).publicKey.export({
    type: "spki",
    format: "der",
  });
  const fingerprint = createHash("sha256").update(spki).digest("base64");
  browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ["--ignore-certificate-errors-spki-list=" + fingerprint],
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true }),
    a = await ctx.newPage(),
    b = await ctx.newPage();
  await a.goto(stable);
  await a.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.active,
  );
  await a.click("[data-sq=e2]");
  await a.click("[data-sq=e4]");
  await a.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("offline-chess-v1")).moves.length === 2,
  );
  const legacy = await a.evaluate(() =>
    localStorage.getItem("offline-chess-v1"),
  );
  await b.goto(rc);
  await b.waitForFunction(() =>
    document.querySelector("#offline")?.textContent.includes("Готово"),
  );
  await b.reload();
  assert.equal(
    await b.evaluate(() => localStorage.getItem("offline-chess-v1")),
    null,
  );
  assert.equal(
    await b.evaluate(async () => (await navigator.serviceWorker.ready).scope),
    rc,
  );
  await ctx.setOffline(true);
  await b.reload();
  await b.click("#local");
  await b.click("#setup button");
  await b.click("[data-square=e2]");
  await b.click("[data-square=e4]");
  assert.equal(
    await b.evaluate(
      () =>
        JSON.parse(localStorage.getItem("chess-profile-v1.1")).current.moves
          .length,
    ),
    1,
  );
  await a.reload();
  assert.equal(
    await a.evaluate(() => localStorage.getItem("offline-chess-v1")),
    legacy,
  );
  assert.equal(
    await a.evaluate(() => localStorage.getItem("chess-profile-v1.1")),
    null,
  );
  assert.equal(
    await a.evaluate(async () => (await navigator.serviceWorker.ready).scope),
    stable,
  );
  console.log(
    "PASS: два отдельных HTTPS origin, независимые SW, обе версии работают офлайн, партия 1.0 сохранена.",
  );
} finally {
  await browser?.close();
  servers.forEach((s) => s.close());
  await fs.rm(dir, { recursive: true, force: true });
}
