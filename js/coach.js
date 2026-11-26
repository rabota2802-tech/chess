import {
  attacked,
  apply,
  side,
  sq,
  checked,
  san,
  legal,
  key,
} from "./rules.js";
import { findMove } from "./game.js";
import { names } from "./board.js";
export function variation(s, pv, limit = 7) {
  const out = [];
  for (const u of pv.slice(0, limit)) {
    const m = findMove(s, u);
    if (!m) break;
    out.push(san(s, m));
    s = apply(s, m);
  }
  return out.join(" ");
}
export function plan(s, line, played = false) {
  const m = findMove(s, line[0]);
  if (!m) return "";
  const n = apply(s, m),
    reply = findMove(n, line[1]);
  const first =
    (played ? "Сыграно " : "Рассмотрите ") +
    san(s, m) +
    ". " +
    explain(s, key(m));
  if (!reply) return first;
  const after = apply(n, reply),
    continuation = findMove(after, line[2]);
  return (
    first +
    " Один из расчётных ответов — " +
    san(n, reply) +
    ". " +
    explain(n, key(reply)) +
    (continuation
      ? " Тогда можно продолжить " + san(after, continuation) + "."
      : "")
  );
}
export function explain(s, u) {
  const m = findMove(s, u);
  if (!m) return "";
  const n = apply(s, m),
    p = s.b[m[0]].toLowerCase(),
    to = sq(m[1]);
  let out = [
    names[p][0].toUpperCase() + names[p].slice(1) + " переходит на " + to + ".",
  ];
  if (s.b[m[1]] !== ".")
    out.push("Взята фигура: " + names[s.b[m[1]].toLowerCase()] + ".");
  if (m[3] === "ep") out.push("Взята пешка на проходе.");
  if (m[3] === "castle") out.push("Рокировка соединяет ход короля и ладьи.");
  if (m[2]) out.push("Пешка превращается в новую фигуру.");
  if (checked(n))
    out.push(legal(n).length ? "Король соперника под шахом." : "Это мат.");
  if (["d4", "e4", "d5", "e5"].includes(to))
    out.push("Фигура занимает центральное поле.");
  if (
    ["n", "b"].includes(p) &&
    m[0] >> 4 === (s.t === 1 ? 7 : 0) &&
    m[1] >> 4 !== m[0] >> 4
  )
    out.push("Лёгкая фигура выходит с исходной горизонтали.");
  const threats = [],
    defended = [];
  // Inspect prospective captures if the opponent leaves the position intact.
  const before = new Set(legal(s).map((move) => move[1]));
  const nextMoves = legal({ ...n, t: s.t, ep: -1 });
  const after = new Set(nextMoves.map((move) => move[1]));
  for (let i = 0; i < 120; i++) {
    if (i & 8 || n.b[i] === "." || i === m[1]) continue;
    if (side(n.b[i]) === -s.t && !before.has(i) && after.has(i))
      threats.push(sq(i));
    if (side(n.b[i]) === s.t && !attacked(s, i, s.t) && attacked(n, i, s.t))
      defended.push(sq(i));
  }
  if (threats.length)
    out.push(
      "Возможная цель — подготовить взятие на " +
        threats.join(", ") +
        ", если соперник позволит.",
    );
  if (defended.length)
    out.push(
      "Свои фигуры теперь контролируют поля " + defended.join(", ") + ".",
    );
  const capture = legal(n).find(
    (move) => (move[3] === "ep" ? move[1] + 16 * n.t : move[1]) === m[1],
  );
  if (capture) {
    out.push(
      "Соперник может ответить " + san(n, capture) + " и взять эту фигуру.",
    );
  }
  out.push(features(s, m, n, nextMoves));
  return out.join(" ").trim();
}
export const scoreText = (s) =>
  !s
    ? "нет оценки"
    : s.unit === "mate"
      ? s.value === 0
        ? "мат на доске"
        : s.value > 0
          ? "своими фигурами мат за " + s.value
          : "соперник ставит мат за " + Math.abs(s.value)
      : (s.value > 0 ? "+" : "") + (s.value / 100).toFixed(2) + " пеш.";
export function classify(best, actual) {
  if (best.byDepth && actual.byDepth) {
    const depth = Object.keys(best.byDepth)
      .filter((d) => actual.byDepth[d])
      .map(Number)
      .sort((a, b) => b - a)[0];
    if (!depth) return "Нет сопоставимой оценки";
    best = best.byDepth[depth];
    actual = actual.byDepth[depth];
  }
  if (!best.score || !actual.score) return "Нет оценки";
  const val = (s) =>
    s.unit === "cp"
      ? s.value
      : Math.sign(s.value) * (100000 - Math.abs(s.value));
  const loss = val(best.score) - val(actual.score);
  return best.u === actual.u
    ? "Лучший ход"
    : loss < 50
      ? "Хороший ход"
      : loss < 100
        ? "Неточность"
        : loss < 200
          ? "Ошибка"
          : "Грубая ошибка";
}
// Проверяем направление лучей от каждой фигуры, включая перекрытые линии.
const rays = [-17, -16, -15, -1, 1, 15, 16, 17];
function targets(s, from) {
  const p = s.b[from].toLowerCase(),
    color = side(s.b[from]),
    out = [];
  const dirs =
    p === "p"
      ? [-16 * color - 1, -16 * color + 1]
      : p === "n"
        ? [-33, -31, -18, -14, 14, 18, 31, 33]
        : rays;
  for (const d of dirs) {
    const diagonal = [15, 17].includes(Math.abs(d));
    if ((p === "r" && diagonal) || (p === "b" && !diagonal)) continue;
    for (let i = from + d; i >= 0 && i < 120 && !(i & 8); i += d) {
      out.push(i);
      if (s.b[i] !== "." || "pnk".includes(p)) break;
    }
  }
  return out;
}
function features(s, m, n, nextMoves) {
  const to = m[1],
    out = [],
    pieces = n.b;
  const hits = targets(n, to).filter(
    (i) =>
      side(pieces[i]) === -s.t &&
      pieces[i].toLowerCase() !== "p" &&
      (pieces[i].toLowerCase() === "k" ||
        nextMoves.some((move) => move[0] === to && move[1] === i)),
  );
  if (hits.length >= 2)
    out.push(
      "Возможная цель — двойной удар по фигурам на " +
        hits.map(sq).join(" и ") +
        ".",
    );
  for (let i = 0; i < 120; i++) {
    if (i & 8 || side(n.b[i]) !== s.t || !"brq".includes(n.b[i].toLowerCase()))
      continue;
    if (i !== to && s.b[i] === n.b[i]) {
      const exposed = targets(n, i).filter(
        (j) => side(n.b[j]) === -s.t && !targets(s, i).includes(j),
      );
      if (exposed.length)
        out.push(
          "Открылась линия атаки с " +
            sq(i) +
            " на " +
            exposed.map(sq).join(", ") +
            ".",
        );
    }
    if (i !== to) continue;
    for (const j of targets(n, i)) {
      if (side(n.b[j]) !== -s.t || n.b[j].toLowerCase() === "k") continue;
      const copy = { ...n, b: n.b.slice() };
      copy.b[j] = ".";
      const king = n.b.indexOf(s.t === 1 ? "k" : "K");
      if (targets(copy, i).includes(king) && !targets(n, i).includes(king))
        out.push("Фигура на " + sq(j) + " связана с королём.");
    }
  }
  return out.join(" ");
}
export function overview(s) {
  const values = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 },
    army = [0, 0],
    files = [Array(8).fill(0), Array(8).fill(0)];
  for (let i = 0; i < 120; i++) {
    if (i & 8 || s.b[i] === ".") continue;
    const color = side(s.b[i]) === 1 ? 0 : 1,
      p = s.b[i].toLowerCase();
    army[color] += values[p];
    if (p === "p") files[color][i % 16]++;
  }
  const diff = army[0] - army[1],
    center = ["d4", "e4", "d5", "e5"].filter((v) =>
      attacked(s, (8 - Number(v[1])) * 16 + "abcdefgh".indexOf(v[0]), s.t),
    );
  const doubled = files[s.t === 1 ? 0 : 1].flatMap((n, i) =>
    n >= 2 ? ["abcdefgh"[i]] : [],
  );
  return (
    (diff
      ? "Материальный перевес " +
        (diff > 0 ? "белых" : "чёрных") +
        " — примерно " +
        Math.abs(diff) +
        " пеш."
      : "Материал равен.") +
    (center.length
      ? " Сторона хода контролирует " + center.join(", ") + "."
      : "") +
    (doubled.length
      ? " Сдвоенные пешки на линиях " + doubled.join(", ") + "."
      : "")
  );
}
