import { describe, it, expect } from "vitest";

describe("API route exports", () => {
  describe("monitor/sessions", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/sessions/route");
      expect(typeof mod.GET).toBe("function");
    });
    it("exports DELETE handler", async () => {
      const mod = await import("@/app/api/claude/sessions/route");
      expect(typeof mod.DELETE).toBe("function");
    });
  });

  describe("monitor/machines", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/machines/route");
      expect(typeof mod.GET).toBe("function");
    });
  });

  describe("monitor/skills", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/skills/route");
      expect(typeof mod.GET).toBe("function");
    });
    it("exports PUT handler", async () => {
      const mod = await import("@/app/api/claude/skills/route");
      expect(typeof mod.PUT).toBe("function");
    });
  });

  describe("monitor/settings", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/claude/settings/route");
      expect(typeof mod.GET).toBe("function");
    });
  });

  describe("qr", () => {
    it("exports GET handler", async () => {
      const mod = await import("@/app/api/qr/route");
      expect(typeof mod.GET).toBe("function");
    });
  });
});
