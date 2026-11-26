import {
  startFen,
  parseFen,
  side,
  sq,
  key,
  legal,
  checked,
  apply,
  san,
  gameStatus,
} from "./rules.js";
import {
  createGame,
  replay,
  findMove,
  play,
  finish,
  remaining,
  timeout,
  notation,
  pgn,
  readPGN,
} from "./game.js";
import {
  empty,
  load,
  save,
  encodeBackup,
  decodeBackup,
  archive,
  stats,
} from "./store.js";
import { board, piece, names } from "./board.js";
import { unlock, sound } from "./audio.js";
import { levels, search } from "./engine.js";
import {
  variation,
  explain,
  classify,
  scoreText,
  overview,
  plan,
} from "./coach.js";
import { lessons, themes } from "./lessons.js";
import * as net from "./online.js";
const $ = (id) => document.getElementById(id),
  app = $("app"),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const button = (id, label, primary = false) =>
  '<button id="' +
  id +
  '" class="' +
  (primary ? "primary" : "") +
  '">' +
  label +
  "</button>";
const select = (id, label, items, val) =>
  "<label>" +
  label +
  '<select id="' +
  id +
  '">' +
  Object.entries(items)
    .map(
      ([v, n]) =>
        '<option value="' +
        esc(v) +
        '" ' +
        (String(val) === v ? "selected" : "") +
        ">" +
        esc(n) +
        "</option>",
    )
    .join("") +
  "</select></label>";
const bind = (id, fn) => {
  if ($(id)) $(id).onclick = () => Promise.resolve().then(fn).catch(alertError);
};
function alertError(e) {
  if (e?.name !== "AbortError")
    $("notice").textContent = e.message || String(e);
}
function choose(title, options) {
  const d = $("dialog");
  if (d.open) d.close();
  $("question").textContent = title;
  $("options").replaceChildren();
  for (const [v, n] of Object.entries(options)) {
    const b = document.createElement("button");
    b.value = v;
    b.textContent = n;
    $("options").append(b);
  }
  d.returnValue = "";
  d.showModal();
  return new Promise((resolve) =>
    d.addEventListener("close", () => resolve(d.returnValue), { once: true }),
  );
}
let profile,
  storageBlocked = false,
  saveError = "";
try {
  profile = load(localStorage);
} catch (e) {
  profile = empty();
  storageBlocked = true;
  alertError(
    Error(
      "Не удалось прочитать профиль. Исходные данные сохранены. " + e.message,
    ),
  );
}
function persist() {
  try {
    if (storageBlocked)
      throw Error("Сохранение заблокировано до восстановления копии");
    archive(profile);
    save(localStorage, profile);
    saveError = "";
  } catch (e) {
    saveError =
      "Партия пока сохранена только в этом окне. Скачайте копию в настройках. " +
      e.message;
    alertError(Error(saveError));
  }
}
let page = "",
  g,
  h = [],
  selection = -1,
  hint = null,
  calculation,
  analysisJob,
  flipped = false,
  netState = null,
  netGeneration = 0,
  netBusy = false,
  offset = 0,
  lastWarning = "",
  branchOrigin = null,
  practice,
  review,
  reviewIndex,
  whatIf;
function cancel() {
  calculation?.abort();
  analysisJob?.abort();
  calculation = null;
  analysisJob = null;
}
function screen(name) {
  cancel();
  netGeneration++;
  page = name;
  selection = -1;
  hint = null;
  $("notice").textContent = storageBlocked
    ? "Профиль требует восстановления из копии."
    : saveError;
  window.scrollTo(0, 0);
}
function preferences() {
  const p = profile.prefs;
  document.documentElement.dataset.theme =
    p.theme === "auto"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : p.theme;
  document.documentElement.dataset.board = p.board;
}
preferences();
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  preferences,
);
document.addEventListener("pointerdown", unlock, { once: true });
document.addEventListener("keydown", unlock, { once: true });
function home() {
  screen("home");
  const st = stats(Object.values(profile.games)),
    current = profile.current;
  const links = [
    ["cpu", "Играть с компьютером"],
    ["online", "Играть онлайн"],
    ["local", "Играть вдвоём"],
    ["learn", "Обучение"],
    ["puzzles", "Шахматные задачи"],
    ["games", "Мои партии"],
    ["stats", "Моя статистика"],
    ["settings", "Настройки"],
  ];
  app.innerHTML =
    '<section class="hero"><div><h1>Шахматы</h1><p>' +
    st.rating +
    ' · Личный рейтинг</p><p class="muted">' +
    st.wins +
    " побед · " +
    st.losses +
    " поражений · " +
    st.draws +
    " ничьих</p>" +
    button(
      "resume",
      current && !current.result ? "Продолжить партию" : "Начать партию",
    ) +
    '</div><div class="art" aria-hidden="true">' +
    piece("N") +
    piece("k") +
    '</div></section><section class="section"><h2>Главное меню</h2><div class="cards">' +
    links
      .map(
        ([id, n]) =>
          '<button class="card" id="' +
          id +
          '">' +
          n +
          "<span>↗</span></button>",
      )
      .join("") +
    "</div></section>";
  bind("resume", () =>
    current && !current.result ? openLocal(current) : setup("computer"),
  );
  bind("cpu", () => setup("computer"));
  bind("local", () => setup("local"));
  bind("online", () => setup("online"));
  bind("learn", () => catalog(false));
  bind("puzzles", () => catalog(true));
  bind("games", library);
  bind("stats", statistics);
  bind("settings", settings);
}
$("brand").onclick = home;
function setup(mode) {
  screen("setup");
  const online = mode === "online",
    inv = online && net.readInvite();
  const presets = {
    "0,0": "Без ограничения",
    "3,2": "3 мин + 2 с",
    "5,0": "5 минут",
    "10,5": "10 мин + 5 с",
    "15,10": "15 мин + 10 с",
    "30,0": "30 минут",
    custom: "Свой контроль",
  };
  app.innerHTML =
    "<h1>" +
    {
      computer: "Игра с компьютером",
      local: "Игра вдвоём",
      online: "Игра онлайн",
    }[mode] +
    '</h1><form id="setup" class="controls panel">' +
    (mode !== "local" && !inv
      ? select(
          "color",
          "Ваш цвет",
          { random: "Случайный", white: "Белые", black: "Чёрные" },
          "white",
        )
      : "") +
    (mode === "computer"
      ? select(
          "level",
          "Уровень Stockfish",
          Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v[0]])),
          "medium",
        )
      : "") +
    (!inv
      ? select("control", "Контроль времени", presets, "0,0") +
        '<div id="custom" hidden><label>Минуты<input type="number" id="minutes" min="1" max="1440" value="10"></label><label>Добавление, секунд<input type="number" id="increment" min="0" max="600" value="0"></label></div>'
      : "") +
    (online
      ? '<label>Имя<input id="name" maxlength="40" value="Игрок"></label><label><input id="training" type="checkbox"> Разрешить тренера обоим игрокам</label><label>Адрес игрового сервера<input id="server" type="url" required></label>'
      : "") +
    '<button class="primary">' +
    (inv
      ? "Войти по приглашению"
      : online
        ? "Создать комнату"
        : "Начать партию") +
    "</button></form>";
  if (online) {
    $("server").value =
      inv?.base || localStorage.getItem("chess-server") || location.origin;
    if (net.onlineSession()?.id && !inv) {
      app.insertAdjacentHTML(
        "beforeend",
        button("reconnect", "Вернуться в комнату"),
      );
      bind("reconnect", async () => startOnline(await net.poll()));
    }
  }
  if ($("control"))
    $("control").onchange = () =>
      ($("custom").hidden = $("control").value !== "custom");
  $("setup").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const [minutes, increment] = (
          $("control")?.value === "custom"
            ? [$("minutes").value, $("increment").value]
            : ($("control")?.value || "0,0").split(",")
        ).map(Number),
        color = $("color")?.value,
        human =
          color === "random"
            ? crypto.getRandomValues(new Uint8Array(1))[0] % 2
              ? 1
              : -1
            : color === "black"
              ? -1
              : 1;
      if (online) {
        localStorage.setItem("chess-server", new URL($("server").value).origin);
        const snap = await net.connect(
          {
            name: $("name").value,
            training: $("training").checked,
            color: human,
            minutes,
            increment,
          },
          inv,
        );
        history.replaceState(null, "", location.pathname);
        startOnline(snap);
        return;
      }
      if (
        profile.current &&
        !profile.current.result &&
        profile.current.moves.length &&
        !(await choose("Сохранить текущую партию и начать новую?", {
          yes: "Сохранить и начать",
        }))
      )
        return;
      if (profile.current?.moves.length)
        profile.games[profile.current.id] = structuredClone(profile.current);
      profile.current = createGame({
        mode,
        human,
        minutes,
        increment,
        level: $("level")?.value,
      });
      persist();
      openLocal(profile.current);
    } catch (e) {
      alertError(e);
    }
  };
}
function openLocal(game) {
  screen("game");
  netState = null;
  g = game;
  h = replay(g);
  flipped = g.flipped ?? (g.mode === "computer" && g.human === -1);
  if (timeout(g, h.at(-1))) persist();
  drawGame();
  schedule();
}
function startOnline(snapshot) {
  screen("net");
  branchOrigin = null;
  updateNet(snapshot, true);
  const generation = netGeneration;
  async function sync() {
    if (generation !== netGeneration) return;
    try {
      const x = await net.poll();
      if (generation !== netGeneration) return;
      updateNet(x);
      if ($("connection"))
        $("connection").textContent = "Соединение установлено";
    } catch {
      if ($("connection"))
        $("connection").textContent = "Восстанавливаем соединение…";
    }
    if (generation === netGeneration) setTimeout(sync, 900);
  }
  setTimeout(sync, 900);
}
function updateNet(x, force = false) {
  offset = x.now - Date.now();
  if (!force && x.revision <= netState.revision) return;
  cancel();
  netState = x;
  g = x.game;
  h = replay(g);
  flipped = x.color === -1;
  selection = -1;
  hint = null;
  if (g.result) {
    profile.games[g.id] = g;
    persist();
  }
  drawGame();
}
async function send(type, u) {
  if (netBusy) return;
  netBusy = true;
  const generation = netGeneration;
  try {
    const x = await net.action(netState, type, u);
    if (generation === netGeneration) updateNet(x);
  } finally {
    netBusy = false;
  }
}
function canAct() {
  return (
    !g.result &&
    (page === "net"
      ? netState.ready && netState.color === h.at(-1).t
      : g.mode === "local" || g.human === h.at(-1).t)
  );
}
function schedule() {
  if (
    page !== "game" ||
    g.mode !== "computer" ||
    g.result ||
    g.human === h.at(-1).t ||
    calculation
  )
    return;
  const ctrl = new AbortController();
  calculation = ctrl;
  search(h.at(-1), { level: g.level, signal: ctrl.signal })
    .then(({ u }) => {
      if (!ctrl.signal.aborted) {
        calculation = null;
        commit(u);
      }
    })
    .catch((e) => {
      if (!ctrl.signal.aborted) {
        calculation = null;
        alertError(e);
        if ($("retry")) $("retry").hidden = false;
      }
    });
}
function commit(u) {
  cancel();
  const s = h.at(-1),
    m = findMove(s, u);
  if (!m) return;
  if (play(g, h, u)) {
    sound(
      g.result
        ? g.result.winner === 0
          ? "draw"
          : g.mode === "computer" && g.result.winner !== g.human
            ? "loss"
            : "win"
        : checked(h.at(-1))
          ? "check"
          : m[2]
            ? "promotion"
            : m[3] === "castle"
              ? "castle"
              : s.b[m[1]] !== "." || m[3] === "ep"
                ? "capture"
                : "move",
      profile.prefs,
    );
    if (g.mode === "local" && profile.prefs.rotate) flipped = h.at(-1).t < 0;
    g.flipped = flipped;
  }
  selection = -1;
  hint = null;
  persist();
  drawGame(true);
  schedule();
}
function validCoach() {
  return page !== "net" || netState.training || g.result;
}
async function square(i, dest) {
  if (!canAct()) return;
  const s = h.at(-1);
  if (dest !== undefined) {
    if (side(s.b[i]) !== s.t) return;
    selection = i;
    i = dest;
  }
  if (side(s.b[i]) === s.t) {
    selection = selection === i ? -1 : i;
    paint();
    return;
  }
  const choices = legal(s).filter((m) => m[0] === selection && m[1] === i);
  if (!choices.length) return;
  let m = choices[0];
  if (choices.length > 1) {
    const before = g.id,
      ply = g.moves.length;
    const p = await choose("Превращение пешки", {
      q: "Ферзь",
      r: "Ладья",
      b: "Слон",
      n: "Конь",
    });
    if (!p || g.id !== before || g.moves.length !== ply || g.result) return;
    m = choices.find((v) => v[2] === p);
  }
  if (page === "net") await send("move", key(m));
  else commit(key(m));
}
function paint(animation = false) {
  const s = h.at(-1),
    last = g.moves.length ? findMove(h.at(-2), g.moves.at(-1)) : [];
  board($("board"), s, {
    flip: flipped,
    last,
    hint,
    selected: selection,
    onSquare: (...args) => square(...args).catch(alertError),
    animation,
  });
}
const resultText = (r) =>
  r.reason +
  (r.winner
    ? " · Победа " + (r.winner === 1 ? "белых" : "чёрных")
    : " · Ничья");
function drawGame(animation = false) {
  const s = h.at(-1),
    online = page === "net",
    st = gameStatus(h),
    coach = validCoach(),
    top = flipped ? 1 : -1;
  const player = (c) =>
    '<div class="player"><b>' +
    (c === 1 ? "Белые" : "Чёрные") +
    (online
      ? " · " + esc(netState.names[c] || "Ожидание")
      : g.mode === "computer"
        ? " · " + (g.human === c ? "Вы" : "Stockfish")
        : "") +
    '</b><span class="clock" id="clock' +
    c +
    '"></span></div>';
  const taken = { 1: [], "-1": [] };
  g.moves.forEach((u, i) => {
    const s = h[i],
      m = findMove(s, u),
      p = m[3] === "ep" ? s.b[m[1] + 16 * s.t] : s.b[m[1]];
    if (p !== ".") taken[s.t].push(piece(p));
  });
  app.innerHTML =
    '<div class="layout"><section>' +
    player(top) +
    '<div class="board" id="board"></div>' +
    player(-top) +
    '<div class="captured">' +
    taken[top].join("") +
    "　" +
    taken[-top].join("") +
    '</div></section><aside class="panel"><h2 aria-live="polite">' +
    esc(
      g.result
        ? resultText(g.result)
        : online && !netState.ready
          ? "Ожидание соперника"
          : st.text,
    ) +
    "</h2>" +
    (online
      ? '<p id="connection" class="muted">Соединение установлено</p>' +
        (!netState.ready && net.invitation()
          ? '<label>Ссылка для друга<input id="invite" readonly></label>'
          : "")
      : "") +
    '<div class="tools">' +
    button("flip", "Повернуть") +
    (!online && g.moves.length && !g.result && !g.minutes
      ? button("undo", "Отменить ход")
      : "") +
    (!g.result
      ? button("resign", "Сдаться") +
        (g.mode !== "computer"
          ? button(
              "draw",
              g.offer
                ? online && g.offer === netState.color
                  ? "Ничья предложена"
                  : "Принять ничью"
                : "Предложить ничью",
            )
          : "") +
        (canAct() && st.claim ? button("claim", "Заявить ничью") : "")
      : button("rematch", "Реванш")) +
    "</div>" +
    (coach
      ? '<div class="tools">' +
        button("suggest", "Подсказка") +
        button("plan", "Что мне делать?") +
        button("why", "Почему этот ход?") +
        button("position", "Анализ позиции") +
        button("what", "Что будет, если…?") +
        '</div><p id="coach" aria-live="polite"></p>'
      : "") +
    '<h3>История ходов</h3><div class="moves">' +
    notation(g, h)
      .map(
        (v, i) =>
          (i % 2 ? "" : 1 + (i >> 1) + ". ") +
          esc(v) +
          (coach
            ? ' <button data-why="' +
              i +
              '" aria-label="Разобрать ' +
              esc(v) +
              '">?</button> '
            : " "),
      )
      .join(" ") +
    '</div><button hidden id="retry">Повторить расчёт</button></aside></div>';
  if (online && $("draw") && g.offer === netState.color)
    $("draw").disabled = true;
  if (online && $("rematch") && netState.rematch) {
    $("rematch").textContent =
      netState.rematch === netState.color
        ? "Реванш предложен"
        : "Принять реванш";
    $("rematch").disabled = netState.rematch === netState.color;
  }
  if ($("invite")) $("invite").value = net.invitation();
  paint(animation);
  tick();
  bind("retry", schedule);
  bind("flip", () => {
    flipped = !flipped;
    if (!online) {
      g.flipped = flipped;
      persist();
    }
    drawGame();
  });
  bind("undo", () => {
    cancel();
    do {
      g.moves.pop();
      h.pop();
    } while (g.moves.length && g.mode === "computer" && h.at(-1).t !== g.human);
    selection = -1;
    hint = null;
    persist();
    drawGame();
    schedule();
  });
  const end = (winner, reason) => {
    cancel();
    if (!timeout(g, h.at(-1))) finish(g, winner, reason);
    sound(
      winner === 0
        ? "draw"
        : g.mode === "computer" && winner !== g.human
          ? "loss"
          : "win",
      profile.prefs,
    );
    persist();
    drawGame();
  };
  bind("resign", async () => {
    if (await choose("Сдать партию?", { yes: "Сдаться" })) {
      if (online) await send("resign");
      else end(g.mode === "computer" ? -g.human : -s.t, "Сдача");
    }
  });
  bind("draw", async () => {
    if (online) return send("draw");
    if (
      await choose("Второй игрок согласен на ничью?", { yes: "Принять ничью" })
    )
      end(0, "Соглашение игроков");
  });
  bind("claim", () => (online ? send("claim") : end(0, st.claim)));
  bind("rematch", () => {
    if (online) return send("rematch");
    profile.current = createGame({ ...g, human: -g.human });
    persist();
    openLocal(profile.current);
  });
  bind("suggest", () => analysePosition());
  bind("plan", () => analysePosition(undefined, "plan"));
  bind("position", () => analysePosition(undefined, "overview"));
  bind("why", () =>
    g.moves.length
      ? analysePosition(g.moves.length - 1)
      : ($("coach").textContent =
          "Сначала сделайте ход. Для начальной позиции доступен анализ."),
  );
  bind("what", () => openReview(g, true));
  app
    .querySelectorAll("[data-why]")
    .forEach(
      (b) =>
        (b.onclick = () => analysePosition(+b.dataset.why).catch(alertError)),
    );
}
function tick() {
  if (!["game", "net"].includes(page) || !g) return;
  const s = h.at(-1);
  if (page === "game" && timeout(g, s)) {
    cancel();
    persist();
    sound(
      g.result.winner === 0
        ? "draw"
        : g.mode === "computer" && g.result.winner !== g.human
          ? "loss"
          : "win",
      profile.prefs,
    );
    drawGame();
    return;
  }
  const times = remaining(
    g,
    s.t,
    page === "net"
      ? netState.ready
        ? Date.now() + offset
        : g.started
      : Date.now(),
  );
  times.forEach((v, i) => {
    const el = $("clock" + (i ? -1 : 1));
    if (!el) return;
    const sec = Math.ceil(v / 1000);
    el.textContent = g.minutes
      ? Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0")
      : "∞";
    if (
      g.minutes &&
      !g.result &&
      sec <= 10 &&
      sec > 0 &&
      i === (s.t === 1 ? 0 : 1) &&
      lastWarning !== g.id + g.moves.length
    ) {
      sound("warning", profile.prefs);
      lastWarning = g.id + g.moves.length;
    }
  });
}
setInterval(tick, 250);
document.addEventListener("visibilitychange", tick);
async function analysePosition(i, mode = "move") {
  if (!validCoach()) return;
  analysisJob?.abort();
  const ctrl = (analysisJob = new AbortController()),
    s = i === undefined ? h.at(-1) : h[i],
    el = $("coach");
  if (!legal(s).length) {
    el.textContent = gameStatus([s]).text;
    return;
  }
  el.textContent = "Stockfish рассчитывает вариант…";
  const best = await search(s, { depth: 13, ms: 1100, signal: ctrl.signal });
  if (ctrl.signal.aborted) return;
  const u = i === undefined ? best.u : g.moves[i];
  let details = "";
  if (i !== undefined) {
    const actual =
      best.u === u
        ? best
        : await search(s, {
            depth: 13,
            ms: 1100,
            root: u,
            signal: ctrl.signal,
          });
    details =
      classify(best, actual) +
      ". Оценка сыгранного хода для " +
      (s.t === 1 ? "белых" : "чёрных") +
      ": " +
      scoreText(actual.score) +
      ". Вариант: " +
      variation(s, actual.pv) +
      ". ";
  }
  if (ctrl.signal.aborted) return;
  el.textContent =
    details +
    (mode === "overview"
      ? overview(s)
      : mode === "plan"
        ? plan(s, best.pv)
        : explain(s, u)) +
    " Рекомендация: " +
    variation(s, best.pv) +
    ". Оценка лучшего варианта для " +
    (s.t === 1 ? "белых" : "чёрных") +
    ": " +
    scoreText(best.score) +
    ".";
  if (i === undefined) {
    hint = findMove(s, best.u);
    paint();
  }
}

function settings() {
  screen("settings");
  const p = profile.prefs;
  app.innerHTML =
    '<h1>Настройки</h1><section class="controls panel">' +
    select(
      "theme",
      "Тема",
      { auto: "Системная", light: "Светлая", dark: "Тёмная" },
      p.theme,
    ) +
    select(
      "boardStyle",
      "Доска",
      { green: "Зелёно-бежевая", wood: "Деревянная", graphite: "Графитовая" },
      p.board,
    ) +
    '<label><input id="rotate" type="checkbox"> Поворачивать доску в игре вдвоём</label><label><input id="sound" type="checkbox"> Звуки игры</label><label>Громкость<input id="volume" type="range" min="0" max="1" step=".05"></label>' +
    button("backup", "Скачать резервную копию") +
    '<label>Восстановить копию JSON<input type="file" id="restore" accept=".json"></label><small>Stockfish.js 17 Lite · <a href="./vendor/stockfish/Copying.txt">GPLv3</a> · <a href="./vendor/stockfish/source.tar.gz" download>Исходный код движка</a></small></section>';
  for (const [id, k] of [
    ["theme", "theme"],
    ["boardStyle", "board"],
    ["rotate", "rotate"],
    ["sound", "sound"],
    ["volume", "volume"],
  ]) {
    const el = $(id);
    if (el.type === "checkbox") el.checked = p[k];
    if (k === "volume") el.value = p[k];
    el.onchange = () => {
      p[k] =
        el.type === "checkbox"
          ? el.checked
          : k === "volume"
            ? +el.value
            : el.value;
      preferences();
      persist();
      if (k === "volume" || k === "sound") sound("move", p);
    };
  }
  bind("backup", async () =>
    download("chess-backup.json", await encodeBackup(profile)),
  );
  $("restore").onchange = async (e) => {
    try {
      const x = await decodeBackup(await e.target.files[0].text());
      if (
        !(await choose("Заменить профиль данными копии?", {
          ok: "Восстановить",
        }))
      )
        return;
      save(localStorage, x, true);
      profile = x;
      storageBlocked = false;
      saveError = "";
      preferences();
      home();
    } catch (e) {
      alertError(e);
    }
  };
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function library() {
  screen("library");
  const entries = Object.values({
    ...profile.games,
    ...(profile.current ? { [profile.current.id]: profile.current } : {}),
  }).sort((a, b) => b.created - a.created);
  app.innerHTML =
    '<h1>Мои партии</h1><div class="cards">' +
    entries
      .map((v, i) =>
        button(
          "g" + i,
          new Date(v.created).toLocaleDateString("ru") +
            " · " +
            esc(v.result ? resultText(v.result) : "Незавершённая") +
            " · " +
            v.moves.length +
            " полуходов",
        ),
      )
      .join("") +
    '</div><section class="section controls"><label>Импорт партии PGN<textarea id="pgn"></textarea></label>' +
    button("import", "Добавить партию") +
    "</section>";
  entries.forEach((v, i) => bind("g" + i, () => openReview(v)));
  bind("import", () => {
    const v = readPGN($("pgn").value);
    if (!v.moves.length) throw Error("Нет ходов");
    profile.games[v.id] = v;
    persist();
    openReview(v);
  });
}
function chart(points) {
  if (points.length < 2) return "";
  const min = Math.min(...points),
    max = Math.max(...points),
    coords = points
      .map(
        (v, i) =>
          2 +
          (296 * i) / (points.length - 1) +
          "," +
          (76 - (70 * (v - min)) / (max - min || 1)),
      )
      .join(" ");
  return (
    '<svg class="chart" viewBox="0 0 300 80" role="img" aria-label="График изменения"><polyline points="' +
    coords +
    '" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
  );
}
function statistics(days = 0) {
  screen("stats");
  const all = Object.values(profile.games).filter((v) => v.result),
    games = all.filter(
      (v) => !days || Date.now() - v.result.at <= days * 86400000,
    ),
    st = stats(games),
    full = stats(all),
    total = st.wins + st.losses + st.draws;
  const breakdown = (field, names) =>
    Object.entries(names)
      .map(([v, n]) => {
        const r = stats(games.filter((g) => String(g[field]) === v));
        return n + ": " + r.wins + " / " + r.draws + " / " + r.losses;
      })
      .join(" · ");
  app.innerHTML =
    '<h1>Моя статистика</h1><section class="panel">' +
    select(
      "days",
      "Период",
      { 0: "Всё время", 7: "Неделя", 30: "Месяц" },
      days,
    ) +
    "<h2>" +
    full.rating +
    " · Личный рейтинг</h2><p>Максимум " +
    full.best +
    " · Последнее изменение " +
    (full.points.at(-1)?.delta || 0) +
    "</p>" +
    chart([1200, ...full.points.map((p) => p.rating)]) +
    "<details><summary>История рейтинга</summary>" +
    full.points
      .map(
        (p) =>
          new Date(profile.games[p.id].result.at).toLocaleDateString("ru") +
          " · " +
          p.rating +
          " (" +
          (p.delta > 0 ? "+" : "") +
          p.delta +
          ")",
      )
      .join("<br>") +
    "</details>" +
    "<p>Завершено партий: " +
    games.length +
    ". Против компьютера: " +
    total +
    ".</p><p>Победы: " +
    st.wins +
    " · Поражения: " +
    st.losses +
    " · Ничьи: " +
    st.draws +
    " · Победы: " +
    (total ? Math.round((100 * st.wins) / total) : 0) +
    "%</p><p>Лучшая серия побед: " +
    st.longest +
    "</p><p>" +
    "Победы / ничьи / поражения. " +
    breakdown(
      "level",
      Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v[0]])),
    ) +
    "</p><p>" +
    breakdown("human", { 1: "Белыми", "-1": "Чёрными" }) +
    "</p><p>Пройдено уроков: " +
    Object.values(profile.lessons).filter((v) => v.done).length +
    " · Рейтинг задач: " +
    (profile.puzzleRating || 1200) +
    " · Решено задач: " +
    Object.values(profile.puzzles).filter((v) => v.done).length +
    '</p><p class="muted">Условный рейтинг приложения. Начальное значение — 1200.</p></section>';
  $("days").onchange = () => statistics(+$("days").value);
}
function openReview(game, hypothetical = false) {
  screen("review");
  branchOrigin = null;
  review = game;
  reviewIndex = hypothetical ? game.moves.length : 0;
  whatIf = hypothetical ? replay(game).at(-1) : null;
  selection = -1;
  renderReview();
}
function renderReview() {
  const hist = replay(review),
    s = whatIf || hist[reviewIndex],
    list = notation(review, hist),
    cacheKey = review.id + ":" + review.moves.join(","),
    records = profile.analysis[cacheKey] || {},
    track = records.deep || records.quick || [];
  app.innerHTML =
    "<h1>" +
    (whatIf ? "Что будет, если…?" : "Разбор партии") +
    '</h1><div class="layout"><div><div id="reviewBoard" class="board"></div></div><section class="panel"><div class="tools">' +
    button("prev", "←") +
    button("next", "→") +
    button("branch", whatIf ? "Вернуть позицию" : "Попробовать вариант") +
    "</div><label>Позиция " +
    reviewIndex +
    " из " +
    review.moves.length +
    '<input id="ply" type="range" min="0" max="' +
    review.moves.length +
    '" value="' +
    reviewIndex +
    '"></label><p class="moves">' +
    list
      .map(
        (v, i) =>
          '<button data-ply="' +
          (i + 1) +
          '">' +
          (i % 2 ? "" : 1 + (i >> 1) + ". ") +
          esc(v) +
          "</button>",
      )
      .join(" ") +
    '</p><p id="comment">' +
    esc(track[reviewIndex - 1]?.text || "") +
    "</p>" +
    chart([0, ...track.map((x) => x.white)]) +
    '<div class="tools">' +
    button("quick", "Быстрый анализ") +
    button("deep", "Углублённый анализ") +
    button("stop", "Остановить") +
    button("evaluate", "Оценить позицию") +
    button("export", "Скачать PGN") +
    '</div><p id="progress" role="status"></p></section></div>';
  if (!whatIf) {
    const mode = {
        computer: "Компьютер · " + (levels[review.level]?.[0] || ""),
        local: "Два игрока",
        online: "Онлайн",
        import: "Импорт PGN",
      }[review.mode],
      time = review.minutes
        ? review.minutes + " мин + " + review.increment + " с"
        : "Без часов";
    const duration =
      review.result && !review.migrated && review.mode !== "import"
        ? " · " +
          Math.max(
            1,
            Math.round(
              (review.result.at - (review.playedFrom || review.created)) / 1000,
            ),
          ) +
          " с"
        : "";
    $("reviewBoard").insertAdjacentHTML(
      "afterend",
      '<p class="muted">' +
        esc(mode) +
        " · " +
        esc(time) +
        duration +
        (review.mode === "computer"
          ? " · Вы играли " + (review.human === 1 ? "белыми" : "чёрными")
          : "") +
        "</p>",
    );
  }
  board($("reviewBoard"), s, {
    selected: selection,
    onSquare: async (i, dest) => {
      if (!whatIf) return;
      if (dest !== undefined) {
        selection = i;
        i = dest;
      }
      if (side(s.b[i]) === s.t) {
        selection = i;
        renderReview();
        return;
      }
      const choices = legal(s).filter((m) => m[0] === selection && m[1] === i);
      if (!choices.length) return;
      let m = choices[0];
      if (choices.length > 1) {
        const p = await choose("Превращение", {
          q: "Ферзь",
          r: "Ладья",
          b: "Слон",
          n: "Конь",
        });
        m = choices.find((v) => v[2] === p);
        if (!m) return;
      }
      branchOrigin = { state: s, u: key(m) };
      whatIf = apply(s, m);
      selection = -1;
      renderReview();
      $("comment").textContent = explain(s, key(m));
      $("evaluate").click();
    },
  });
  function navigate(i) {
    analysisJob?.abort();
    reviewIndex = Math.max(0, Math.min(review.moves.length, i));
    whatIf = null;
    selection = -1;
    renderReview();
  }
  $("ply").oninput = (e) => navigate(+e.target.value);
  bind("prev", () => navigate(reviewIndex - 1));
  bind("next", () => navigate(reviewIndex + 1));
  app
    .querySelectorAll("[data-ply]")
    .forEach((b) => (b.onclick = () => navigate(+b.dataset.ply)));
  bind("branch", () => {
    analysisJob?.abort();
    branchOrigin = null;
    whatIf = whatIf ? null : hist[reviewIndex];
    selection = -1;
    renderReview();
  });
  if (
    review.mode !== "online" &&
    !review.result &&
    ["local", "computer"].includes(review.mode)
  ) {
    $("export").insertAdjacentHTML(
      "afterend",
      button("returnGame", "Продолжить эту партию"),
    );
    bind("returnGame", () => {
      if (profile.current && profile.current.id !== review.id)
        profile.games[profile.current.id] = profile.current;
      profile.current = review;
      persist();
      openLocal(review);
    });
  }
  bind("export", () => download("chess.pgn", pgn(review)));
  bind("stop", () => {
    analysisJob?.abort();
    $("progress").textContent = "Расчёт остановлен. Результаты сохранены.";
  });
  bind("evaluate", async () => {
    if (!legal(s).length) {
      $("progress").textContent = gameStatus([s]).text;
      return;
    }
    analysisJob?.abort();
    const ctrl = (analysisJob = new AbortController());
    const r = await search(s, { depth: 14, ms: 1000, signal: ctrl.signal });
    let delta = "";
    if (whatIf && branchOrigin) {
      const before = await search(branchOrigin.state, {
        depth: 14,
        ms: 1000,
        signal: ctrl.signal,
      });
      delta =
        "До хода: " +
        scoreText(before.score) +
        ", после: " +
        scoreText(r.score && { ...r.score, value: -r.score.value }) +
        " (для сделавшей ход стороны). Альтернатива: " +
        variation(branchOrigin.state, before.pv) +
        ". ";
    }
    if (!ctrl.signal.aborted)
      $("progress").textContent =
        delta +
        scoreText(r.score) +
        " · " +
        variation(s, r.pv) +
        " · " +
        explain(s, r.u);
  });
  async function run(kind) {
    analysisJob?.abort();
    const ctrl = (analysisJob = new AbortController()),
      all = (profile.analysis[cacheKey] ??= {}),
      a = (all[kind] ??= []),
      opts = {
        depth: kind === "deep" ? 18 : 10,
        ms: kind === "deep" ? 2000 : 450,
        signal: ctrl.signal,
      };
    for (let i = a.length; i < review.moves.length; i++) {
      const pos = hist[i],
        u = review.moves[i];
      $("progress").textContent = "Анализ: " + i + " / " + review.moves.length;
      const best = await search(pos, opts),
        actual = best.u === u ? best : await search(pos, { ...opts, root: u });
      if (ctrl.signal.aborted) return;
      const sc = actual.score;
      a.push({
        text:
          classify(best, actual) +
          ". " +
          explain(pos, u) +
          " Оценка: " +
          scoreText(sc) +
          ". Лучший вариант: " +
          variation(pos, best.pv),
        white:
          pos.t *
          (sc?.unit === "mate" ? Math.sign(sc.value) * 1000 : sc?.value || 0),
      });
      persist();
    }
    renderReview();
    $("progress").textContent = "Проанализировано полуходов: " + a.length;
  }
  bind("quick", () => run("quick"));
  bind("deep", () => run("deep"));
}
let puzzles;
async function catalog(isPuzzle, filter = "all") {
  screen("catalog");
  if (isPuzzle && !puzzles) {
    const r = await fetch("./data/puzzles.json");
    puzzles = await r.json();
    if (page !== "catalog") return;
  }
  const db = isPuzzle ? profile.puzzles : profile.lessons,
    list = isPuzzle ? puzzles : lessons;
  app.innerHTML =
    "<h1>" +
    (isPuzzle ? "Шахматные задачи" : "Дебютные уроки") +
    "</h1>" +
    (isPuzzle
      ? '<div class="tools">' +
        button("daily", "Задача дня") +
        select(
          "filter",
          "Подборка",
          {
            all: "Все задачи",
            retry: "Повторить ошибки",
            easy: "До 1200",
            mid: "1200–1799",
            hard: "1800 и выше",
            ...themes,
          },
          filter,
        ) +
        "</div>"
      : "") +
    '<div class="cards section">' +
    list
      .filter(
        (v) =>
          !isPuzzle ||
          filter === "all" ||
          filter === v.tag ||
          (filter === "retry" && db[v.id]?.failed) ||
          (filter === "easy" && v.rating < 1200) ||
          (filter === "mid" && v.rating >= 1200 && v.rating < 1800) ||
          (filter === "hard" && v.rating >= 1800),
      )
      .map(
        (v) =>
          '<button class="card" data-id="' +
          v.id +
          '">' +
          (v.title || themes[v.tag] + " · " + v.rating) +
          (db[v.id]?.done ? " ✓" : "") +
          "</button>",
      )
      .join("") +
    "</div>";
  if (isPuzzle) {
    $("filter").onchange = (e) => catalog(true, e.target.value);
    bind("daily", () =>
      beginPractice(
        list[Math.floor(Date.now() / 86400000) % list.length],
        true,
      ),
    );
  }
  app.querySelectorAll("[data-id]").forEach(
    (b) =>
      (b.onclick = () =>
        beginPractice(
          list.find((v) => v.id === b.dataset.id),
          isPuzzle,
        )),
  );
}
async function beginPractice(item, puzzle) {
  let color = 1;
  if (!puzzle) {
    const c = await choose("За какую сторону тренироваться?", {
      white: "Белые",
      black: "Чёрные",
    });
    if (!c) return;
    color = c === "white" ? 1 : -1;
  }
  screen("practice");
  let s = parseFen(item.initial || startFen),
    n = 0;
  if (puzzle || color < 0) {
    s = apply(s, findMove(s, item.line[0]));
    n++;
  }
  const saved = (puzzle ? profile.puzzles : profile.lessons)[item.id];
  if (
    saved &&
    !saved.done &&
    saved.color === s.t &&
    saved.ply > n &&
    saved.ply < item.line.length
  ) {
    while (n < saved.ply) {
      s = apply(s, findMove(s, item.line[n++]));
    }
  }
  practice = {
    item,
    puzzle,
    s,
    n,
    color: s.t,
    message:
      (item.goal || themes[item.tag]) +
      (n && item.notes ? " " + item.notes[n - 1] : ""),
  };
  training();
}
function training() {
  const { item, puzzle, s, n } = practice,
    done = n >= item.line.length,
    db = puzzle ? profile.puzzles : profile.lessons;
  app.innerHTML =
    "<h1>" +
    esc(item.title || themes[item.tag]) +
    '</h1><div class="layout"><div class="board" id="studyBoard"></div><section class="panel"><h2>' +
    (done ? "Завершено" : "Ваш ход") +
    '</h2><p aria-live="polite">' +
    esc(practice.message) +
    "</p><p>" +
    esc(item.note || "") +
    (done
      ? "<br>Линия: " +
        esc(
          variation(
            parseFen(item.initial || startFen),
            item.line,
            item.line.length,
          ),
        )
      : "") +
    '</p><div class="tools">' +
    (!done ? button("tip", "Подсказка") : "") +
    button("repeat", "Повторить") +
    button("back", "К списку") +
    "</div></section></div>";
  board($("studyBoard"), s, {
    flip: practice.color < 0,
    selected: selection,
    hint: hint,
    onSquare: async (i, dest) => {
      if (done) return;
      if (dest !== undefined) {
        selection = i;
        i = dest;
      }
      if (side(s.b[i]) === s.t) {
        selection = i;
        training();
        return;
      }
      const options = legal(s).filter((m) => m[0] === selection && m[1] === i);
      let m = options[0];
      if (!m) return;
      if (options.length > 1) {
        const c = await choose("Превращение", {
          q: "Ферзь",
          r: "Ладья",
          b: "Слон",
          n: "Конь",
        });
        m = options.find((m) => m[2] === c);
        if (!m) return;
      }
      const progress = (db[item.id] ??= {});
      if (puzzle && !progress.scored && key(m) !== item.line[n]) {
        progress.scored = true;
        profile.puzzleRating =
          (profile.puzzleRating || 1200) -
          Math.round(
            20 /
              (1 +
                10 ** ((item.rating - (profile.puzzleRating || 1200)) / 400)),
          );
      }
      if (key(m) !== item.line[n]) {
        progress.failed = true;
        practice.message = "Попробуйте другой ход. " + explain(s, key(m));
      } else {
        practice.message = (item.notes?.[n] || "") + " " + explain(s, key(m));
        practice.s = apply(s, m);
        practice.n++;
        if (practice.n < item.line.length) {
          const u = item.line[practice.n++];
          practice.message +=
            " Ответ: " +
            san(practice.s, findMove(practice.s, u)) +
            ". " +
            (item.notes?.[practice.n - 1] || explain(practice.s, u));
          practice.s = apply(practice.s, findMove(practice.s, u));
        }
        if (practice.n === item.line.length) {
          if (puzzle && !progress.scored) {
            progress.scored = true;
            const r = profile.puzzleRating || 1200;
            profile.puzzleRating =
              r +
              Math.round(20 * (1 - 1 / (1 + 10 ** ((item.rating - r) / 400))));
          }
          progress.done = true;
          progress.failed = false;
        }
        progress.color = practice.color;
        progress.ply = practice.n;
      }
      persist();
      selection = -1;
      hint = null;
      training();
    },
  });
  bind("tip", () => {
    hint = findMove(s, item.line[n]);
    practice.message =
      "Рассмотрите " + san(s, hint) + ". " + explain(s, item.line[n]);
    training();
  });
  bind("repeat", () => beginPractice(item, puzzle));
  bind("back", () => catalog(puzzle));
}
if (net.readInvite()) setup("online");
else home();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => {
        if (e.data.ready) $("offline").textContent = "Готово к офлайн-игре";
        channel.port1.close();
      };
      reg.active?.postMessage("verify", [channel.port2]);
    })
    .catch(alertError);
}
