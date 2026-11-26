const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const dirs = {
  n: [-33, -31, -18, -14, 14, 18, 31, 33],
  b: [-17, -15, 15, 17],
  r: [-16, -1, 1, 16],
  k: [-17, -16, -15, -1, 1, 15, 16, 17],
};
const on = (i) => i >= 0 && i < 128 && !(i & 0x88),
  side = (p) => (!p || p === "." ? 0 : p === p.toUpperCase() ? 1 : -1),
  sq = (i) => "abcdefgh"[i & 7] + (8 - (i >> 4)),
  index = (s) => (8 - Number(s[1])) * 16 + "abcdefgh".indexOf(s[0]),
  key = (m) => sq(m[0]) + sq(m[1]) + m[2];
function parseFen(fen) {
  if (typeof fen !== "string") throw Error("Некорректная FEN");
  const f = fen.trim().split(/\s+/),
    b = Array(128).fill(".");
  const ranks = f[0].split("/");
  if (
    f.length !== 6 ||
    ranks.length !== 8 ||
    ranks.some(
      (row) =>
        !/^[prnbqkPRNBQK1-8]+$/.test(row) ||
        [...row].reduce((n, c) => n + (Number(c) || 1), 0) !== 8,
    ) ||
    (f[0].match(/K/g) || []).length !== 1 ||
    (f[0].match(/k/g) || []).length !== 1 ||
    !/^[wb]$/.test(f[1]) ||
    !/^(?:-|K?Q?k?q?)$/.test(f[2]) ||
    !/^(?:-|[a-h][36])$/.test(f[3]) ||
    !/^\d+$/.test(f[4]) ||
    !/^[1-9]\d*$/.test(f[5])
  )
    throw Error("Некорректная FEN");
  ranks.forEach((row, r) => {
    let c = 0;
    for (const p of row) {
      if (/[1-8]/.test(p)) c += +p;
      else b[r * 16 + c++] = p;
    }
  });
  return {
    b,
    t: f[1] === "w" ? 1 : -1,
    c:
      (f[2].includes("K") ? 1 : 0) |
      (f[2].includes("Q") ? 2 : 0) |
      (f[2].includes("k") ? 4 : 0) |
      (f[2].includes("q") ? 8 : 0),
    ep: f[3] === "-" ? -1 : index(f[3]),
    half: +f[4],
    full: +f[5],
  };
}
function attacked(s, target, by) {
  const b = s.b;
  for (const d of [-1, 1]) {
    const f = target + 16 * by + d;
    if (on(f) && b[f] === (by === 1 ? "P" : "p")) return true;
  }
  for (const d of dirs.n) {
    const f = target + d;
    if (on(f) && b[f] === (by === 1 ? "N" : "n")) return true;
  }
  for (const d of dirs.k) {
    let dist = 0;
    for (let f = target + d; on(f); f += d) {
      dist++;
      if (b[f] === ".") continue;
      if (side(b[f]) === by) {
        const p = b[f].toLowerCase();
        if (
          p === "q" ||
          (p === "k" && dist === 1) ||
          (p === "b" && Math.abs(d) !== 16 && Math.abs(d) !== 1) ||
          (p === "r" && (Math.abs(d) === 16 || Math.abs(d) === 1))
        )
          return true;
      }
      break;
    }
  }
  return false;
}
const checked = (s, color = s.t) =>
  attacked(s, s.b.indexOf(color === 1 ? "K" : "k"), -color);
function apply(s, m) {
  const [f, t, promo, flag] = m,
    b = s.b.slice(),
    piece = b[f],
    captured = b[t];
  let c = s.c;
  b[f] = ".";
  b[t] = promo ? (s.t === 1 ? promo.toUpperCase() : promo) : piece;
  if (flag === "ep") b[t + 16 * s.t] = ".";
  if (flag === "castle") {
    const rf = t > f ? f + 3 : f - 4,
      rt = t > f ? f + 1 : f - 1;
    b[rt] = b[rf];
    b[rf] = ".";
  }
  if (piece === "K") c &= ~3;
  if (piece === "k") c &= ~12;
  const rb = { 119: 1, 112: 2, 7: 4, 0: 8 };
  if (piece.toLowerCase() === "r") c &= ~(rb[f] || 0);
  if (captured.toLowerCase() === "r") c &= ~(rb[t] || 0);
  return {
    b,
    t: -s.t,
    c,
    ep:
      piece.toLowerCase() === "p" && Math.abs(t - f) === 32 ? (t + f) / 2 : -1,
    half:
      piece.toLowerCase() === "p" || captured !== "." || flag === "ep"
        ? 0
        : s.half + 1,
    full: s.full + (s.t === -1 ? 1 : 0),
  };
}
function pseudo(s) {
  const out = [];
  for (let f = 0; f < 128; f++) {
    if (!on(f) || side(s.b[f]) !== s.t) continue;
    const p = s.b[f].toLowerCase();
    const add = (t, flag = "") => {
      if (s.b[t].toLowerCase() === "k") return;
      if (p === "p" && (t >> 4 === 0 || t >> 4 === 7))
        for (const q of ["q", "r", "b", "n"]) out.push([f, t, q, flag]);
      else out.push([f, t, "", flag]);
    };
    if (p === "p") {
      const t = f - 16 * s.t;
      if (on(t) && s.b[t] === ".") {
        add(t);
        const u = t - 16 * s.t;
        if (f >> 4 === (s.t === 1 ? 6 : 1) && s.b[u] === ".") add(u);
      }
      for (const d of [-1, 1]) {
        const u = t + d;
        if (!on(u)) continue;
        if (side(s.b[u]) === -s.t) add(u);
        else if (
          u === s.ep &&
          s.b[u] === "." &&
          s.b[u + 16 * s.t] === (s.t === 1 ? "p" : "P")
        )
          add(u, "ep");
      }
    } else {
      for (const d of dirs[p] || dirs.k)
        for (let t = f + d; on(t); t += d) {
          if (side(s.b[t]) === s.t) break;
          add(t);
          if (s.b[t] !== "." || p === "n" || p === "k") break;
        }
      const home = s.t === 1 ? 116 : 4,
        rook = s.t === 1 ? "R" : "r",
        bits = s.t === 1 ? [1, 2] : [4, 8];
      if (p === "k" && f === home && !checked(s)) {
        if (
          s.c & bits[0] &&
          s.b[f + 3] === rook &&
          s.b[f + 1] === "." &&
          s.b[f + 2] === "." &&
          !attacked(s, f + 1, -s.t) &&
          !attacked(s, f + 2, -s.t)
        )
          add(f + 2, "castle");
        if (
          s.c & bits[1] &&
          s.b[f - 4] === rook &&
          s.b[f - 1] === "." &&
          s.b[f - 2] === "." &&
          s.b[f - 3] === "." &&
          !attacked(s, f - 1, -s.t) &&
          !attacked(s, f - 2, -s.t)
        )
          add(f - 2, "castle");
      }
    }
  }
  return out;
}
const legal = (s) => pseudo(s).filter((m) => !checked(apply(s, m), s.t));
function san(s, m) {
  const [f, t, promo, flag] = m,
    p = s.b[f].toUpperCase(),
    capture = s.b[t] !== "." || flag === "ep";
  let text = "";
  if (flag === "castle") text = t > f ? "O-O" : "O-O-O";
  else {
    if (p !== "P") {
      text = p;
      const other = legal(s).filter(
        (x) => x[0] !== f && x[1] === t && s.b[x[0]] === s.b[f],
      );
      if (other.length)
        text += !other.some((x) => (x[0] & 7) === (f & 7))
          ? sq(f)[0]
          : !other.some((x) => x[0] >> 4 === f >> 4)
            ? sq(f)[1]
            : sq(f);
    } else if (capture) text = sq(f)[0];
    text +=
      (capture ? "x" : "") + sq(t) + (promo ? "=" + promo.toUpperCase() : "");
  }
  const next = apply(s, m);
  return text + (checked(next) ? (legal(next).length ? "+" : "#") : "");
}
const positionKey = (s) =>
  s.b.join("") +
  ":" +
  s.t +
  ":" +
  s.c +
  ":" +
  (s.ep >= 0 && legal(s).some((m) => m[3] === "ep") ? s.ep : -1);
function insufficient(s) {
  const p = [];
  for (let i = 0; i < 128; i++)
    if (on(i) && s.b[i] !== "." && s.b[i].toLowerCase() !== "k")
      p.push([s.b[i].toLowerCase(), ((i >> 4) + (i & 7)) % 2]);
  return (
    !p.length ||
    (p.length === 1 && ["b", "n"].includes(p[0][0])) ||
    (p.every((x) => x[0] === "b") && new Set(p.map((x) => x[1])).size === 1)
  );
}
// В закрытом пешечном окончании перебираем только положения двух королей.
function lockedKings(s) {
  if (s.ep >= 0 || s.b.some((p) => "rnbq".includes(p.toLowerCase())))
    return false;
  const pawns = s.b.flatMap((p, i) => (p.toLowerCase() === "p" ? [i] : []));
  if (
    !pawns.length ||
    pawns.some((i) => s.b[i - 16 * side(s.b[i])]?.toLowerCase() !== "p")
  )
    return false;
  const queue = [s],
    seen = new Set();
  for (let n = 0; n < queue.length; n++) {
    const pos = queue[n],
      id = pos.t + ":" + pos.b.indexOf("K") + ":" + pos.b.indexOf("k");
    if (seen.has(id)) continue;
    seen.add(id);
    const choices = legal(pos);
    if (!choices.length && checked(pos)) return false;
    for (const m of choices) {
      if (pos.b[m[0]].toLowerCase() !== "k" || pos.b[m[1]] !== ".")
        return false;
      queue.push(apply(pos, m));
    }
  }
  return true;
}
function gameStatus(h) {
  const s = h[h.length - 1],
    moves = legal(s),
    check = checked(s),
    k = positionKey(s),
    reps = h.filter((p) => positionKey(p) === k).length;
  if (!moves.length)
    return {
      done: true,
      text: check
        ? "Мат. Победили " + (s.t === 1 ? "чёрные" : "белые")
        : "Ничья — пат",
    };
  if (insufficient(s))
    return { done: true, text: "Ничья — недостаточно материала" };
  if (lockedKings(s)) return { done: true, text: "Ничья — мёртвая позиция" };
  if (s.half >= 150 || reps >= 5)
    return {
      done: true,
      text:
        "Ничья — " +
        (s.half >= 150 ? "правило 75 ходов" : "пятикратное повторение"),
    };
  let intended = "";
  if (reps < 3 && s.half < 100 && moves.length) {
    const counts = new Map();
    if (h.length >= 7)
      for (const previous of h.slice(-s.half - 1)) {
        const k = positionKey(previous);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    if (s.half === 99 || [...counts.values()].some((n) => n >= 2))
      for (const m of moves) {
        const next = apply(s, m);
        if (next.half >= 100 || counts.get(positionKey(next)) >= 2) {
          intended =
            (next.half >= 100 ? "правило 50 ходов" : "троекратное повторение") +
            " при заявленном ходе " +
            san(s, m);
          break;
        }
      }
  }
  return {
    done: false,
    text: (s.t === 1 ? "Ход белых" : "Ход чёрных") + (check ? " · Шах" : ""),
    claim:
      reps >= 3
        ? "троекратное повторение"
        : s.half >= 100
          ? "правило 50 ходов"
          : intended,
  };
}

export {
  startFen,
  parseFen,
  side,
  sq,
  index,
  key,
  checked,
  attacked,
  apply,
  legal,
  san,
  gameStatus,
  insufficient,
  lockedKings,
  positionKey,
};
