import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
test("Комнаты, права двух игроков, часы, повтор запроса, перезапуск, ничья и реванш", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chess-online-")),
    keys = Array.from({ length: 3 }, () =>
      randomBytes(32).toString("base64url"),
    );
  let proc, url;
  async function start() {
    proc = spawn(process.execPath, ["server/main.js"], {
      env: { ...process.env, PORT: "0", CHESS_DB: join(dir, "rooms.sqlite") },
      stdio: ["ignore", "pipe", "inherit"],
    });
    const [line] = await once(proc.stdout, "data");
    url = "http://127.0.0.1:" + String(line).trim().split(" ").at(-1);
  }
  async function stop() {
    const exit = once(proc, "exit");
    proc.kill();
    await exit;
    proc = null;
  }
  async function req(path, player, b) {
    const r = await fetch(url + "/api/rooms" + path, {
      method: b ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + keys[player],
        "Content-Type": "application/json",
      },
      body: b && JSON.stringify(b),
    });
    return [r.status, await r.json()];
  }
  try {
    await start();
    const [status, created] = await req("", 0, {
      color: 1,
      minutes: 3,
      increment: 2,
      training: true,
    });
    assert.equal(status, 201);
    const path = "/" + created.id;
    const [joined, guest] = await req(path + "/join", 1, {
      invite: created.invite,
      training: false,
    });
    assert.equal(joined, 200);
    assert.equal(guest.training, false);
    assert.equal(
      (await req(path + "/join", 2, { invite: created.invite }))[0],
      403,
    );
    assert.equal((await req(path, 2))[0], 403);
    const move = {
      type: "move",
      revision: guest.revision,
      requestId: randomUUID(),
      u: "e2e4",
    };
    assert.equal((await req(path, 1, move))[0], 400);
    assert.equal((await req(path, 0, { ...move, u: "e2e5" }))[0], 400);
    const duplicate = await Promise.all([
      req(path, 0, move),
      req(path, 0, move),
    ]);
    assert(duplicate.every(([s, r]) => s === 200 && r.game.moves.length === 1));
    assert(duplicate[0][1].game.clock[0] > 180000);
    assert.equal(
      (await req(path, 0, { ...move, requestId: randomUUID() }))[0],
      409,
    );
    await stop();
    await start();
    let r = (await req(path, 1))[1];
    assert.deepEqual(r.game.moves, ["e2e4"]);
    for (const [player, type] of [
      [0, "draw"],
      [1, "draw"],
      [1, "rematch"],
      [0, "rematch"],
    ]) {
      const [code, next] = await req(path, player, {
        type,
        revision: r.revision,
        requestId: randomUUID(),
      });
      assert.equal(code, 200);
      r = next;
      if (type === "draw" && player === 1)
        assert.equal(r.game.result.winner, 0);
    }
    assert.equal(r.game.result, null);
    assert.deepEqual(r.game.moves, []);
  } finally {
    if (proc) await stop();
    await rm(dir, { recursive: true });
  }
});
