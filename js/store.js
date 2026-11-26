import { createGame, replay, fen } from "./game.js";
import { key } from "./rules.js";
const snapshots = new WeakMap();
const KEY = "chess-profile-v1.1";
export function empty() {
  return {
    version: 1,
    current: null,
    games: {},
    analysis: {},
    lessons: {},
    puzzles: {},
    prefs: {
      theme: "auto",
      board: "green",
      sound: true,
      volume: 0.5,
      rotate: false,
    },
  };
}
export function validate(x) {
  if (
    x?.version !== 1 ||
    !x.prefs ||
    ["games", "analysis", "lessons", "puzzles"].some(
      (k) => !x[k] || typeof x[k] !== "object" || Array.isArray(x[k]),
    )
  )
    throw Error("Неверный формат копии");
  if (x.puzzleRating !== undefined && !Number.isSafeInteger(x.puzzleRating))
    throw Error("Некорректный рейтинг задач");
  if (Object.entries(x.games).some(([id, g]) => id !== g?.id))
    throw Error("Некорректный идентификатор архивной партии");
  for (const g of [
    ...Object.values(x.games),
    ...(x.current ? [x.current] : []),
  ]) {
    if (
      !Array.isArray(g.moves) ||
      !Array.isArray(g.clock) ||
      g.clock.length !== 2 ||
      !g.clock.every(Number.isFinite) ||
      typeof g.id !== "string" ||
      !g.id ||
      !["computer", "local", "import", "online"].includes(g.mode) ||
      ![1, -1].includes(g.human) ||
      !Number.isFinite(g.minutes) ||
      g.minutes < 0 ||
      !Number.isFinite(g.increment) ||
      g.increment < 0 ||
      (g.result &&
        (![0, 1, -1].includes(g.result.winner) ||
          !Number.isFinite(g.result.at) ||
          typeof g.result.reason !== "string")) ||
      !Number.isFinite(g.started)
    )
      throw Error("Повреждённая партия");
    replay(g);
  }
  return x;
}
export function migrate(raw) {
  const x = JSON.parse(raw),
    g = createGame({ human: x.human, level: x.level });
  g.migrated = true;
  g.moves = x.moves.map((v) => key(v.m));
  const h = replay(g);
  if (
    h.length !== x.history.length ||
    h.some((s, i) => fen(s) !== fen(x.history[i]))
  )
    throw Error("История партии повреждена");
  g.flipped = !!x.flip;
  if (x.claimed) g.result = { winner: 0, reason: x.claimed, at: Date.now() };
  else {
    const st = gameStatus(h);
    if (st.done)
      g.result = {
        winner: st.text.startsWith("Мат") ? -h.at(-1).t : 0,
        reason: st.text,
        at: Date.now(),
      };
  }
  return g;
}
import { gameStatus } from "./rules.js";
export function load(storage) {
  const raw = storage.getItem(KEY);
  snapshots.set(storage, raw);
  if (raw) return validate(JSON.parse(raw));
  const x = empty(),
    legacy = storage.getItem("offline-chess-v1");
  if (legacy) {
    x.current = migrate(legacy);
    archive(x);
    save(storage, x);
  }
  return x;
}
export function save(storage, x, replace = false) {
  if (
    !replace &&
    snapshots.has(storage) &&
    storage.getItem(KEY) !== snapshots.get(storage)
  )
    throw Error(
      "Профиль изменён в другой вкладке. Скачайте резервную копию этой партии перед перезагрузкой.",
    );
  const text = JSON.stringify(x);
  storage.setItem(KEY, text);
  snapshots.set(storage, text);
}
export function archive(x) {
  if (x.current?.result) x.games[x.current.id] = structuredClone(x.current);
}
export function stats(games) {
  let rating = 1200,
    best = 1200,
    streak = 0,
    longest = 0;
  const points = [],
    totals = { wins: 0, losses: 0, draws: 0 };
  for (const g of games
    .filter((g) => g.result && g.mode === "computer")
    .sort((a, b) => a.result.at - b.result.at)) {
    const score =
      g.result.winner === 0 ? 0.5 : g.result.winner === g.human ? 1 : 0;
    totals[score === 1 ? "wins" : score === 0 ? "losses" : "draws"]++;
    const strength =
      {
        beginner: 700,
        amateur: 1100,
        medium: 1500,
        strong: 2000,
        expert: 2500,
      }[g.level] || 1500;
    const delta = Math.round(
      24 * (score - 1 / (1 + 10 ** ((strength - rating) / 400))),
    );
    rating += delta;
    best = Math.max(rating, best);
    streak = score === 1 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
    points.push({ id: g.id, rating, delta });
  }
  return { ...totals, rating, best, longest, points };
}
async function checksum(text) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function encodeBackup(profile) {
  const payload = JSON.stringify(profile);
  return JSON.stringify({
    format: "chess-backup-1",
    sha256: await checksum(payload),
    payload,
  });
}
export async function decodeBackup(text) {
  const wrapper = JSON.parse(text);
  if (
    wrapper.format !== "chess-backup-1" ||
    typeof wrapper.payload !== "string" ||
    (await checksum(wrapper.payload)) !== wrapper.sha256
  )
    throw Error("Контрольная сумма резервной копии не совпадает");
  return validate(JSON.parse(wrapper.payload));
}
