import { test, expect } from "@playwright/test";

const LAN_URL = "http://192.0.2.50:3003";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/claude/lan", (route) => route.fulfill({ json: { url: LAN_URL } }));
});

test("opens the LAN QR modal with the URL", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "LAN Access" }).first().click();
  await expect(page.getByText("Scan with your phone on the same network")).toBeVisible();
  await expect(page.getByText(LAN_URL)).toBeVisible();
});

test("renders the QR canvas", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "LAN Access" }).first().click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("the copy button keeps the modal open and copies the URL", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "LAN Access" }).first().click();
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByText(LAN_URL)).toBeVisible();
});

test("clicking the backdrop closes the modal", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "LAN Access" }).first().click();
  await expect(page.getByText("Scan with your phone on the same network")).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(page.getByText("Scan with your phone on the same network")).toHaveCount(0);
});
