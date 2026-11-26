import { fen, findMove } from "./game.js";
export const levels = {
  beginner: ["Новичок", 0, 2, 100],
  amateur: ["Любитель", 3, 5, 220],
  medium: ["Средний", 8, 9, 450],
  strong: ["Сильный", 15, 15, 1000],
  expert: ["Эксперт", 20, 24, 2200],
};
export function search(
  state,
  { level = "expert", depth, ms, signal, root } = {},
) {
  const [, skill, d, t] = levels[level];
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(
        "../vendor/stockfish/stockfish-17-lite-single.js",
        import.meta.url,
      ),
    );
    const timer = setTimeout(
      () => end(null, Error("Движок не ответил вовремя")),
      20000 + (ms || t),
    );
    const byDepth = {};
    const linesByMove = new Map();
    function abort() {
      end(null, new DOMException("Расчёт остановлен", "AbortError"));
    }
    function end(value, error) {
      worker.terminate();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value);
    }
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    const send = (v) => worker.postMessage(v);
    worker.onerror = () => end(null, Error("Не удалось запустить Stockfish"));
    worker.onmessage = ({ data }) => {
      const line = String(data);
      if (line === "uciok") {
        send("setoption name Hash value 8");
        send("setoption name Skill Level value " + skill);
        send("isready");
      } else if (line === "readyok") {
        send("position fen " + fen(state));
        send(
          "go depth " +
            (depth || d) +
            " movetime " +
            (ms || t) +
            (root ? " searchmoves " + root : ""),
        );
      } else if (line.startsWith("info depth")) {
        const v = line.match(/ score (cp|mate) (-?\d+)/),
          p = line.match(/ pv (.+)/);
        if (v && p && !/lowerbound|upperbound/.test(line)) {
          const pv = p[1].trim().split(/\s+/),
            entry = { u: pv[0], pv, score: { unit: v[1], value: +v[2] } };
          linesByMove.set(entry.u, entry);
          if (!/ multipv (?!1 )\d+ /.test(line))
            byDepth[line.split(" ")[2]] = entry;
        }
      } else if (line.startsWith("bestmove ")) {
        const u = line.split(" ")[1];
        if (!findMove(state, u) || (root && root !== u))
          return end(null, Error("Движок вернул недопустимый ход"));
        const result = linesByMove.get(u) || { u, score: null, pv: [u] };
        end({ ...result, byDepth });
      }
    };
    send("uci");
  });
}
