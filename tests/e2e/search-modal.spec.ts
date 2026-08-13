import { test, expect } from "@playwright/test";

const RESULTS = {
  sessions: [{ title: "My Session", description: "a recent session", path: "/sessions", type: "sessions" }],
  memory: [], claudemd: [], skills: [], commands: [], hooks: [], settings: [],
};
const EMPTY = { sessions: [], memory: [], claudemd: [], skills: [], commands: [], hooks: [], settings: [] };

// Modal-specific: the /sessions page has its own "Search sessions..." filter,
// so match the modal's fuller placeholder to avoid colliding after navigation.
const placeholder = /Search sessions, memory/;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/claude/search**", (route) => route.fulfill({ json: RESULTS }));
});

test("opens from the sidebar Search button and shows the empty hint", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByPlaceholder(placeholder)).toBeVisible();
  await expect(page.getByText("Type to search across your Claude configuration")).toBeVisible();
});

test("opens with the Cmd+K shortcut", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Meta+k");
  await expect(page.getByPlaceholder(placeholder)).toBeVisible();
});

test("typing shows results and selecting one navigates then closes", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder(placeholder).fill("session");
  await expect(page.getByText("My Session")).toBeVisible();
  await page.getByText("My Session").click();
  await expect(page).toHaveURL(/\/sessions/);
  await expect(page.getByPlaceholder(placeholder)).toHaveCount(0);
});

test("shows the loading state then the results", async ({ page }) => {
  await page.route("**/api/claude/search**", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ json: RESULTS });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder(placeholder).fill("session");
  await expect(page.getByText("Searching...")).toBeVisible();
  await expect(page.getByText("My Session")).toBeVisible();
});

test("shows the no-results empty state", async ({ page }) => {
  await page.route("**/api/claude/search**", (route) => route.fulfill({ json: EMPTY }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder(placeholder).fill("zzzzz");
  await expect(page.getByText(/No results for/)).toBeVisible();
});

test("the clear button empties the query and restores the hint", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  const input = page.getByPlaceholder(placeholder);
  await input.fill("session");
  await expect(page.getByText("My Session")).toBeVisible();
  await page.locator('input[placeholder*="Search sessions"] ~ div button').first().click();
  await expect(input).toHaveValue("");
  await expect(page.getByText("Type to search across your Claude configuration")).toBeVisible();
});

test("Escape closes the modal", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  const input = page.getByPlaceholder(placeholder);
  await expect(input).toBeVisible();
  await input.press("Escape");
  await expect(input).toHaveCount(0);
});

test("clicking the backdrop closes the modal", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByPlaceholder(placeholder)).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(page.getByPlaceholder(placeholder)).toHaveCount(0);
});
