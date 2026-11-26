const SESSION = "chess-online-session";
let session;
export function onlineSession() {
  try {
    return (session = JSON.parse(localStorage.getItem(SESSION)));
  } catch {
    return null;
  }
}
function store() {
  localStorage.setItem(SESSION, JSON.stringify(session));
}
function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
function endpoint() {
  return location.origin === "https://rabota2802-tech.github.io"
    ? "https://chess-api.alliancegrad.ru"
    : location.origin;
}
async function request(path, b, player = session) {
  if (!navigator.onLine)
    throw Error(
      "Для онлайн-партии нужен интернет. Остальные разделы доступны без сети.",
    );
  const r = await fetch(player.base + "/api/rooms" + path, {
    method: b ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + player.key,
      ...(b ? { "Content-Type": "application/json" } : {}),
    },
    body: b ? JSON.stringify(b) : undefined,
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(8000),
  }).catch(() => {
    throw Error(
      "Нет связи с игровым сервером. Попробуйте позже или сыграйте офлайн.",
    );
  });
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw Error("Сервер онлайн-игры не настроен");
  const x = await r.json();
  if (!r.ok) throw Object.assign(Error(x.error), { status: r.status });
  return x;
}
export async function connect(data, inv) {
  const previous = onlineSession(),
    base = endpoint();
  const reuse = inv && previous?.id === inv.id && previous.base === base;
  const player = reuse ? previous : { base, key: secret(), id: inv?.id };
  // Keep the current room until the next server acknowledges the new seat.
  const pendingKey = "chess-online-joining";
  let joining;
  if (inv) {
    try {
      joining = JSON.parse(localStorage.getItem(pendingKey));
    } catch {}
    if (!reuse && joining?.base === base && joining.id === inv.id)
      player.key = joining.key;
    localStorage.setItem(pendingKey, JSON.stringify(player));
  }
  const x = await request(
    inv ? "/" + inv.id + "/join" : "",
    inv ? { ...data, invite: inv.secret } : data,
    player,
  );
  session = { ...player, id: x.id, invite: x.invite };
  store();
  localStorage.removeItem(pendingKey);
  return x;
}
async function deliver() {
  const target = session,
    body = target.pending;
  try {
    const x = await request("/" + target.id, body);
    if (session === target && target.pending === body) {
      delete target.pending;
      store();
    }
    return x;
  } catch (e) {
    if (
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 429 &&
      session === target &&
      target.pending === body
    ) {
      delete target.pending;
      store();
    }
    throw e;
  }
}
export const poll = () =>
  session.pending ? deliver() : request("/" + session.id);
export function action(snapshot, type, u) {
  if (!session.pending) {
    session.pending = {
      type,
      u,
      requestId: crypto.randomUUID(),
      revision: snapshot.revision,
    };
    store();
  }
  return deliver();
}
export function invitation() {
  if (!session?.invite) return "";
  const url = new URL(location.href);
  url.hash = new URLSearchParams({
    room: session.id + "." + session.invite,
  }).toString();
  return url.href;
}
export function readInvite() {
  const q = new URLSearchParams(location.hash.slice(1)),
    m = q.get("room")?.match(/^([a-f0-9]{24})\.([\w-]{43})$/);
  return m ? { id: m[1], secret: m[2] } : null;
}
