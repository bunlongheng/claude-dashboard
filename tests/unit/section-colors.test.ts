import { describe, it, expect } from "vitest";
import { SECTION_COLORS } from "@/app/(claude)/_sections/sectionColors";

describe("SECTION_COLORS", () => {
  it("is an object", () => {
    expect(typeof SECTION_COLORS).toBe("object");
  });

  it("maps the claude section to the brand orange", () => {
    expect(SECTION_COLORS.claude).toBe("#f97316");
  });

  it("maps the security section to red", () => {
    expect(SECTION_COLORS.security).toBe("#f43f5e");
  });

  it("defines a color for every known section", () => {
    expect(Object.keys(SECTION_COLORS).length).toBe(8);
  });

  it("uses valid 6-digit hex codes for every value", () => {
    for (const value of Object.values(SECTION_COLORS)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
