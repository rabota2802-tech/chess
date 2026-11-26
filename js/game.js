import {
  startFen,
  parseFen,
  apply,
  legal,
  key,
  san,
  gameStatus,
  side,
  insufficient,
  lockedKings,
  checked,
  sq,
} from "./rules.js";
export function fen(s) {
  const rows = Array.from({ length: 8 }, (_, r) =>
    s.b
      .slice(r * 16, r * 16 + 8)
      .join("")
      .replace(/\.+/g, (v) => v.length),
  );
  return [
    rows.join("/"),
    s.t === 1 ? "w" : "b",
    [..."KQkq"].filter((_, i) => s.c & (1 << i)).join("") || "-",
    s.ep < 0 ? "-" : sq(s.ep),
    s.half,
    s.full,
  ].join(" ");
}
export function createGame(
  {
    mode = "computer",
    human = 1,
    level = "medium",
    minutes = 0,
    increment = 0,
    initial = startFen,
  } = {},
  now = Date.now(),
) {
  return {
    id: crypto.randomUUID(),
    mode,
    human,
    level,
    minutes,
    increment,
    initial,
    moves: [],
    created: now,
    started: now,
    clock: [minutes * 60000, minutes * 60000],
    result: null,
    offer: null,
  };
}
export function replay(g) {
  const history = [parseFen(g.initial)];
  for (const u of g.moves) {
    const s = history.at(-1),
      m = findMove(s, u);
    if (!m) throw Error("Недопустимый ход " + u);
    history.push(apply(s, m));
  }
  return history;
}
export const findMove = (s, u) => legal(s).find((m) => key(m) === u);
export const remaining = (g, turn, now = Date.now()) =>
  g.clock.map((v, i) =>
    Math.max(
      0,
      v -
        (g.minutes && !g.result && i === (turn === 1 ? 0 : 1)
          ? Math.max(0, now - g.started)
          : 0),
    ),
  );
export function finish(g, winner, reason, now = Date.now()) {
  if (g.result) return;
  const turn =
    g.moves.length % 2 ? -parseFen(g.initial).t : parseFen(g.initial).t;
  g.clock = remaining(g, turn, now);
  g.result = { winner, reason, at: now };
  g.offer = null;
}
export function timeout(g, s, now = Date.now()) {
  if (!g.minutes || g.result || remaining(g, s.t, now)[s.t === 1 ? 0 : 1] > 0)
    return false;
  const army = s.b
    .filter((p) => side(p) === -s.t && p.toLowerCase() !== "k")
    .map((p) => p.toLowerCase());
  const defender = s.b
    .filter((p) => side(p) === s.t)
    .map((p) => p.toLowerCase());
  const knightAlone =
    army.length === 1 &&
    army[0] === "n" &&
    defender.every((p) => p === "k" || p === "q");
  const bishopsOnly =
    army.every((p) => p === "b") &&
    !s.b.some((p) => "pn".includes(p.toLowerCase()));
  const bishopColors = new Set(
    s.b.flatMap((p, i) =>
      p.toLowerCase() === "b" ? [((i >> 4) + (i & 7)) % 2] : [],
    ),
  );
  const possible =
    army.length > 0 &&
    !insufficient(s) &&
    !lockedKings(s) &&
    !knightAlone &&
    !(bishopsOnly && bishopColors.size === 1);
  finish(g, possible ? -s.t : 0, "Время истекло", now);
  return true;
}
export function play(g, h, u, now = Date.now()) {
  const s = h.at(-1);
  if (g.result || timeout(g, s, now)) return false;
  const m = findMove(s, u);
  if (!m) return false;
  g.clock = remaining(g, s.t, now);
  if (g.minutes) g.clock[s.t === 1 ? 0 : 1] += 1000 * g.increment;
  g.started = now;
  g.moves.push(u);
  g.offer = null;
  h.push(apply(s, m));
  const st = gameStatus(h);
  if (st.done)
    finish(
      g,
      checked(h.at(-1)) && st.text.startsWith("Мат") ? s.t : 0,
      st.text,
      now,
    );
  return true;
}
export function notation(g, h = replay(g)) {
  return g.moves.map((u, i) => san(h[i], findMove(h[i], u)));
}
export function pgn(g) {
  const res = g.result
    ? { 1: "1-0", "-1": "0-1", 0: "1/2-1/2" }[g.result.winner]
    : "*";
  return (
    '[Result "' +
    res +
    '"]\n' +
    (g.initial !== startFen ? '[SetUp "1"]\n[FEN "' + g.initial + '"]\n' : "") +
    "\n" +
    notation(g)
      .map((text, i) => {
        const start = parseFen(g.initial),
          ply = i + (start.t === -1 ? 1 : 0),
          number = start.full + Math.floor(ply / 2);
        return (
          (ply % 2 ? (i === 0 ? number + "... " : "") : number + ". ") + text
        );
      })
      .join(" ") +
    " " +
    res
  );
}
export function readPGN(text) {
  const initial = text.match(/\[FEN "([^"]+)"\]/)?.[1] || startFen,
    g = createGame({ mode: "import", initial }),
    h = replay(g);
  const moves = text
    .replace(/\[[^\]]*\]|\{[^}]*\}|;[^\n]*|\$\d+/g, " ")
    .replace(/\d+\.(?:\.\.)?/g, " ")
    .trim()
    .split(/\s+/);
  for (const token of moves) {
    if (!token || token === "*") continue;
    if (["1-0", "0-1", "1/2-1/2"].includes(token)) {
      if (!g.result)
        finish(
          g,
          token === "1-0" ? 1 : token === "0-1" ? -1 : 0,
          "Результат PGN",
        );
      break;
    }
    const s = h.at(-1),
      m = legal(s).find(
        (m) => san(s, m) === token.replace(/[!?]/g, "").replace(/0/g, "O"),
      );
    if (!m || !play(g, h, key(m)))
      throw Error("Не удалось прочитать ход " + token);
  }
  return g;
}
