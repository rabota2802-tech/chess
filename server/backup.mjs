import { DatabaseSync } from "node:sqlite";
import { existsSync, linkSync, mkdtempSync, rmSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
if (!process.argv[2]) throw Error("Укажите новое имя файла снимка");
const output = resolve(process.argv[2]);
if (existsSync(output)) throw Error("Файл назначения уже существует");
const temp = mkdtempSync(join(dirname(output), ".chess-backup-")),
  snapshot = join(temp, "rooms.sqlite");
try {
  const db = new DatabaseSync(process.env.CHESS_DB || "chess.sqlite", {
    readOnly: true,
  });
  try {
    db.exec("PRAGMA busy_timeout=10000");
    db.prepare("VACUUM INTO ?").run(snapshot);
  } finally {
    db.close();
  }
  const copy = new DatabaseSync(snapshot, { readOnly: true });
  try {
    if (copy.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("Ошибка целостности");
    copy.prepare("SELECT id FROM rooms LIMIT 0").all();
  } finally {
    copy.close();
  }
  chmodSync(snapshot, 0o600);
  linkSync(snapshot, output);
  console.log("Проверенный снимок создан.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
