import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoDescription } from "../fixtures";

async function start(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your project", { exact: true }).fill(demoDescription);
  await page.getByRole("button", { name: "Find my blind spots" }).click();
  await page.getByRole("button", { name: "Review profile from what I’ve shared" }).click();
  await page.getByRole("button", { name: "Approve profile & build checkpoints" }).click();
  await expect(page.getByRole("heading", { name: "Your next steps" })).toBeVisible();
}
async function navigate(page: Page, name: string) {
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name, exact: true }).click();
}

for (const width of [1440, 375]) {
  test(`exploration, approval and history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await start(page);
    await navigate(page, "Readiness map");
    await expect(page.getByText("Not assessed yet")).toBeVisible();
    const trigger = page.getByRole("button", { name: "Explore this area: Reliability & Operations", exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    const panel = page.getByRole("complementary", { name: "Readiness exploration" });
    await expect(panel.getByRole("heading", { name: "Exploring reliability risks" })).toBeVisible();
    const add = panel.getByRole("button", { name: "Add to Readiness Map" });
    await expect(add).toBeEnabled();
    if (width >= 1280) {
      await expect(page.getByRole("heading", { name: "Readiness map", exact: true })).toBeVisible();
      expect((await panel.boundingBox())!.width).toBeGreaterThanOrEqual(480);
    } else await expect(page.getByRole("heading", { name: "Readiness map", exact: true })).toBeHidden();
    await expect(panel.getByText("Potential new risk", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Keep discussing" }).click();
    await expect(page.getByLabel("Ask your advisor")).toBeFocused();
    await page.getByLabel("Ask your advisor").fill("What about vendor lock-in? None of your categories mention it.");
    await panel.getByRole("button", { name: "Send message" }).click();
    await expect(panel.getByText(/Vendor lock-in is a legitimate missing concern/)).toBeVisible();
    await add.click();
    await expect(panel.getByText("approved", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Close exploration" })).toBeInViewport();
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("exploration-approved.png"), fullPage: true });
    await page.getByLabel("Ask your advisor").press("Escape");
    await expect(panel).toBeHidden();
    // The original empty-state action disappears after approval; focus returns to the header action.
    await expect(page.getByRole("button", { name: "Explore blind spots" })).toBeFocused();
    await page.getByRole("button", { name: /^Reliability & Operations/ }).click();
    await expect(page.getByRole("button", { name: /Risk P1 · Important Validate provider outage recovery/ })).toBeVisible();
    await navigate(page, "Checklist");
    await expect(page.getByText("0 of 4", { exact: true })).toBeVisible();
    await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "Validate provider outage recovery", exact: true }) }).first().click();
    await page.getByRole("link", { name: "View supporting conversation" }).click();
    await expect(panel.getByText("approved", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Close exploration" }).click();
    if (width < 1024) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("navigation", { name: "Conversation history" }).getByRole("button", { name: "Exploring reliability risks" }).click();
    await expect(panel.getByText(/Vendor lock-in is a legitimate missing concern/)).toBeVisible();
    await page.reload();
    await expect(panel.getByText("approved", { exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Exploring reliability risks" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("global exploration recovers failed responses, dismissal changes no checkpoints, and new chat reuses empties", async ({ page }) => {
  await start(page);
  await navigate(page, "New conversation");
  await expect(page).toHaveURL(/#chat-/);
  const emptyUrl = page.url();
  for (let i = 0; i < 3; i++) await navigate(page, "New conversation");
  await expect(page).toHaveURL(emptyUrl);
  await expect(page.getByRole("navigation", { name: "Conversation history" }).getByRole("button", { name: "New conversation", exact: true })).toHaveCount(1);
  await navigate(page, "Readiness map");
  let fail = true;
  await page.route("**/conversations", async (route) => {
    if (fail && route.request().postDataJSON()?.action === "retry") {
      fail = false;
      return route.fulfill({ status: 502, json: { error: "The advisor is temporarily unavailable. Your message is saved." } });
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Explore blind spots" }).click();
  const panel = page.getByRole("complementary", { name: "Readiness exploration" });
  await expect(panel.getByRole("alert")).toContainText("temporarily unavailable");
  await panel.getByRole("button", { name: "Retry saved message" }).click();
  await expect(panel.getByRole("heading", { name: "What are we missing before launch?" })).toBeVisible();
  await panel.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(panel.getByText("rejected", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Close exploration" }).click();
  await expect(page.getByText("Exploration in progress")).toBeVisible();
  await navigate(page, "Checklist");
  await expect(page.getByText("0 of 3", { exact: true })).toBeVisible();
  await navigate(page, "New conversation");
  await expect(page).toHaveURL(emptyUrl);
});
