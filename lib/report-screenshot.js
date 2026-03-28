import fs from "node:fs";
import path from "node:path";
import { chromium as playwrightChromium } from "playwright-core";

const ROOT_SELECTORS = {
  combined: "[data-report-root='combined']",
  single: "[data-report-root='single']",
  overview: "[data-report-card-root='overview']",
  games: "[data-report-card-root='games']",
  users: "[data-report-card-root='users']"
};

function getBaseUrl() {
  if (process.env.AUTH_URL) return process.env.AUTH_URL;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

function getLocalChromePath() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(path.normalize(candidate))) || null;
}

function getBrowserlessWsEndpoint() {
  return process.env.BROWSERLESS_WS_ENDPOINT || process.env.BROWSER_WS_ENDPOINT || "";
}

async function createBrowser() {
  const wsEndpoint = getBrowserlessWsEndpoint();
  if (wsEndpoint) {
    return playwrightChromium.connect(wsEndpoint);
  }

  const localPath = getLocalChromePath();
  if (!localPath) {
    if (process.env.VERCEL) {
      throw new Error("Missing BROWSERLESS_WS_ENDPOINT for production screenshots.");
    }
    throw new Error("No Chrome executable found. Set CHROME_EXECUTABLE_PATH.");
  }

  return playwrightChromium.launch({
    executablePath: localPath,
    headless: true
  });
}

export async function screenshotReportCard({ card, date, token }) {
  const browser = await createBrowser();

  try {
    const isCombined = card === "combined";
    const page = await browser.newPage({
      viewport: {
        width: isCombined ? 1980 : 1280,
        height: isCombined ? 740 : 760
      }
    });

    const url = new URL("/reports/daily-recap", getBaseUrl());
    url.searchParams.set("card", card);
    url.searchParams.set("date", date);
    url.searchParams.set("token", token);

    await page.goto(url.toString(), {
      waitUntil: "networkidle"
    });

    const selector = ROOT_SELECTORS[card] || ROOT_SELECTORS.single;
    const target = page.locator(selector);
    await target.waitFor({ state: "visible", timeout: 15000 });
    return await target.screenshot({
      type: "png",
      omitBackground: true
    });
  } finally {
    await browser.close();
  }
}
