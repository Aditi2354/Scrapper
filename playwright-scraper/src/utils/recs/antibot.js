import { chromium } from 'playwright';

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
];

export function pickUA(){
  return UAS[Math.floor(Math.random()*UAS.length)];
}

export function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

export async function newContext(options = {}){
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: pickUA(),
    viewport: { width: 1366, height: 900 },
    locale: options.locale || 'en-US',
    timezoneId: options.timezoneId || 'UTC',
    extraHTTPHeaders: { 'Accept-Language': options.acceptLanguage || 'en-US,en;q=0.9' }
  });
  await context.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
  });
  return { browser, context };
}
