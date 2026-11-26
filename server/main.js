import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createGame, replay, play, finish, timeout } from "../js/game.js";
import { gameStatus } from "../js/rules.js";
const db = new DatabaseSync(process.env.CHESS_DB || "chess.sqlite");
db.exec(
  "PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, expires INTEGER, data TEXT)",
);
const port = Number(process.env.PORT || 8787),
  root = new URL("../", import.meta.url),
  origins = new Set(
    (
      process.env.ORIGINS ||
      "http://127.0.0.1:" + port + ",http://localhost:" + port
    ).split(","),
  );
const rates = new Map(),
  ttl = 7 * 86400000,
  hash = (s) => createHash("sha256").update(s).digest("hex"),
  token = () => randomBytes(32).toString("base64url");
function fail(status, msg) {
  throw Object.assign(Error(msg), { status });
}
function persist(r) {
  db.prepare("INSERT OR REPLACE INTO rooms VALUES(?,?,?)").run(
    r.id,
    Date.now() + ttl,
    JSON.stringify(r),
  );
}
function state(r, color) {
  return {
    id: r.id,
    game: r.g,
    revision: r.rev,
    color,
    names: r.names,
    ready: !!r.guest,
    training: r.training,
    rematch: r.rematch,
    now: Date.now(),
  };
}
function setup(b) {
  if (
    ![1, -1].includes(b.color) ||
    !Number.isInteger(b.minutes) ||
    b.minutes < 0 ||
    b.minutes > 1440 ||
    !Number.isInteger(b.increment) ||
    b.increment < 0 ||
    b.increment > 600
  )
    fail(400, "Недопустимый контроль времени");
}
const cleanup = setInterval(() => {
  rates.clear();
  db.prepare("DELETE FROM rooms WHERE expires < ?").run(Date.now());
}, 60000);
cleanup.unref();
async function body(req) {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 8192) fail(413, "Слишком большой запрос");
  }
  try {
    const data = JSON.parse(s || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    fail(400, "Неверный JSON");
  }
}
const server = http.createServer(async (req, res) => {
  const json = (code, x) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    res.end(JSON.stringify(x));
  };
  try {
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname,
      origin = req.headers.origin;
    if (path === "/health") return json(200, { ok: true });
    if (!path.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method)) fail(405, "Метод");
      const name = path.replace(/^\/chess\//, "") || "index.html";
      if (
        ![
          "vendor/stockfish/Copying.txt",
          "vendor/stockfish/source.tar.gz",
        ].includes(name) &&
        !/^(index\.html|style\.css|sw\.js|manifest\.webmanifest|icon-(192|512)\.png|js\/[\w-]+\.js|data\/puzzles\.json|vendor\/stockfish\/[\w.-]+\.(?:js|wasm))$/.test(
          name,
        )
      )
        fail(404, "Нет файла");
      const mime = {
        txt: "text/plain",
        gz: "application/gzip",
        html: "text/html",
        css: "text/css",
        js: "text/javascript",
        json: "application/json",
        wasm: "application/wasm",
        png: "image/png",
        webmanifest: "application/manifest+json",
      };
      const file = await readFile(new URL(name, root));
      res.writeHead(200, {
        "Content-Type": mime[name.split(".").at(-1)],
        "Cache-Control": "no-cache",
      });
      return res.end(file);
    }
    if (origin && !origins.has(origin)) fail(403, "Недопустимый Origin");
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
      });
      return res.end();
    }
    const ip = req.socket.remoteAddress,
      requests = (rates.get(ip) || 0) + 1;
    rates.set(ip, requests);
    if (requests > 600) fail(429, "Слишком много запросов");
    const b = req.method === "POST" ? await body(req) : {},
      key = req.headers.authorization?.replace(/^Bearer /, "") || "";
    if (!/^[a-zA-Z0-9_-]{40,64}$/.test(key)) fail(401, "Требуется ключ игрока");
    const who = hash(key),
      name = String(b.name || "Игрок").slice(0, 40);
    if (path === "/api/rooms" && req.method === "POST") {
      setup(b);
      const id = randomBytes(12).toString("hex"),
        invite = token(),
        r = {
          id,
          host: who,
          guest: null,
          invite: hash(invite),
          hostColor: b.color,
          names: { [b.color]: name },
          g: createGame({
            mode: "online",
            minutes: b.minutes,
            increment: b.increment,
          }),
          rev: 0,
          training: !!b.training,
          rematch: null,
          receipts: {},
        };
      persist(r);
      return json(201, { ...state(r, b.color), invite });
    }
    const match = path.match(/^\/api\/rooms\/([a-f0-9]{24})(\/join)?$/);
    if (!match) fail(404, "Комната не найдена");
    const row = db
      .prepare("SELECT data FROM rooms WHERE id=? AND expires>?")
      .get(match[1], Date.now());
    if (!row) fail(404, "Срок комнаты истёк");
    const r = JSON.parse(row.data);
    if (match[2]) {
      if (
        req.method !== "POST" ||
        hash(String(b.invite)) !== r.invite ||
        who === r.host ||
        (r.guest && r.guest !== who)
      )
        fail(403, "Приглашение недоступно");
      if (!r.guest) {
        r.guest = who;
        r.names[-r.hostColor] = name;
        r.training &&= !!b.training;
        r.g.started = Date.now();
        r.g.playedFrom = r.g.started;
        r.rev++;
        persist(r);
      }
      return json(200, state(r, -r.hostColor));
    }
    const color =
      r.host === who ? r.hostColor : r.guest === who ? -r.hostColor : 0;
    if (!color) fail(403, "Нет места игрока");
    const h = replay(r.g),
      s = h.at(-1);
    if (r.guest && timeout(r.g, s)) {
      r.rev++;
      persist(r);
    }
    if (req.method === "GET") return json(200, state(r, color));
    if (req.method !== "POST" || !r.guest) fail(409, "Ожидание соперника");
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(b.requestId || ""))
      fail(400, "Нет номера запроса");
    if (r.receipts[who] === b.requestId) return json(200, state(r, color));
    if (b.revision !== r.rev) fail(409, "Позиция изменилась");
    if (b.type === "rematch" && r.g.result) {
      if (r.rematch === -color) {
        r.g = createGame({
          mode: "online",
          minutes: r.g.minutes,
          increment: r.g.increment,
        });
        r.rematch = null;
      } else r.rematch = color;
    } else if (r.g.result) fail(409, "Партия завершена");
    else if (b.type === "move" && s.t === color && play(r.g, h, b.u)) {
    } else if (b.type === "resign") finish(r.g, -color, "Сдача");
    else if (b.type === "draw") {
      if (r.g.offer === -color) finish(r.g, 0, "Ничья по соглашению");
      else r.g.offer = color;
    } else if (b.type === "claim" && s.t === color && gameStatus(h).claim)
      finish(r.g, 0, gameStatus(h).claim);
    else fail(400, "Действие недоступно");
    r.rev++;
    r.receipts[who] = b.requestId;
    persist(r);
    json(200, state(r, color));
  } catch (e) {
    if (!res.headersSent)
      json(e.status || 500, { error: e.status ? e.message : "Ошибка сервера" });
  }
});
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log("Chess listening on port " + server.address().port),
);
