import { expect, test } from "@playwright/test";

const TEST_EMAIL = `e2e+${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-123";

test.describe.serial("auth flow", () => {
  test("sign up creates account and signs the user in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole("button", { name: /no account/i }).click();
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    await page.waitForURL("/");
    await expect(page.getByText(TEST_EMAIL)).toBeVisible({ timeout: 10_000 });
  });

  test("sign out returns to login page", async ({ page }) => {
    // Sign in first (each test runs in a fresh browser context)
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("/");

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("/login");
    await expect(page.getByText(/sign in to tracker/i)).toBeVisible();
  });
});
