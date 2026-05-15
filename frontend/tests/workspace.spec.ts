import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const TS = Date.now();
const TEST_EMAIL = `ws+${TS}@example.com`;
const TEST_PASSWORD = "test-password-123";
const WS_NAME = `Test WS ${TS}`;
const WS_SLUG = `test-ws-${TS}`;
const PROJ_NAME = "Backend";
const PROJ_KEY = "BE";

let context: BrowserContext;
let page: Page;

test.describe.serial("workspace + project flow", () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("new user is routed to onboarding", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole("button", { name: /no account/i }).click();
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    // Should redirect to /onboarding (no workspaces)
    await page.waitForURL("**/onboarding", { timeout: 15_000 });
    await expect(page.getByText(/welcome to tracker/i)).toBeVisible();
  });

  test("creating workspace redirects to /w/<slug>", async () => {
    await page.goto("/");
    // Should land on /onboarding (session from previous test)
    await page.waitForURL("**/onboarding");

    await page.getByLabel(/workspace name/i).fill(WS_NAME);
    // Slug auto-fills from name; override to deterministic test slug
    await page.getByLabel(/url slug/i).fill(WS_SLUG);
    await page.getByRole("button", { name: /create workspace/i }).click();

    await page.waitForURL(`**/w/${WS_SLUG}`, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
  });

  test("can create a project in the workspace", async () => {
    await page.goto(`/w/${WS_SLUG}`);
    await page.getByRole("button", { name: /new project/i }).click();

    await page.getByLabel(/^name$/i).fill(PROJ_NAME);
    await page.getByLabel(/^key$/i).fill(PROJ_KEY);
    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(page.getByText(PROJ_NAME)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(PROJ_KEY)).toBeVisible();
  });
});
