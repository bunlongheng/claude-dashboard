import { describe, it, expect } from "vitest";

describe("Smoke tests", () => {
  it("vitest runs successfully", () => {
    expect(true).toBe(true);
  });

  it("can import from node built-ins", async () => {
    const path = await import("path");
    expect(path.join("/a", "b")).toBe("/a/b");
  });

  it("jsdom environment is active", () => {
    expect(typeof document).toBe("object");
    expect(typeof window).toBe("object");
  });

  it("process.env is accessible", () => {
    expect(process.env).toBeDefined();
    expect(typeof process.env).toBe("object");
  });
});
