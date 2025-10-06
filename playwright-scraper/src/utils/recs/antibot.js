/**
 * Anti-bot utilities for Amazon scraping
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0'
];

/**
 * Pick a random user agent
 */
export function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Sleep for a random duration between min and max milliseconds
 */
export function sleep(min = 300, max = 900) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * Create a new browser context with anti-bot measures
 */
export async function newContext(browser, tld = 'com') {
  const context = await browser.newContext({
    userAgent: pickUA(),
    viewport: { width: 1920, height: 1080 },
    locale: tld === 'com' ? 'en-US' : tld === 'co.uk' ? 'en-GB' : 'en-IN',
    extraHTTPHeaders: {
      'Accept-Language': tld === 'com' ? 'en-US,en;q=0.9' : 
                        tld === 'co.uk' ? 'en-GB,en;q=0.9' : 
                        'en-IN,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  });

  // Add stealth measures
  await context.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  return context;
}

/**
 * Extract TLD from URL for proper domain handling
 */
export function extractTLD(url) {
  try {
    const hostname = new URL(url).hostname;
    const match = hostname.match(/amazon\.([^.]+)/);
    return match ? match[1] : 'com';
  } catch {
    return 'com';
  }
}

/**
 * Build Amazon base URL from TLD
 */
export function buildAmazonBase(tld) {
  return `https://www.amazon.${tld}`;
}
