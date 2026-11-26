import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {},
);
try {
  const ctx = await browser.newContext(),
    p = await ctx.newPage();
  await p.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:18787/chess/");
  await p.waitForFunction(() =>
    document.querySelector("#offline").textContent.includes("Готово"),
  );
  await p.reload();
  await ctx.setOffline(true);
  const results = await p.evaluate(async () => {
    const { search, levels } = await import("./js/engine.js"),
      { parseFen, startFen, legal, key, gameStatus } = await import(
        "./js/rules.js"
      ),
      { createGame, replay, play } = await import("./js/game.js");
    const rows = [],
      games = [];
    let maxDelay = 0,
      last = performance.now();
    const pulse = setInterval(() => {
      const now = performance.now();
      maxDelay = Math.max(maxDelay, now - last);
      last = now;
    }, 100);
    for (const fen of [
      startFen,
      "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQR1K1 w - - 0 8",
    ]) {
      const state = parseFen(fen);
      for (const level of Object.keys(levels)) {
        const t = performance.now(),
          r = await search(state, { level });
        rows.push({
          level,
          u: r.u,
          ms: Math.round(performance.now() - t),
          legal: legal(state).some((m) => key(m) === r.u),
        });
      }
    }
    // Полная игра и короткая серия эндшпилей, включая перемену цветов.
    for (const [a, b, initial] of [
      ["beginner", "medium", startFen],
      ["amateur", "strong", "7k/8/5K2/8/4Q3/8/8/8 w - - 0 1"],
      ["expert", "beginner", "7k/8/5K2/8/4Q3/8/8/8 w - - 0 1"],
      ["strong", "amateur", "8/8/8/4q3/8/5k2/8/7K b - - 0 1"],
    ]) {
      const g = createGame({ initial }),
        h = replay(g);
      while (!g.result && g.moves.length < 320) {
        const s = h.at(-1),
          r = await search(s, { level: s.t === 1 ? a : b });
        if (!play(g, h, r.u)) throw Error("Нелегальный ход");
      }
      games.push({
        a,
        b,
        plies: g.moves.length,
        result: g.result?.reason || "Лимит испытания",
      });
    }
    clearInterval(pulse);
    return {
      rows,
      games,
      maxDelay: Math.round(maxDelay),
      heap: performance.memory?.usedJSHeapSize,
    };
  });
  console.log(JSON.stringify(results, null, 2));
  assert(results.rows.every((r) => r.legal));
  assert(results.games.every((g) => g.result !== "Лимит испытания"));
} finally {
  await browser.close();
}
