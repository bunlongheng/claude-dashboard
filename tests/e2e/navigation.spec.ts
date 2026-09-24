import { test, expect } from "@playwright/test";

const GOTO = { waitUntil: "domcontentloaded" as const };

const ROUTES = [
  "/dashboard", "/agents", "/rag", "/global", "/mcp", "/skills",
  "/cli", "/extensions", "/settings", "/sessions", "/tokens", "/usage", "/hooks",
  "/commands", "/plugins",
  "/rag/search", "/rag/preferences", "/rag/documents",
];

test.describe("every route loads", () => {
  for (const route of ROUTES) {
    test(`${route} renders without an error status`, async ({ page }) => {
      const res = await page.goto(route, GOTO);
      expect(res?.status() ?? 0).toBeLessThan(400);
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }
});

const PRIMARY_NAV = [
  "Overview", "Agents", "RAG", "Memory", "CLAUDE.md", "MCP",
  "Skills", "CLI", "Extensions", "Settings", "Sessions", "Tokens",
];

test("sidebar shows every primary nav item", async ({ page }) => {
  await page.goto("/dashboard", GOTO);
  const aside = page.locator("aside").first();
  await expect(aside).toBeVisible();
  for (const label of PRIMARY_NAV) {
    await expect(aside.getByText(label, { exact: true })).toBeVisible();
  }
});

test("clicking each nav item navigates to its route", async ({ page }) => {
  await page.goto("/dashboard", GOTO);
  const aside = page.locator("aside").first();
  const targets: [string, RegExp][] = [
    ["Agents", /\/agents/], ["RAG", /\/rag/],
    ["CLAUDE.md", /\/global/], ["MCP", /\/mcp/], ["Skills", /\/skills/],
    ["CLI", /\/cli/], ["Extensions", /\/extensions/], ["Settings", /\/settings/],
    ["Sessions", /\/sessions/], ["Tokens", /\/tokens/], ["Overview", /\/dashboard/],
  ];
  for (const [label, urlRe] of targets) {
    await aside.getByRole("link", { name: label }).first().click();
    await expect(page).toHaveURL(urlRe);
  }
});

test("no uncaught page errors on the dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard", GOTO);
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
