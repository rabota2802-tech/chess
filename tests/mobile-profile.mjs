import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const b = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
});
try {
  const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }),
    page = await ctx.newPage(),
    cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t = performance.now();
  await page.goto(
    process.env.CHESS_TEST_URL || "http://127.0.0.1:18791/chess/",
  );
  await page.waitForSelector("#local");
  const menu = Math.round(performance.now() - t);
  await page.waitForFunction(() =>
    document.querySelector("#offline").textContent.includes("Готово"),
  );
  const ready = Math.round(performance.now() - t);
  await ctx.setOffline(true);
  await page.reload();
  await page.tap("#local");
  await page.tap("#setup button");
  await page.tap("[data-square=e2]");
  await page.tap("[data-square=e4]");
  const widths = [];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    widths.push(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  assert(widths.every(Boolean));
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await page.evaluate(async () => {
    const { search } = await import("./js/engine.js"),
      { parseFen, startFen } = await import("./js/rules.js");
    let last = performance.now(),
      gaps = [];
    const timer = setInterval(() => {
      let now = performance.now();
      gaps.push(now - last);
      last = now;
    }, 50);
    const t = performance.now();
    let move;
    try {
      move = await search(parseFen(startFen), { level: "expert" });
    } finally {
      clearInterval(timer);
    }
    return {
      move: move.u,
      ms: Math.round(performance.now() - t),
      samples: gaps.length,
      maxTimerGap: Math.round(Math.max(...gaps)),
      heap: performance.memory?.usedJSHeapSize,
    };
  });
  console.log(
    JSON.stringify({
      emulation: "Chromium CPU x4, touch 390x844",
      menu,
      ready,
      widths,
      result,
    }),
  );
} finally {
  await b.close();
}
