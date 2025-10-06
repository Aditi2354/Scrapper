// Anti-bot utilities for Amazon scraping
export function pickUA() {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

export function sleep(minMs = 300, maxMs = 900) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export async function newContext(browser, amazonUrl) {
  // Derive TLD from URL
  const hostname = new URL(amazonUrl).hostname;
  const tldMatch = hostname.match(/amazon\.([a-z\.]+)$/i);
  const tld = tldMatch ? tldMatch[1] : 'com';
  
  // Set appropriate locale based on TLD
  const localeMap = {
    'com': { locale: 'en-US', acceptLang: 'en-US,en;q=0.9' },
    'in': { locale: 'en-IN', acceptLang: 'en-IN,en;q=0.9,hi;q=0.8' },
    'co.uk': { locale: 'en-GB', acceptLang: 'en-GB,en;q=0.9' },
    'de': { locale: 'de-DE', acceptLang: 'de-DE,de;q=0.9,en;q=0.8' },
    'fr': { locale: 'fr-FR', acceptLang: 'fr-FR,fr;q=0.9,en;q=0.8' },
    'it': { locale: 'it-IT', acceptLang: 'it-IT,it;q=0.9,en;q=0.8' },
    'es': { locale: 'es-ES', acceptLang: 'es-ES,es;q=0.9,en;q=0.8' }
  };
  
  const { locale, acceptLang } = localeMap[tld] || localeMap['com'];
  
  const context = await browser.newContext({
    userAgent: pickUA(),
    viewport: { width: 1366, height: 768 },
    locale,
    timezoneId: 'America/New_York',
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    extraHTTPHeaders: { 
      'Accept-Language': acceptLang,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
  });

  // Hide automation signals
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
    } catch {}
  });

  // Block unnecessary resources
  await context.route('**/*', route => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url();

    const blockedTypes = ['font', 'media', 'eventsource', 'websocket'];
    const blockedHosts = [
      'googletagmanager.com',
      'google-analytics.com', 
      'doubleclick.net',
      'facebook.net',
      'hotjar.com',
      'segment.io',
      'braze.com'
    ];

    if (blockedTypes.includes(type)) return route.abort();
    if (blockedHosts.some(host => url.includes(host))) return route.abort();

    return route.continue();
  });

  return context;
}