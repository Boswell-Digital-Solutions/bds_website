/**
 * HUD verification harness (dev-only).
 *
 * Boots the website on a throwaway port, drives a headless browser through the
 * support HUD, asserts the key states, and writes screenshots to out/hud/.
 * Exits non-zero on the first failed assertion so it can gate a change.
 *
 *   bun run verify:hud
 *
 * Playwright is intentionally NOT a project dependency (it would bloat the
 * Render deploy). Install it on demand for local verification:
 *
 *   bun add -d playwright && bunx playwright install chromium
 *
 * Override the browser binary with HUD_VERIFY_CHROMIUM=/path/to/chrome.
 */

import { mkdir } from "node:fs/promises";
import { Glob } from "bun";

const PORT = 38000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT_DIR = "out/hud";

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function resolveChromium(): Promise<string | undefined> {
  if (process.env.HUD_VERIFY_CHROMIUM) {
    return process.env.HUD_VERIFY_CHROMIUM;
  }
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    `${process.env.HOME ?? ""}/.cache/ms-playwright`,
  ].filter(Boolean) as string[];
  for (const root of roots) {
    const glob = new Glob("chromium-*/chrome-linux/chrome");
    for await (const rel of glob.scan({ cwd: root, onlyFiles: true })) {
      return `${root}/${rel}`;
    }
  }
  return undefined;
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}healthz`, { headers: { accept: "application/json" } });
      if (res.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error("server did not become healthy in time");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const server = Bun.spawn(["bun", "run", "start"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT) },
    stdout: "ignore",
    stderr: "inherit",
  });

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    server.kill();
    console.error(
      "\nplaywright is not installed. Run:\n  bun add -d playwright && bunx playwright install chromium\n"
    );
    process.exit(2);
  }

  let browser: import("playwright").Browser | undefined;
  try {
    await waitForHealth(15000);

    const executablePath = await resolveChromium();
    browser = await playwright.chromium.launch(executablePath ? { executablePath } : {});

    // ---- Desktop ----
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await desktop.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });

    check("launcher mounts on page", (await page.locator("#hud-trigger").count()) === 1);

    await page.click("#hud-trigger");
    await page.waitForSelector(".hud-panel--open", { timeout: 5000 });
    check("panel opens", true);

    await page.waitForFunction(
      () => document.querySelector("#hud-status")?.getAttribute("data-state") !== "checking",
      undefined,
      { timeout: 3000 }
    );
    const statusState = await page.locator("#hud-status").getAttribute("data-state");
    check(
      "status card resolves from /healthz",
      statusState === "operational" || statusState === "degraded" || statusState === "down",
      `state=${statusState}`
    );

    check("home quick links render", (await page.locator(".hud-suggestion").count()) >= 1);
    await page.screenshot({ path: `${OUT_DIR}/desktop-home.png` });

    await page.click("#hud-tab-messages");
    await page.waitForSelector("#hud-view-messages:not([hidden])", { timeout: 3000 });
    const composerOk =
      (await page.locator("#hud-name").count()) === 1 &&
      (await page.locator("#hud-email").count()) === 1 &&
      (await page.locator("#hud-message").count()) === 1 &&
      (await page.locator("#hud-submit").count()) === 1;
    check("messages composer renders", composerOk);
    await page.screenshot({ path: `${OUT_DIR}/desktop-messages.png` });

    await page.click("#hud-close");
    await page.waitForSelector(".hud-panel:not(.hud-panel--open)", { timeout: 3000 });
    check("panel closes", true);
    await page.screenshot({ path: `${OUT_DIR}/desktop-closed.png` });
    await desktop.close();

    // ---- Mobile ----
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mpage = await mobile.newPage();
    await mpage.goto(BASE, { waitUntil: "networkidle" });
    await mpage.click("#hud-trigger");
    await mpage.waitForSelector(".hud-panel--open", { timeout: 5000 });
    // offsetWidth reflects CSS layout width and ignores the open-animation
    // scale() transform that getBoundingClientRect would fold in.
    const fullWidth = await mpage.evaluate(() => {
      const panel = document.querySelector(".hud-panel") as HTMLElement | null;
      return panel ? panel.offsetWidth >= window.innerWidth - 1 : false;
    });
    check("mobile panel is full-width sheet", fullWidth);
    await mpage.screenshot({ path: `${OUT_DIR}/mobile-home.png` });
    await mobile.close();
  } finally {
    await browser?.close();
    server.kill();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots in ${OUT_DIR}/`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

await main();
