import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// os/fs are Node ESM built-ins - their namespace exports aren't configurable,
// so vi.spyOn can't patch them directly. Route through mutable override hooks
// instead, defaulting to the real implementation.
const overrides: { statSync?: typeof fs.statSync; homedir?: typeof os.homedir } = {};

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    statSync: (...args: Parameters<typeof actual.statSync>) =>
      overrides.statSync ? overrides.statSync(...args) : actual.statSync(...args),
  };
});

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

import {
  folderToPath,
  folderToName,
  isRealRepo,
  getProjectFolders,
} from "@/lib/project-utils";

const username = os.userInfo().username;

describe("folderToPath", () => {
  it("converts a dashed project folder to a slash path", () => {
    expect(folderToPath("-Users-alice-Sites-myapp")).toBe("/Users/alice/Sites/myapp");
  });

  it("converts the leading dash to a leading slash", () => {
    expect(folderToPath("-tmp-foo")).toBe("/tmp/foo");
  });

  it("expands every dash, including dashes inside names", () => {
    expect(folderToPath("-Users-bob-Sites-local-apps")).toBe("/Users/bob/Sites/local/apps");
  });

  it("handles a single-segment folder", () => {
    expect(folderToPath("-Sites")).toBe("/Sites");
  });
});

describe("folderToName", () => {
  it("returns the segment after Sites", () => {
    expect(folderToName("-Users-alice-Sites-myapp")).toBe("myapp");
  });

  it("keeps multi-word names after Sites intact", () => {
    expect(folderToName("-Users-alice-Sites-local-apps")).toBe("local-apps");
  });

  it("returns ~ for the home directory folder", () => {
    expect(folderToName(`-Users-${username}`)).toBe("~");
  });

  it("returns ~ for a linux-style home directory folder", () => {
    expect(folderToName(`-home-${username}`)).toBe("~");
  });

  it("returns Sites for the Sites folder itself", () => {
    expect(folderToName("-Users-alice-Sites")).toBe("Sites");
  });

  it("falls back to the last segment when there is no Sites marker", () => {
    expect(folderToName("-tmp-foo-bar")).toBe("bar");
  });

  it("returns the segment after Sites when the resolved path exists on disk", () => {
    // Build a real Sites/<name> path instead of leaning on process.cwd(): CI checks
    // out to a hyphenated dir with no Sites marker, which took a different branch.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-utils-"));
    try {
      fs.mkdirSync(path.join(root, "Sites", "local-apps"), { recursive: true });
      const folder = path.join(root, "Sites", "local-apps").replace(/\//g, "-");
      expect(folderToName(folder)).toBe("local-apps");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the raw folder when there are no dash-separated parts", () => {
    expect(folderToName("-")).toBe("-");
  });
});

describe("isRealRepo", () => {
  it("returns true for a folder mapping to an existing directory", () => {
    const folder = process.cwd().replace(/\//g, "-");
    expect(isRealRepo(folder)).toBe(true);
  });

  it("returns false for a non-existent path", () => {
    expect(isRealRepo("-nope-does-not-exist-anywhere-12345")).toBe(false);
  });

  it("returns false when the path exists but is a file, not a directory", () => {
    const folder = process.cwd().replace(/\//g, "-") + "-package.json";
    expect(isRealRepo(folder)).toBe(false);
  });

  it("returns false when statSync throws after the path resolves", () => {
    overrides.statSync = () => {
      throw new Error("EACCES");
    };
    const folder = process.cwd().replace(/\//g, "-");
    expect(isRealRepo(folder)).toBe(false);
    delete overrides.statSync;
  });
});

describe("getProjectFolders", () => {
  afterEach(() => {
    delete overrides.statSync;
    delete overrides.homedir;
  });

  it("returns an array", () => {
    expect(Array.isArray(getProjectFolders())).toBe(true);
  });

  it("returns only strings", () => {
    expect(getProjectFolders().every((f) => typeof f === "string")).toBe(true);
  });

  it("returns only folders that map to real local directories", () => {
    expect(getProjectFolders().every((f) => isRealRepo(f))).toBe(true);
  });

  it("returns an empty array when the projects directory can't be read", () => {
    overrides.homedir = () => "/nonexistent-claude-home-xyz-12345";
    expect(getProjectFolders()).toEqual([]);
  });

  it("excludes entries where statSync throws", () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-home-"));
    const projectsDir = path.join(tmpHome, ".claude", "projects");
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.writeFileSync(path.join(projectsDir, "broken"), "");
    overrides.homedir = () => tmpHome;
    overrides.statSync = () => {
      throw new Error("boom");
    };

    expect(getProjectFolders()).toEqual([]);

    delete overrides.statSync;
    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("excludes projectsDir entries that are files, not directories", () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-home-file-"));
    const projectsDir = path.join(tmpHome, ".claude", "projects");
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.writeFileSync(path.join(projectsDir, "not-a-dir"), "");
    overrides.homedir = () => tmpHome;

    expect(getProjectFolders()).toEqual([]);

    delete overrides.homedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });
});
