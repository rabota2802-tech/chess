import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseFen,
  startFen,
  legal,
  apply,
  gameStatus,
  key,
} from "../js/rules.js";
import {
  createGame,
  findMove,
  play,
  replay,
  remaining,
  timeout,
  pgn,
  readPGN,
  finish,
} from "../js/game.js";
import { migrate, load, empty, save, stats } from "../js/store.js";
import { lessons } from "../js/lessons.js";
function perft(s, d) {
  if (!d) return 1;
  return legal(s).reduce((sum, m) => sum + perft(apply(s, m), d - 1), 0);
}
test("Perft старт и Kiwipete", () => {
  for (const [fen, counts] of [
    [startFen, [20, 400, 8902, 197281]],
    [
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
      [48, 2039, 97862],
    ],
  ])
    counts.forEach((v, i) => assert.equal(perft(parseFen(fen), i + 1), v));
});
test("Специальные ходы и окончания", () => {
  const moves = (fen) => legal(parseFen(fen)).map(key);
  assert(moves("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").includes("e1c1"));
  assert(moves("k7/8/8/3pP3/8/8/8/K7 w - d6 0 1").includes("e5d6"));
  assert.equal(
    moves("7k/P7/8/8/8/8/8/K7 w - - 0 1").filter((k) => k.startsWith("a7a8"))
      .length,
    4,
  );
  for (const [fen, v] of [
    ["7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", "Мат"],
    ["7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "пат"],
    ["k7/8/8/8/8/8/8/K7 w - - 0 1", "материала"],
  ])
    assert(gameStatus([parseFen(fen)]).text.includes(v));
  for (const [n, k] of [
    [100, "claim"],
    [150, "done"],
  ])
    assert(gameStatus([parseFen(startFen.replace("0 1", n + " 1"))])[k]);
  const s = parseFen(startFen);
  assert(gameStatus([s, s, s]).claim);
  assert(gameStatus([s, s, s, s, s]).done);
});
test("Часы, добавление, сворачивание и ничья по времени", () => {
  const g = createGame({ minutes: 1, increment: 2 }, 0),
    h = replay(g);
  assert(play(g, h, "e2e4", 10000));
  assert.deepEqual(remaining(g, -1, 15000), [52000, 55000]);
  assert(timeout(g, h.at(-1), 70000));
  assert.equal(g.result.winner, 1);
  const b = createGame(
    { minutes: 1, initial: "k7/8/8/8/8/8/1R6/K7 w - - 0 1" },
    0,
  );
  timeout(b, replay(b)[0], 60001);
  assert.equal(b.result.winner, 0);
});
test("PGN, миграция и повторный запуск", () => {
  const g = readPGN("1. e4 e5 2. Nf3 *");
  assert.deepEqual(readPGN(pgn(g)).moves, g.moves);
  const h = replay(g),
    raw = JSON.stringify({
      history: h,
      moves: g.moves.map((u, i) => ({ m: findMove(h[i], u) })),
      human: -1,
      level: "strong",
    });
  const map = new Map([["offline-chess-v1", raw]]),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const first = load(storage);
  assert.equal(load(storage).current.id, first.current.id);
  assert.equal(map.get("offline-chess-v1"), raw);
  assert.deepEqual(first.current.moves, g.moves);
});
test("Рейтинг только за завершённую игру с компьютером", () => {
  const g = createGame();
  finish(g, 1, "Мат");
  assert(stats([g]).rating > 1200);
  assert.equal(stats([{ ...g, mode: "local" }]).rating, 1200);
});
test("Все учебные линии и 100 уникальных задач легальны", () => {
  const puzzles = JSON.parse(
    fs.readFileSync(new URL("../data/puzzles.json", import.meta.url)),
  );
  assert.equal(puzzles.length, 100);
  assert.equal(new Set(puzzles.map((v) => v.initial)).size, 100);
  for (const v of [...puzzles, ...lessons]) {
    let s = parseFen(v.initial || startFen);
    for (const u of v.line) {
      const m = findMove(s, u);
      assert(m, v.id + " " + u);
      s = apply(s, m);
    }
    if (v.tag?.startsWith("mateIn")) assert.match(gameStatus([s]).text, /Мат/);
  }
});
test("Копия восстанавливается полностью, повреждение обнаруживается", async () => {
  const { encodeBackup, decodeBackup } = await import("../js/store.js"),
    p = empty();
  p.current = readPGN("1. e4 e5 *");
  const encoded = await encodeBackup(p);
  assert.deepEqual(await decodeBackup(encoded), p);
  await assert.rejects(decodeBackup(encoded.replace("e2e4", "e2e3")));
});
test("Мёртвая пешечная позиция и объявление ничьей перед ходом", () => {
  assert.match(
    gameStatus([parseFen("7k/8/8/p1p1p1p1/P1P1P1P1/8/8/K7 w - - 0 1")]).text,
    /мёртвая/,
  );
  const g = readPGN("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 *");
  assert.match(gameStatus(replay(g)).claim, /Ng8/);
});
test("Возобновление после дедлайна сохраняет реальную дату окончания", () => {
  const g = createGame({ minutes: 1 }, 1000),
    h = replay(g);
  assert.equal(timeout(g, h[0], 200000), true);
  assert.equal(g.result.at, 61000);
  assert.deepEqual(g.clock, [0, 60000]);
});
test("Тренер различает сторону мата и не называет горизонтальный ход развитием", async () => {
  const { scoreText, explain } = await import("../js/coach.js");
  assert.match(scoreText({ unit: "mate", value: -3 }), /соперник.*3/);
  assert.match(scoreText({ unit: "cp", value: 125 }), /\+1\.25/);
  const s = parseFen("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1");
  assert.match(explain(s, "c1f4"), /горизонтали/);
});
test("План тренера опирается на легальную линию и не выдумывает ответ", async () => {
  const { plan } = await import("../js/coach.js"),
    s = parseFen(startFen);
  const text = plan(s, ["e2e4", "e7e5", "g1f3"]);
  assert.match(text, /расчётных ответов — e5/);
  assert.match(text, /продолжить Nf3/);
  assert.doesNotMatch(plan(s, ["e2e4", "e7e3"]), /ответов/);
});
test("Тренер проверяет, может ли связанный конь взять пешку", async () => {
  const { explain } = await import("../js/coach.js");
  const pinned = parseFen("4k3/8/2n5/1B6/8/8/1P6/4K3 w - - 0 1");
  const free = parseFen("5k2/8/2n5/1B6/8/8/1P6/4K3 w - - 0 1");
  assert.doesNotMatch(explain(pinned, "b2b4"), /Nxb4/);
  assert.match(explain(free, "b2b4"), /Nxb4/);
});
