// src/utils/browser.js
import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config();

const HEADLESS    = process.env.HEADLESS !== 'false';
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT || 30000);

export async function launch() {
  // Optional proxy from env
  const proxy =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() || null;

  const browser = await chromium.launch({
    headless: HEADLESS,
    devtools: process.env.PWDEVTOOLS === 'true',
    proxy: proxy ? { server: proxy } : undefined,
  });

  const context = await browser.newContext({
    userAgent: randomUA(),
    viewport: { width: 1366, height: 900 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' },
  });

  // Hide very basic automation signal
  await context.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
  });

  // Apply global request routing once
  applyContextRouting(context);

  context.setDefaultNavigationTimeout(NAV_TIMEOUT);
  context.setDefaultTimeout(NAV_TIMEOUT);
  return { browser, context };
}

function randomUA() {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

export async function waitDomSettled(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
}

/**
 * Backward-compatible no-op (routing already on context).
 */
export async function speedup(_page, _opts = {}) { /* no-op */ }

/**
 * Smooth scroll to load lazy content.
 */
export async function autoScroll(page, opts = {}) {
  const { step = 600, delayMs = 60, maxSteps = 20 } = opts;
  await page.evaluate(async ({ step, delayMs, maxSteps }) => {
    await new Promise(resolve => {
      let n = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        n++;
        const { scrollHeight } = document.documentElement;
        const atEnd = window.scrollY + window.innerHeight >= scrollHeight - 50;
        if (atEnd || n >= maxSteps) { clearInterval(timer); resolve(); }
      }, delayMs);
    });
  }, { step, delayMs, maxSteps });
}

/* ---------------- internal ---------------- */

function applyContextRouting(context) {
  if (context.__routingApplied) return;
  context.__routingApplied = true;

  const blockedTypes = new Set(['font', 'media', 'eventsource', 'websocket']);
  const blockedHosts = [
    'googletagmanager.com',
    'google-analytics.com',
    'doubleclick.net',
    'facebook.net',
    'hotjar.com',
    'segment.io',
    'braze.com',
    'clarity.ms'
  ];

  context.route('**/*', route => {
    const req = route.request();
    const type = req.resourceType();
    const url  = req.url();

    if (blockedTypes.has(type)) return route.abort();
    if (blockedHosts.some(h => url.includes(h))) return route.abort();

    return route.continue();
  });
}
