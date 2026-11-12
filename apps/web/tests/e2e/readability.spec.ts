import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readabilityProject, longAction, longReference } from "./readability-fixture";
import { question } from "../fixtures";
import type { ProjectDetail } from "../../src/lib/contracts";

function contrast(a: string, b: string) {
  function luminance(color: string) {
    const normalized = /^#[\da-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map((v) => v + v).join("")}` : color;
    const values = normalized.startsWith("#") ? normalized.slice(1).match(/.{2}/g)!.map((v) => parseInt(v, 16)) : normalized.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const [r, g, b] = values.map((v) => { const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  }
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function checkPage(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const issues = await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push("Page overflows horizontally");
    for (const el of document.querySelectorAll<HTMLElement>("main *, header *, aside *")) {
      if (!el.checkVisibility() || el.closest("svg")) continue;
      const style = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (hasText && parseFloat(style.fontSize) < 14) issues.push(`Small text: ${el.textContent?.slice(0, 70)}`);
      if (hasText && (style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none" && style.webkitLineClamp !== "0")) issues.push(`Truncated text: ${el.textContent?.slice(0, 70)}`);
      if (el.scrollWidth > el.clientWidth + 1 && ["hidden", "clip"].includes(style.overflowX) && hasText) issues.push(`Clipped text: ${el.textContent?.slice(0, 70)}`);
    }
    return issues;
  });
  expect(issues, `${name}: readable text and wrapping`).toEqual([]);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(scan.violations, `${name}: WCAG automated checks`).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

for (const width of [1440, 375]) {
  test(`readable pages, priorities and long content at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 1000 });
    let project: ProjectDetail = structuredClone(readabilityProject);
    await page.route("**/api/projects**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/projects" ? { projects: [project] } : project }));
    await page.goto("/");
    await expect(page.getByRole("link", { name: project.title })).toBeVisible();
    await checkPage(page, testInfo, "landing");

    for (const view of ["dashboard", "map", "chat-empty", "chat-history", "profile", "checkpoint-checkpoint-0", "updates"]) {
      await page.goto(`/workspace/${project.id}#${view}`);
      await expect(page.locator("main h1")).toBeVisible();
      if (view === "map") {
        const domain = page.getByRole("button", { name: /Security & Privacy/ });
        await expect(domain).toContainText("1 open P0");
        await expect(domain).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("button", { name: `Checkpoint: ${longAction}`, exact: true })).toBeVisible();
        for (const label of ["P0 · Critical", "P1 · Important", "P2 · Can wait", "Needs action", "Unknown", "Planned", "Founder-confirmed"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
        const badge = page.getByText("P0 · Critical", { exact: true }).first();
        await expect(badge).toHaveCSS("font-size", "14px");
        await expect(badge).toHaveCSS("font-weight", "600");
        await page.getByRole("button", { name: "Collapse all areas", exact: true }).click();
        await expect(domain).toHaveAttribute("aria-expanded", "false");
        await checkPage(page, testInfo, "map-collapsed");
        await page.getByRole("button", { name: "Expand all areas", exact: true }).click();
        await expect(domain).toHaveAttribute("aria-expanded", "true");
      }
      if (view === "chat-history") await expect(page.getByText(longReference, { exact: false })).toBeVisible();
      if (view === "checkpoint-checkpoint-0") await page.getByText("Read engineering prompt", { exact: true }).click();
      if (view === "updates") for (const summary of await page.getByText("Review proposed changes", { exact: true }).all()) await summary.click();
      await checkPage(page, testInfo, view);
    }

    // Exercise the remaining work/disposition labels using the same rendered components.
    const cases = [
      ["implemented_unverified", "active"], ["evidence_reviewed", "active"],
      ["planned", "deferred"], ["unknown", "risk_accepted"], ["unknown", "not_applicable"],
    ] as const;
    project.checkpoints = cases.map(([status, disposition], i) => ({ ...project.checkpoints[0], id: `state-${i}`, title: `Checkpoint review state ${i + 1}`, status, disposition }));
    await page.goto(`/workspace/${project.id}#dashboard`);
    await page.reload();
    await expect(page.getByText("Implemented · unverified").first()).toBeVisible();
    await checkPage(page, testInfo, "checkpoint-states");

    project = { ...structuredClone(readabilityProject), phase: "interview", pendingQuestion: { ...question, id: "question-0" }, answeredCount: 0 };
    await page.goto(`/workspace/${project.id}#dashboard`);
    await page.reload();
    await expect(page.getByRole("heading", { name: question.text })).toBeVisible();
    await checkPage(page, testInfo, "interview");
  });

  test(`contrast and interactive states at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const project = structuredClone(readabilityProject);
    await page.route("**/api/projects**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/projects" ? { projects: [project] } : project }));
    await page.goto(`/workspace/${project.id}#chat-empty`);
    const send = page.getByRole("button", { name: "Send message" });
    await expect(send).toBeDisabled();
    await expect(send).toHaveCSS("font-size", "16px");
    await expect(send).toHaveCSS("font-weight", "500");
    const input = page.getByLabel("Ask your advisor");
    const inputColors = await input.evaluate((el) => ({ placeholder: getComputedStyle(el, "::placeholder").color, background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }));
    expect(contrast(inputColors.placeholder, inputColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(inputColors.border, inputColors.background)).toBeGreaterThanOrEqual(3);

    await page.getByRole("button", { name: "Explain a risk", exact: true }).click();
    await expect(input).toHaveValue("Can you explain the highest-priority risk in plain language?");
    await expect(send).toBeEnabled();
    const normalBackground = await send.evaluate((el) => getComputedStyle(el).backgroundColor);
    await send.hover();
    await expect.poll(() => send.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(normalBackground);
    await input.focus();
    await page.keyboard.press("Tab");
    await expect(send).toBeFocused();
    await expect(send).toHaveCSS("outline-style", "solid");
    await expect(send).toHaveCSS("outline-width", "2px");
    await checkPage(page, testInfo, "conversation-ready-to-send");

    if (width < 1024) await page.getByRole("button", { name: "Open navigation" }).click();
    const history = page.getByRole("navigation", { name: "Conversation history" });
    const historyTitle = history.getByRole("button", { name: project.conversations[1].title, exact: true });
    await expect(historyTitle).toHaveAttribute("title", project.conversations[1].title);
    await expect(historyTitle).toHaveCSS("white-space", "normal");
    await checkPage(page, testInfo, "navigation");
    const map = page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Readiness map" });
    await map.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Readiness map", exact: true })).toBeVisible();
    if (width < 1024) await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(map).toHaveAttribute("aria-current", "page");
    await expect(map).toHaveCSS("border-left-width", "2px");
    await expect(map).toHaveCSS("font-weight", "600");
    if (width < 1024) await page.getByRole("button", { name: "Close navigation" }).click();
    const domain = page.getByRole("button", { name: /Security & Privacy/ });
    await domain.focus();
    await page.keyboard.press("Space");
    await expect(domain).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(domain).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    const risk = page.getByRole("button", { name: /Risk P0 · Critical Keep customer data separate/ });
    await expect(risk).toBeFocused();
    await expect(risk).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(risk).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#domain-security").getByRole("complementary", { name: "Selected risk" })).toBeVisible();
    await page.keyboard.press("Tab");
    const checkpoint = page.getByRole("button", { name: `Checkpoint: ${longAction}`, exact: true });
    await expect(checkpoint).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Keep customer data separate", exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: "Readiness map", exact: true })).toBeVisible();

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(["foreground", "muted-foreground", "background", "surface", "sidebar", "muted", "accent", "primary", "primary-hover", "critical", "critical-surface", "warning", "warning-surface", "input", "ring"].map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
    });
    const ratios: Record<string, number> = {};
    for (const text of ["foreground", "muted-foreground", "primary", "critical", "warning"]) {
      for (const background of ["background", "surface", "sidebar", "muted", "accent"]) {
        const ratio = contrast(tokens[text], tokens[background]);
        ratios[`${text} / ${background}`] = Number(ratio.toFixed(2));
        expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const tone of ["critical", "warning"]) expect(contrast(tokens[tone], tokens[`${tone}-surface`])).toBeGreaterThanOrEqual(4.5);
    for (const background of ["primary", "primary-hover"]) expect(contrast(tokens.surface, tokens[background])).toBeGreaterThanOrEqual(4.5);
    for (const indicator of ["input", "ring"]) for (const background of ["surface", "background", "sidebar", "accent"]) expect(contrast(tokens[indicator], tokens[background]), `${indicator} on ${background}`).toBeGreaterThanOrEqual(3);
    await testInfo.attach("contrast-ratios", { body: JSON.stringify(ratios, null, 2), contentType: "application/json" });
  });
}
