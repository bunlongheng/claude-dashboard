import { test, expect } from "@playwright/test";

const GOTO_OPTS = { waitUntil: "domcontentloaded" as const };

test("dashboard loads with 200", async ({ page }) => {
  const response = await page.goto("/dashboard", GOTO_OPTS);
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).not.toBeEmpty();
});

test("sidebar nav has expected items", async ({ page }) => {
  await page.goto("/dashboard", GOTO_OPTS);
  const sidebar = page.locator("aside").first();
  await expect(sidebar).toBeVisible();
  const expectedLabels = [
    "Overview",
    "Rules",
    "Sessions",
    "Settings",
    "Skills",
    "Commands",
    "Hooks",
  ];
  for (const label of expectedLabels) {
    await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
  }
});

test("navigate to /rules and verify page loads", async ({ page }) => {
  const response = await page.goto("/rules", GOTO_OPTS);
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).not.toBeEmpty();
});

test("navigate to /sessions and verify page loads", async ({ page }) => {
  const response = await page.goto("/sessions", GOTO_OPTS);
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).not.toBeEmpty();
});

test("no console errors on dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  await page.goto("/dashboard", GOTO_OPTS);
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
