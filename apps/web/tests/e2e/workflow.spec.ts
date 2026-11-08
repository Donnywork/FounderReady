import { test, expect } from "@playwright/test";

test("a founder completes the interview, records evidence, and revisits a checkpoint", async ({ page, context, browser }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your demo works. What happens next?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("landing-desktop.png"), fullPage: true });
  await page.getByLabel("What are you building?").fill("I'm building a document assistant for small business customers with private uploads and AI answers.");
  await page.getByRole("button", { name: "Find my blind spots" }).click();
  await page.getByRole("button", { name: "Start the questions" }).click();
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(`Question ${i + 1} of up to 5`)).toBeVisible();
    await page.getByRole("button", { name: "I don’t know", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "A clearer next step." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep customer documents separate" })).toBeVisible();
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Inspect the current authentication");
  await page.getByLabel("Add an evidence note").fill("Cross-customer document retrieval tests passed in staging. Test run 42.");
  await page.getByLabel("Evidence type").selectOption("reviewed");
  await page.getByLabel("Reviewer’s name").fill("Sam");
  await page.getByRole("button", { name: "Add evidence", exact: true }).click();
  await expect(page.getByText("Review reported by Sam")).toBeVisible();
  await page.getByLabel("Who owns this?").fill("Sam");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("complete");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await page.screenshot({ path: testInfo.outputPath("workspace-desktop.png"), fullPage: true });
  const workspaceUrl = page.url();
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Revisit your risks" }).click();
  await page.getByLabel("What’s new, or what are you unsure about?").fill("We are adding shared folders across customer accounts.");
  await page.getByRole("button", { name: "Start a follow-up" }).click();
  await expect(page.getByRole("heading", { name: "Will the new sharing feature allow access across customer accounts?" })).toBeVisible();
  await page.getByRole("button", { name: "I don’t know", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your latest follow-up" })).toBeVisible();
  await page.getByRole("button", { name: "Review checkpoints" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByText("Needs review", { exact: true }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Conversation history" }).getByRole("button", { name: "Getting to know your product" }).click();
  await expect(page.getByRole("heading", { name: "Getting to know your product" })).toBeVisible();
  await expect(page.getByText("What kind of information will your users share?", { exact: false }).first()).toBeVisible();
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await outsiderPage.goto(workspaceUrl);
  await expect(outsiderPage.getByRole("heading", { name: "We couldn’t open this workspace." })).toBeVisible();
  await outsider.close();
  expect(errors).toEqual([]);
});

test("mobile navigation and early assessment work without horizontal overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Website outages", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("landing-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Find my blind spots" }).click();
  await page.getByRole("button", { name: "Build checkpoints from what I’ve shared" }).click();
  await expect(page.getByRole("heading", { name: "A clearer next step." })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Getting to know your product" }).click();
  await expect(page.getByRole("heading", { name: "Getting to know your product" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("history-mobile.png"), fullPage: true });
});
