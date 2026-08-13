import { test, expect } from "@playwright/test";

const GOTO = { waitUntil: "domcontentloaded" as const };

test("Extensions tab switcher (Hooks / Commands / Plugins) works", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/extensions", GOTO);
  for (const label of ["Commands", "Plugins", "Hooks"]) {
    await page.getByRole("button", { name: label }).first().click();
    await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/extensions/);
  }
  expect(errors).toEqual([]);
});

test("Agents page loads without the old MCP/CLI tabs", async ({ page }) => {
  await page.goto("/agents", GOTO);
  await expect(page).toHaveURL(/\/agents/);
  await expect(page.locator("body")).not.toBeEmpty();
  // MCP & CLI moved to their own left-nav pages - those tab buttons are gone from /agents now
  await expect(page.getByRole("button", { name: "MCP", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CLI", exact: true })).toHaveCount(0);
});

test("sidebar collapse toggle changes the sidebar width", async ({ page }) => {
  await page.goto("/dashboard"); // default 'load' wait so the toggle handler is hydrated
  const aside = page.locator("aside").first();
  await expect(aside).toBeVisible();
  // The toggle's label depends on the current collapse level (0/1/2), which the
  // auto-collapse effect sets from the viewport - so assert the effect (width
  // change), not a specific label. Retry the click to guard the hydration gap.
  const toggle = page.getByRole("button", { name: /Hide badges|Icon only|Show all/ });
  const before = (await aside.boundingBox())!.width;
  await expect(async () => {
    await toggle.click();
    expect((await aside.boundingBox())!.width).not.toBe(before);
  }).toPass({ timeout: 15000 });
});

test("the sign out control is present in the sidebar", async ({ page }) => {
  await page.goto("/dashboard", GOTO);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
