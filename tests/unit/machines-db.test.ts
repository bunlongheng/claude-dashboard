import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// lib/machines-db.ts reads MACHINES_DB_PATH once at module load, so each case
// sets the env first and then imports a fresh module instance.

const saved = { MACHINES_DB_PATH: process.env.MACHINES_DB_PATH, LOCAL_MACHINE_ID: process.env.LOCAL_MACHINE_ID };

async function load() {
  vi.resetModules();
  return import("@/lib/machines-db");
}

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("openMachinesDb", () => {
  it("returns null when MACHINES_DB_PATH is unset", async () => {
    delete process.env.MACHINES_DB_PATH;
    const { openMachinesDb } = await load();
    expect(openMachinesDb()).toBeNull();
  });

  it("returns null when the file cannot be opened read-only", async () => {
    process.env.MACHINES_DB_PATH = path.join(os.tmpdir(), "machines-db-does-not-exist", "x.db");
    const { openMachinesDb } = await load();
    expect(openMachinesDb()).toBeNull();
  });

  it("opens a real registry read-only and lets the caller query and close it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "machines-db-"));
    const dbPath = path.join(dir, "machines.db");
    const Database = require("better-sqlite3");
    const seed = new Database(dbPath);
    seed.exec("CREATE TABLE machines (id TEXT PRIMARY KEY, hostname TEXT, ip TEXT, port INTEGER, model TEXT, last_seen TEXT)");
    seed.prepare("INSERT INTO machines (id, hostname, ip, port) VALUES (?, ?, ?, ?)").run("pi5", "pi5", "10.0.0.5", 3003);
    seed.close();

    process.env.MACHINES_DB_PATH = dbPath;
    const { openMachinesDb } = await load();
    const db = openMachinesDb();
    expect(db).not.toBeNull();
    expect(db!.readonly).toBe(true);
    expect(db!.prepare("SELECT id, ip, port FROM machines").all()).toEqual([{ id: "pi5", ip: "10.0.0.5", port: 3003 }]);
    db!.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("localMachineId", () => {
  it("prefers LOCAL_MACHINE_ID over the hostname", async () => {
    process.env.LOCAL_MACHINE_ID = "custom-id";
    const { localMachineId } = await load();
    expect(localMachineId()).toBe("custom-id");
  });

  it("falls back to the short hostname", async () => {
    delete process.env.LOCAL_MACHINE_ID;
    const { localMachineId } = await load();
    expect(localMachineId()).toBe(os.hostname().split(".")[0]);
  });
});
