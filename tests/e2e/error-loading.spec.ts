import { test, expect } from "@playwright/test";

const GOTO = { waitUntil: "domcontentloaded" as const };

test("dashboard still renders its shell when every API returns 500", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 500, json: { error: "boom" } }));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard", GOTO);
  await expect(page.locator("aside").first()).toBeVisible();
  // Wait for hydration + the failed API round-trips to settle, then check errors.
  await page.waitForLoadState("networkidle");
  // safeFetch + try/catch fallbacks mean a failed API must not crash the page
  await expect.poll(() => errors).toEqual([]);
});

test("sessions page renders its shell while the API is slow", async ({ page }) => {
  await page.route("**/api/claude/sessions**", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({ json: { projects: [] } });
  });
  await page.goto("/sessions", GOTO);
  await expect(page.locator("aside").first()).toBeVisible();
});

test("search handles an API error without crashing the modal", async ({ page }) => {
  await page.route("**/api/claude/search**", (route) => route.fulfill({ status: 500, body: "nope" }));
  await page.goto("/dashboard"); // default 'load' wait so React has hydrated the Search handler
  const input = page.getByPlaceholder(/Search sessions, memory/);
  // Retry the open click until the modal mounts (guards the hydration gap)
  await expect(async () => {
    await page.getByRole("button", { name: "Search" }).click();
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await input.fill("anything");
  // catch{} in doSearch keeps the modal alive and shows the no-results state
  await expect(input).toBeVisible();
});
