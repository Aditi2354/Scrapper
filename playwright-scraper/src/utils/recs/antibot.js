import { UAParser } from 'ua-parser-js';

/**
 * Picks a random user agent from a pool of common desktop browsers
 */
export function pickUA() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Random sleep between min and max milliseconds
 */
export function sleep(min = 300, max = 900) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Creates a new browser context with anti-bot measures
 */
export async function newContext(browser, options = {}) {
  const ua = pickUA();
  const parser = new UAParser(ua);

  // Extract language based on user agent
  let acceptLanguage = 'en-US,en;q=0.9';
  if (parser.getBrowser().name === 'Chrome') {
    acceptLanguage = 'en-US,en;q=0.9';
  } else if (parser.getBrowser().name === 'Firefox') {
    acceptLanguage = 'en-US,en;q=0.9';
  } else if (parser.getBrowser().name === 'Safari') {
    acceptLanguage = 'en-US,en;q=0.9';
  }

  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    extraHTTPHeaders: {
      'Accept-Language': acceptLanguage
    },
    ...options
  });

  // Hide webdriver property
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    } catch {}
  });

  return context;
}