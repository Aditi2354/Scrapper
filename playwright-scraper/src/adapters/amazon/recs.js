import pLimit from 'p-limit';
import { newContext, sleep } from '../../utils/recs/antibot.js';
import { PDP, SEARCH } from './selectors.js';
import { cleanText, tokenize, parseRating, toNumberPrice } from '../../utils/recs/text-utils.js';
import { rankAndDedupe, extractASIN, scoreCandidate } from '../../utils/recs/ranker.js';
import { computeBuckets, splitByBuckets } from '../../utils/recs/price-buckets.js';

const ENRICH_CONCURRENCY = 3;

export async function getAmazonRecommendations(inputUrl, { limit = 15 } = {}){
  const lim = Math.max(10, Math.min(15, Number(limit) || 12));
  const base = baseFromUrl(inputUrl);

  const { browser, context } = await newContext({ acceptLanguage: 'en-US,en;q=0.9', locale: 'en-US', timezoneId: 'UTC' });
  try {
    const page = await context.newPage();
    const seed = await readSeed(page, inputUrl);
    await sleep(randBetween(300, 900));

    const titleTokens = tokenize(seed.productName || seed.product_title || '');
    const topTokens = titleTokens.slice(0, Math.max(4, Math.min(6, titleTokens.length)));
    const q1 = [seed.brand, ...topTokens].filter(Boolean).join(' ');
    const q2 = topTokens.join(' ');

    const [c1, c2] = await Promise.all([
      collectFromSearch(page, base, q1, 36),
      (async () => { await sleep(randBetween(300, 900)); return collectFromSearch(page, base, q2, 36); })()
    ]);

    const merged = [...c1, ...c2];
    const ranked = rankAndDedupe(
      seed,
      merged,
      { excludeAsin: seed.asin, limit: lim * 4 }
    );

    // Enrichment pass
    const topForEnrich = ranked.slice(0, Math.min(15, ranked.length));
    const enriched = await enrichMissing(context, topForEnrich);

    const buckets = computeBuckets(enriched);
    const bucketGroups = splitByBuckets(enriched, buckets);

    // Groups
    const topRated = [...enriched]
      .filter(x => x.rating != null)
      .sort((a,b) => (b.rating || 0) - (a.rating || 0) || (b.ratingCount || 0) - (a.ratingCount || 0))
      .slice(0, Math.min(5, lim));

    const featureMatch = [...enriched]
      .map(it => ({ it, s: scoreCandidate(seed, it) }))
      .sort((a,b) => b.s - a.s)
      .map(x => x.it)
      .slice(0, Math.min(5, lim));

    const flat = enriched.slice(0, lim);

    return {
      site: 'amazon',
      inputUrl,
      seed: {
        productName: seed.productName,
        brand: seed.brand,
        price: seed.price,
        rating: seed.rating,
        ratingCount: seed.ratingCount,
        features: seed.features || [],
        productImage: seed.productImage,
        asin: seed.asin
      },
      groups: {
        topRated,
        featureMatch,
        budget: bucketGroups.budget,
        midRange: bucketGroups.midRange,
        premium: bucketGroups.premium
      },
      flat
    };
  } catch (e) {
    return { error: 'amazon_recs_failed', detail: e.message };
  } finally {
    await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}

/* ===================== Seed ===================== */
export async function readSeed(page, url){
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(()=>{});

  const title = await pickText(page, PDP.title);
  const brandRaw = await pickText(page, PDP.brand);

  const priceText = await pickPriceStrict(page, PDP.priceStrict);
  const ratingRaw = await pickText(page, PDP.rating);
  const ratingCountRaw = await pickText(page, PDP.ratingCount);
  let image = await pickAttr(page, PDP.image, ['src','data-old-hires','data-src','srcset','data-a-dynamic-image']);

  // JSON-LD fallback
  const ld = await extractProductLDJSON(page);
  const offers = ld?.offers || {};
  const agg = ld?.aggregateRating || {};

  const price = toNumberPrice(priceText ?? offers.price ?? offers.priceSpecification?.price ?? null);
  const rating = parseRating(ratingRaw ?? agg.ratingValue ?? null);
  const ratingCount = ratingCountRaw != null
    ? numberOnly(ratingCountRaw)
    : numberOnly(agg.reviewCount ?? agg.ratingCount ?? null);

  if (!image) {
    const dyn = await page.locator('#landingImage').first().getAttribute('data-a-dynamic-image').catch(()=>null);
    if (dyn) { try { image = Object.keys(JSON.parse(dyn))[0]; } catch {} }
  }

  const asin = extractASIN(url);
  const features = await page.$$eval(PDP.features.join(','), els => els.map(e => (e.textContent||'').trim()).filter(Boolean)).catch(()=>[]);

  return {
    productName: cleanText(title),
    brand: cleanText(brandRaw || ld?.brand?.name || ld?.brand || '' ) || null,
    price,
    rating,
    ratingCount,
    features: features.map(s => s.replace(/\s+/g,' ').trim()).slice(0, 10),
    productImage: image || ld?.image || null,
    asin
  };
}

/* ===================== Search ===================== */
export async function collectFromSearch(page, base, query, limit = 36){
  const results = [];
  const searchUrl = `${base}/s?k=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(()=>{});

  const cards = page.locator(SEARCH.card);
  const n = await cards.count();
  for (let i = 0; i < n && results.length < limit; i++){
    const c = cards.nth(i);
    const asin = await c.getAttribute('data-asin').catch(()=>null);
    const isSponsored = await c.locator(SEARCH.sponsored).count().catch(()=>0);
    if (!asin || isSponsored) continue;

    const title = await c.locator(SEARCH.title).first().textContent().catch(()=>null);
    const href  = await c.locator(SEARCH.href).first().getAttribute('href').catch(()=>null);
    if (!title || !href) continue;

    const url = new URL(href, base).href;
    const image = await pickAttrFrom(c, [SEARCH.img], ['src','data-src','srcset']).catch(()=>null);
    const priceText = await pickPriceStrictFrom(c, SEARCH.price).catch(()=>null);
    const ratingText = await c.locator(SEARCH.rating).first().textContent().catch(()=>null);
    const ratingCountText = await c.locator(SEARCH.ratingCount).first().textContent().catch(()=>null);

    results.push({
      productName: cleanText(title),
      productUrl: url,
      productImage: image || null,
      price: toNumberPrice(priceText),
      rating: parseRating(ratingText),
      ratingCount: numberOnly(ratingCountText),
      asin
    });
  }

  return results;
}

/* ===================== Enrichment ===================== */
async function enrichMissing(context, items){
  const lim = pLimit(ENRICH_CONCURRENCY);
  const filled = await Promise.all(items.map(it => lim(async () => {
    if (it.price != null && it.productImage && it.rating != null && it.ratingCount != null) return it;
    const page = await context.newPage();
    try {
      await page.goto(it.productUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(()=>{});

      const ld = await extractProductLDJSON(page);
      const offers = ld?.offers || {};
      const agg = ld?.aggregateRating || {};

      const priceText = await pickPriceStrict(page, PDP.priceStrict);
      const img = await pickAttr(page, PDP.image, ['src','data-old-hires','data-src','srcset','data-a-dynamic-image']);
      const ratingRaw = await pickText(page, PDP.rating);
      const ratingCountRaw = await pickText(page, PDP.ratingCount);

      return {
        ...it,
        price: it.price ?? toNumberPrice(priceText ?? offers.price ?? offers.priceSpecification?.price ?? null),
        productImage: it.productImage ?? img ?? ld?.image ?? null,
        rating: it.rating ?? parseRating(ratingRaw ?? agg.ratingValue ?? null),
        ratingCount: it.ratingCount ?? numberOnly(ratingCountRaw ?? agg.reviewCount ?? agg.ratingCount ?? null),
      };
    } catch {
      return it;
    } finally {
      await page.close().catch(()=>{});
      await sleep(randBetween(300, 900));
    }
  })));
  return filled;
}

/* ===================== Helpers ===================== */
function baseFromUrl(u){
  try {
    const url = new URL(u);
    const host = url.hostname; // e.g., www.amazon.co.uk
    const m = host.match(/amazon\.(.+)$/i);
    const tld = m ? m[1] : 'com';
    return `https://www.amazon.${tld}`;
  } catch {
    return 'https://www.amazon.com';
  }
}

function numberOnly(s){
  if (s == null) return null;
  const m = String(s).replace(/[^0-9]/g,'');
  return m ? Number(m) : null;
}

async function extractProductLDJSON(page){
  try {
    const scripts = await page.$$eval(PDP.ldjson, ns => ns.map(n => n.textContent || ''));
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.trim());
        const arr = Array.isArray(json) ? json : [json];
        for (const obj of arr) if (obj['@type'] === 'Product') return obj;
      } catch {}
    }
  } catch {}
  return null;
}

async function pickText(page, selectors){
  for (const sel of selectors){
    const el = page.locator(sel).first();
    if (await el.count()){
      const t = await el.textContent().catch(()=>null);
      if (t) return cleanText(t);
    }
  }
  return null;
}

async function pickAttr(page, sels, attrs){
  for (const sel of sels){
    const el = page.locator(sel).first();
    if (await el.count()){
      for (const a of attrs){
        const v = await el.getAttribute(a).catch(()=>null);
        const parsed = parseAttrValue(a, v);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

async function pickAttrFrom(locator, sels, attrs){
  for (const sel of sels){
    const el = locator.locator(sel).first();
    if (await el.count()){
      for (const a of attrs){
        const v = await el.getAttribute(a).catch(()=>null);
        const parsed = parseAttrValue(a, v);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

async function pickPriceStrict(page, sels){
  for (const sel of sels) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      const txt = cleanText(await el.textContent().catch(()=>'')) || '';
      if (looksLikePrice(txt)) return txt;
    }
  }
  return null;
}

async function pickPriceStrictFrom(locator, sels){
  for (const sel of sels) {
    const el = locator.locator(sel).first();
    if (await el.count()) {
      const txt = cleanText(await el.textContent().catch(()=>'')) || '';
      if (looksLikePrice(txt)) return txt;
    }
  }
  return null;
}

function parseAttrValue(attr, v){
  if (!v) return null;
  if (attr.includes('srcset')){
    const first = String(v).split(',')[0]?.trim().split(' ')[0];
    return first || null;
  }
  if (attr === 'data-a-dynamic-image'){
    try { return Object.keys(JSON.parse(v))[0] || null; } catch { return null; }
  }
  return v;
}

function looksLikePrice(t){
  if (!t) return false;
  const s = t.toLowerCase();
  if (/(emi|saving|savings|save|coupon|bank|m\.?r\.?p|exchange|without exchange|with exchange|offer|discount)/.test(s)) return false;
  return /[\₹$€£]\s*\d/.test(s) || /\d[\d,]*\.\d{2}/.test(s) || /\d[\d,]{4,}/.test(s);
}

function randBetween(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
