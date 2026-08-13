import { describe, it, expect, beforeAll, vi } from "vitest";
import * as os from "os";
import * as path from "path";

const TMP_DB = path.join(os.tmpdir(), `rag-dedup-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.RAG_DB_PATH = TMP_DB;

const { vectorFor, register } = vi.hoisted(() => {
  const registry = new Map<string, number[]>();
  function vectorFor(value: string): Float32Array {
    const v = registry.get(value);
    if (!v) throw new Error(`no fake vector registered for "${value}"`);
    return new Float32Array(v);
  }
  function register(value: string, vector: number[]) {
    registry.set(value, vector);
  }
  return { vectorFor, register };
});

vi.mock("@/lib/eval/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/eval/embeddings")>();
  return {
    ...actual,
    embedBatch: vi.fn(async (texts: string[]) => texts.map(vectorFor)),
  };
});

type RagDb = typeof import("@/lib/rag-db");
type Dedup = typeof import("@/lib/rag-dedup");

let db: RagDb;
let dedup: Dedup;

beforeAll(async () => {
  db = await import("@/lib/rag-db");
  dedup = await import("@/lib/rag-dedup");
});

function wipePrefs() {
  db.getDb().exec("DELETE FROM preferences");
}

function addPref(category: string, key: string, value: string) {
  db.getDb()
    .prepare("INSERT INTO preferences (category, key, value) VALUES (?, ?, ?)")
    .run(category, key, value);
}

function prefCount(): number {
  return (db.getDb().prepare("SELECT COUNT(*) as c FROM preferences").get() as { c: number }).c;
}

describe("rag-dedup", () => {
  it("is a no-op when there are no preferences to dedup", async () => {
    wipePrefs();
    const result = await dedup.dedupPreferences();
    expect(result).toEqual({ before: 0, after: 0, removed: 0, clusters: 0, examples: [] });
  });

  it("dryRun true reports clustering and removal without deleting rows", async () => {
    wipePrefs();
    register("alpha value one", [1, 0, 0, 0]);
    register("alpha value two duplicate", [1, 0, 0, 0]);
    register("beta value distinct", [0, 1, 0, 0]);
    addPref("catA", "k1", "alpha value one");
    addPref("catA", "k2", "alpha value two duplicate");
    addPref("catB", "k3", "beta value distinct");

    const before = prefCount();
    const result = await dedup.dedupPreferences({ dryRun: true });
    expect(result.before).toBe(before);
    expect(result.clusters).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.after).toBe(before);
    expect(result.examples.length).toBe(1);
    expect(result.examples[0].kept).toContain("k2");
    expect(result.examples[0].merged[0]).toContain("k1");
    expect(prefCount()).toBe(before);
  });

  it("actually removes duplicate rows when dryRun is not set", async () => {
    wipePrefs();
    register("gamma phrase original", [0, 0, 1, 0]);
    register("gamma phrase duplicate copy", [0, 0, 1, 0]);
    addPref("catC", "k4", "gamma phrase original");
    addPref("catC", "k5", "gamma phrase duplicate copy");

    const before = prefCount();
    const result = await dedup.dedupPreferences();
    expect(result.before).toBe(before);
    expect(result.removed).toBe(1);
    expect(result.after).toBe(before - 1);
    expect(prefCount()).toBe(before - 1);

    const remaining = db.getDb().prepare("SELECT value FROM preferences WHERE category = 'catC'").all() as {
      value: string;
    }[];
    expect(remaining.length).toBe(1);
    expect(remaining[0].value).toBe("gamma phrase duplicate copy");
  });

  it("custom threshold changes whether similar values cluster", async () => {
    wipePrefs();
    register("threshold value alpha", [1, 0]);
    register("threshold value beta", [0.5, 0]);
    addPref("catD", "k6", "threshold value alpha");
    addPref("catD", "k7", "threshold value beta");

    const strict = await dedup.dedupPreferences({ dryRun: true });
    expect(strict.clusters).toBe(2);
    expect(strict.removed).toBe(0);

    const loose = await dedup.dedupPreferences({ dryRun: true, threshold: 0.4 });
    expect(loose.clusters).toBe(1);
    expect(loose.removed).toBe(1);
  });

  it("skips a preference already assigned to an earlier cluster while scanning", async () => {
    wipePrefs();
    register("skip test value zero", [1, 0]);
    register("skip test value one", [0, 1]);
    register("skip test value two same as zero", [1, 0]);
    addPref("catF", "s0", "skip test value zero");
    addPref("catF", "s1", "skip test value one");
    addPref("catF", "s2", "skip test value two same as zero");

    const result = await dedup.dedupPreferences({ dryRun: true });
    expect(result.clusters).toBe(2);
    expect(result.removed).toBe(1);
  });

  it("caps examples at 8 even with more than 8 duplicate clusters", async () => {
    wipePrefs();
    for (let i = 0; i < 9; i++) {
      const valA = `dup-${i}-a`;
      const valB = `dup-${i}-b-longer`;
      const vec = new Array(9).fill(0);
      vec[i] = 1;
      register(valA, vec);
      register(valB, vec);
      addPref("catE", `k-${i}-a`, valA);
      addPref("catE", `k-${i}-b`, valB);
    }

    const result = await dedup.dedupPreferences({ dryRun: true });
    expect(result.clusters).toBe(9);
    expect(result.removed).toBe(9);
    expect(result.examples.length).toBe(8);
  });
});
