// src/utils/recs/antibot.js
import { chromium } from 'playwright';

export function pickUA() {
  const userAgents = [
    // Recent Chrome/Edge/Safari desktop UAs
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function newContext({
  headless = true,
  acceptLanguage = 'en-US,en;q=0.9',
  proxy = undefined,
  viewport = { width: 1366, height: 900 },
} = {}) {
  const browser = await chromium.launch({ headless, proxy });
  const primaryLocale = acceptLanguage.split(',')[0] || 'en-US';

  const context = await browser.newContext({
    userAgent: pickUA(),
    viewport,
    locale: primaryLocale,
    timezoneId: 'UTC',
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    extraHTTPHeaders: { 'Accept-Language': acceptLanguage },
  });

  await context.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
  });

  context.setDefaultNavigationTimeout(30000);
  context.setDefaultTimeout(30000);

  return { browser, context };
}
