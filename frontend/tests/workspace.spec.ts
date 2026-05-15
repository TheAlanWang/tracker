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

  test("can create an issue in the project", async () => {
    // Click the project card to navigate into its issues list
    await page.getByText(PROJ_NAME).click();
    await page.waitForURL(`**/p/${PROJ_KEY}/list`, { timeout: 10_000 });

    // Open the create form, fill, submit
    await page.getByRole("button", { name: /new issue/i }).click();
    await page.getByLabel(/^title$/i).fill("First issue");
    await page.getByLabel(/^description$/i).fill("Issue description");
    await page.getByRole("button", { name: /^create$/i }).click();

    // Issue row appears with identifier "BE-1"
    await expect(page.getByText("BE-1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("First issue")).toBeVisible();
  });

  test("can open issue detail and change status", async () => {
    // We're still on the list page from the previous test
    await page.getByText("First issue").click();
    await page.waitForURL(`**/p/${PROJ_KEY}/issues/BE-1`, {
      timeout: 10_000,
    });

    // Title visible, identifier shown
    await expect(page.getByText("BE-1")).toBeVisible();

    // Change status to "todo"
    // Status is a <select>; the first <select> on the page is the status one
    await page.locator("select").first().selectOption("todo");
    // Wait a beat for the PATCH to round-trip
    await page.waitForTimeout(500);

    // Navigate back
    await page.goBack();
    await page.waitForURL(`**/p/${PROJ_KEY}/list`);

    // Filter to "todo" — should still see BE-1
    await page.locator("select").first().selectOption("todo");
    await expect(page.getByText("BE-1")).toBeVisible({ timeout: 5_000 });
  });

  test("can delete an issue", async () => {
    // Reload the list to ensure we're not in a stale state
    await page.goto(`/w/${WS_SLUG}/p/${PROJ_KEY}/list`);
    // Reset filter to "all" (it was todo from previous test)
    await page.locator("select").first().selectOption("all");
    await page.getByText("First issue").click();
    await page.waitForURL(`**/p/${PROJ_KEY}/issues/BE-1`);

    // Accept the confirm() dialog
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /delete issue/i }).click();

    // Navigated back to list; BE-1 no longer visible
    await page.waitForURL(`**/p/${PROJ_KEY}/list`, { timeout: 10_000 });
    await expect(page.getByText("BE-1")).not.toBeVisible();
  });
});
