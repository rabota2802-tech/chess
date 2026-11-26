import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url),
  pw = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  kind = process.argv[2] || "chromium";
import http from "node:http";
const upstream = process.env.CHESS_TEST_URL || "http://127.0.0.1:18787/chess/";
let connected = true;
const proxy = http.createServer((req, res) => {
  if (!connected) {
    req.socket.destroy();
    return;
  }
  const target = new URL(req.url, upstream);
  const headers = { ...req.headers };
  if (headers.origin) headers.origin = new URL(upstream).origin;
  const relay = http.request(target, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  relay.on("error", () => res.destroy());
  req.pipe(relay);
});
await new Promise((ok) => proxy.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + proxy.address().port + "/chess/",
  browser = await pw[kind].launch(
    kind === "chromium" && process.env.CHROME
      ? { executablePath: process.env.CHROME }
      : {},
  );
const errors = [];
async function tab(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 820 } }),
    p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  return [ctx, p];
}
try {
  const [ctx, p] = await tab(390);
  const start = performance.now();
  await p.goto(base);
  await p.waitForSelector("#cpu");
  console.log("Главное меню, мс:", Math.round(performance.now() - start));
  await p.waitForFunction(() =>
    document.querySelector("#offline").textContent.includes("Готово"),
  );
  await p.reload();
  connected = false;
  if (kind === "chromium") await ctx.setOffline(true);
  await p.reload();
  await p.click("#cpu");
  await p.selectOption("#level", "beginner");
  await p.click("#setup button");
  await p.click("[data-square=e2]");
  await p.click("[data-square=e4]");
  await p.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("chess-profile-v1.1")).current.moves
        .length === 2,
  );
  await p.click("#suggest");
  await p.waitForSelector(".arrow");
  await p.click("#what");
  await p.click("#evaluate");
  await p.waitForFunction(() =>
    document.querySelector("#progress").textContent.includes("·"),
  );
  await p.reload();
  await p.click("#resume");
  assert.equal(await p.locator(".cell").count(), 64);
  await p.click("#brand");
  await p.click("#puzzles");
  await p.click("#daily");
  await p.click("#tip");
  await p.waitForSelector(".arrow");
  await p.click("#brand");
  await p.click("#learn");
  await p.locator("[data-id]").first().click();
  await p.click("button[value=white]");
  await p.click("[data-square=e2]");
  await p.click("[data-square=e4]");
  await p.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("chess-profile-v1.1")).lessons[
        "opening-0"
      ].ply === 2,
  );
  await p.click("#brand");
  await p.click("#local");
  await p.selectOption("#control", "3,2");
  await p.click("#setup button");
  await p.click("button[value=yes]");
  await p.locator("[data-square=d2]").dragTo(p.locator("[data-square=d4]"));
  await p.waitForFunction(() =>
    JSON.parse(
      localStorage.getItem("chess-profile-v1.1"),
    ).current.moves.includes("d2d4"),
  );
  await p.locator("[data-square=d7]").focus();
  await p.keyboard.press("Enter");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() =>
    JSON.parse(
      localStorage.getItem("chess-profile-v1.1"),
    ).current.moves.includes("d7d5"),
  );
  await p.click("#draw");
  await p.click("button[value=yes]");
  await p.waitForSelector("#rematch");
  await p.click("#brand");
  await p.click("#games");
  await p.locator("#g0").click();
  await p.click("#quick");
  await p.waitForFunction(() =>
    document
      .querySelector("#progress")
      .textContent.includes("Проанализировано"),
  );
  await p.click("#brand");
  await p.click("#stats");
  await p.selectOption("#days", "7");
  await p.click("#brand");
  await p.click("#settings");
  await p.selectOption("#theme", "dark");
  await p.selectOption("#boardStyle", "wood");
  const download = p.waitForEvent("download");
  await p.click("#backup");
  const file = await (await download).path();
  await p.selectOption("#theme", "light");
  await p.locator("#restore").setInputFiles(file);
  await p.click("button[value=ok]");
  await p.waitForSelector("#settings");
  await p.reload();
  assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 850 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  connected = true;
  await ctx.setOffline(false);
  await p.click("#online");
  await p.click("#setup button");
  await p.waitForSelector("#invite");
  const invitation = await p.inputValue("#invite");
  const [, q] = await tab(1100);
  await q.goto(invitation);
  await q.click("#setup button");
  await q.waitForSelector("#connection");
  await p.waitForFunction(() => !document.querySelector("#invite"));
  assert.equal(await p.locator("#suggest").count(), 0);
  await p.click("[data-square=e2]");
  await p.click("[data-square=e4]");
  await q.waitForFunction(() =>
    document
      .querySelector("[data-square=e4]")
      .getAttribute("aria-label")
      .includes("пешка"),
  );
  connected = false;
  await p.waitForFunction(() =>
    document
      .querySelector("#connection")
      .textContent.includes("Восстанавливаем"),
  );
  connected = true;
  await p.waitForFunction(() =>
    document.querySelector("#connection").textContent.includes("установлено"),
  );
  await q.reload();
  await q.click("#online");
  await q.click("#reconnect");
  await q.click("[data-square=e7]");
  await q.click("[data-square=e5]");
  await p.waitForFunction(() =>
    document
      .querySelector("[data-square=e5]")
      .getAttribute("aria-label")
      .includes("пешка"),
  );
  await q.click("#resign");
  await q.click("button[value=yes]");
  await p.waitForSelector("#rematch");
  assert.deepEqual(errors, []);
  console.log(
    kind +
      ": PASS — офлайн Stockfish, восстановление, обучение, задачи, анализ, часы, настройки и две независимые онлайн-сессии",
  );
} finally {
  await browser.close();
  proxy.close();
}
