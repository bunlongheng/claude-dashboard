import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// os is a Node ESM built-in - its namespace export isn't configurable, so
// vi.spyOn can't patch it directly. Route through a mutable override hook
// instead, defaulting to the real implementation.
const overrides: { homedir?: typeof os.homedir } = {};

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    ...actual,
    homedir: (...args: Parameters<typeof actual.homedir>) =>
      overrides.homedir ? overrides.homedir(...args) : actual.homedir(...args),
  };
});

import { listClaudeSkills } from "@/lib/claude-skills";

describe("listClaudeSkills", () => {
  const skills = listClaudeSkills();

  it("returns an array", () => {
    expect(Array.isArray(skills)).toBe(true);
  });

  it("gives every skill the expected shape", () => {
    for (const s of skills) {
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.description).toBe("string");
      expect(typeof s.path).toBe("string");
      expect(["user", "project"]).toContain(s.scope);
    }
  });

  it("has unique skill names (project overrides user)", () => {
    const names = skills.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("returns skills sorted by name", () => {
    const names = skills.map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("caches results so repeated calls are reference-equal", () => {
    expect(listClaudeSkills()).toBe(listClaudeSkills());
  });

  describe("error handling", () => {
    afterEach(() => {
      delete overrides.homedir;
    });

    it("falls back to a generic description when SKILL.md can't be read", () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-skills-home-"));
      const skillDir = path.join(tmpHome, ".claude", "skills", "badskill");
      // Create SKILL.md as a directory so readFileSync throws EISDIR inside parseSkillMd.
      fs.mkdirSync(path.join(skillDir, "SKILL.md"), { recursive: true });
      overrides.homedir = () => tmpHome;

      const skills = listClaudeSkills();
      const bad = skills.find((s) => s.name === "badskill");
      expect(bad?.description).toBe("Claude skill: badskill");

      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it("returns an empty array when an unexpected error occurs", () => {
      overrides.homedir = () => {
        throw new Error("boom");
      };
      expect(listClaudeSkills()).toEqual([]);
    });

    it("covers every frontmatter/heading fallback combination", () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-skills-fixtures-"));
      const skillsRoot = path.join(tmpHome, ".claude", "skills");

      // Frontmatter has description but no name key -> nameLine false branch.
      const noNameDir = path.join(skillsRoot, "skill-no-name");
      fs.mkdirSync(noNameDir, { recursive: true });
      fs.writeFileSync(
        path.join(noNameDir, "SKILL.md"),
        "---\ndescription: A skill without an explicit name field\n---\n"
      );

      // Frontmatter has name but no description key -> descLine false branch,
      // then the heading search walks past non-heading lines (frontmatter
      // itself) before matching a real heading further down.
      const noDescDir = path.join(skillsRoot, "skill-no-desc");
      fs.mkdirSync(noDescDir, { recursive: true });
      fs.writeFileSync(
        path.join(noDescDir, "SKILL.md"),
        "---\nname: skill-no-desc\n---\nSome intro text.\n# Actual Heading\n"
      );

      // Frontmatter has name but no description, and no heading anywhere ->
      // exhausts the heading search and falls through to the generic default.
      const noneDir = path.join(skillsRoot, "skill-none");
      fs.mkdirSync(noneDir, { recursive: true });
      fs.writeFileSync(
        path.join(noneDir, "SKILL.md"),
        "---\nname: skill-none\n---\nJust plain text, no heading at all.\n"
      );

      overrides.homedir = () => tmpHome;
      const skills = listClaudeSkills();

      const noName = skills.find((s) => s.name === "skill-no-name");
      expect(noName?.description).toBe("A skill without an explicit name field");

      const noDesc = skills.find((s) => s.name === "skill-no-desc");
      expect(noDesc?.description).toBe("Actual Heading");

      const none = skills.find((s) => s.name === "skill-none");
      expect(none?.description).toBe("Claude skill: skill-none");

      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it("lets project-scope skills merge alongside user-scope skills", () => {
      const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "claude-skills-project-"));
      fs.mkdirSync(path.join(tmpProject, ".claude", "skills", "proj-only"), { recursive: true });
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpProject);

      const skills = listClaudeSkills();
      const projOnly = skills.find((s) => s.name === "proj-only");
      expect(projOnly?.scope).toBe("project");

      cwdSpy.mockRestore();
      fs.rmSync(tmpProject, { recursive: true, force: true });
    });
  });
});
