// src/adapters/amazon/recs.js
import pLimit from 'p-limit';
import { sleep, newContext } from '../../utils/recs/antibot.js';
import { cleanText, tokenize, parseRating, parseInlinePrice, toNumberPrice } from '../../utils/recs/text-utils.js';
import { scoreCandidate, dedupe } from '../../utils/recs/ranker.js';
import { bucketizeByPrice } from '../../utils/recs/price-buckets.js';
import { PDP_SELECTORS, SEARCH_SELECTORS } from './selectors.js';

const ENRICH_CONCURRENCY = 3;

export async function getAmazonRecommendations({ url, limit = 15 }) {
  const inputUrl = url;
  const base = deriveAmazonBase(url);

  const { context, browser } = await newContext({ headless: true, acceptLanguage: 'en-US,en;q=0.9' });
  try {
    const page = await context.newPage();
    const seed = await readSeed(page, url, base);

    const queries = buildQueries(seed);
    const searchPage = await context.newPage();
    const all = [];
    for (const q of queries) {
      const results = await collectFromSearch(searchPage, base, q, 36);
      all.push(...results);
      await sleep(300 + Math.floor(Math.random() * 600));
    }
    await searchPage.close();

    // Merge + dedupe
    const merged = dedupe(all, it => it.asin || it.productUrl);
    const filtered = merged.filter(it => it.asin && it.asin !== seed.asin);

    // Score
    const scored = filtered.map(c => ({
      ...c,
      _score: scoreCandidate(seed, c)
    })).sort((a,b) => b._score - a._score);

    // Enrich top N
    const topN = scored.slice(0, Math.max(15, limit));
    const lim = pLimit(ENRICH_CONCURRENCY);
    const enriched = await Promise.all(topN.map(c => lim(() => enrichCandidate(context, base, c))));

    // Build groups
    const flat = enriched.map(stripScore).slice(0, limit);
    const topRated = [...enriched]
      .filter(x => Number.isFinite(x.rating))
      .sort((a,b) => (b.rating || 0) - (a.rating || 0) || (b.ratingCount||0) - (a.ratingCount||0))
      .map(stripScore)
      .slice(0, Math.min(5, limit));

    const seedTokens = new Set(tokenize(seed.productName || ''));
    const featureMatch = [...enriched]
      .map(x => ({
        item: x,
        rel: jaccard(seedTokens, new Set(tokenize(x.productName || '')))
      }))
      .sort((a,b) => b.rel - a.rel)
      .map(x => stripScore(x.item))
      .slice(0, Math.min(5, limit));

    const { budget, midRange, premium } = bucketizeByPrice(flat);

    return {
      site: 'amazon',
      inputUrl,
      seed: {
        productName: seed.productName,
        brand: seed.brand || null,
        price: seed.price ?? null,
        rating: seed.rating ?? null,
        ratingCount: seed.ratingCount ?? null,
        features: seed.features || [],
        productImage: seed.productImage || null,
        asin: seed.asin || null,
      },
      groups: {
        topRated,
        featureMatch,
        budget,
        midRange,
        premium,
      },
      flat,
    };
  } finally {
    await context.close().catch(()=>{});
    await browser?.close().catch(()=>{});
  }
}

/* ======================== internals ======================== */

function deriveAmazonBase(u) {
  const { hostname } = new URL(u);
  const m = hostname.match(/amazon\.(.+)$/i);
  const tld = m ? m[1] : 'com';
  return `https://www.amazon.${tld}`;
}

async function readSeed(page, url, base) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(()=>{});
  await sleep(300 + Math.floor(Math.random() * 600));

  const title = await pickText(page, PDP_SELECTORS.title);
  const brandRaw = await pickText(page, PDP_SELECTORS.brand);

  const priceText = await pickPriceStrict(page, PDP_SELECTORS.priceStrict);
  const ratingText = await pickText(page, PDP_SELECTORS.rating);
  const ratingCountText = await pickText(page, PDP_SELECTORS.ratingCount);
  let image = await pickAttr(page, PDP_SELECTORS.image, ['src','data-old-hires','data-src','srcset','data-a-dynamic-image']);

  const asin = extractASIN(url) || await extractASINFromDOM(page) || null;

  // JSON-LD fallback
  const ld = await extractProductLDJSON(page).catch(()=>null);
  const agg = ld?.aggregateRating || {};
  const offers = ld?.offers || {};

  const price = toNumberPrice(priceText ?? offers.price ?? offers.priceSpecification?.price);
  const rating = parseRating(ratingText ?? agg.ratingValue);
  const ratingCount = parseCount(ratingCountText ?? agg.reviewCount ?? agg.ratingCount);

  if (!image) {
    const dyn = await page.locator('#landingImage').first().getAttribute('data-a-dynamic-image').catch(()=>null);
    if (dyn) { try { image = Object.keys(JSON.parse(dyn))[0]; } catch {} }
  }

  const features = await page.$$eval('#feature-bullets li', els =>
    els.map(e => (e.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean)
  ).catch(()=>[]);

  return {
    productName: cleanText(title),
    brand: normalizeBrand(brandRaw),
    price,
    rating,
    ratingCount,
    features,
    productImage: image || null,
    asin,
  };
}

function buildQueries(seed){
  const tokens = tokenize(seed.productName || '', { limit: 8 });
  const brand = (seed.brand || '').trim();
  const topTokens = tokens.slice(0, 6);
  const q1 = cleanText([brand, ...topTokens.slice(0, 6)].filter(Boolean).join(' '));
  const q2 = cleanText(topTokens.join(' '));
  return [q1, q2].filter(Boolean);
}

async function collectFromSearch(page, base, query, limit = 36) {
  const url = `${base}/s?k=${encodeURIComponent(query)}&s=review-rank`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(()=>{});
  await sleep(300 + Math.floor(Math.random() * 600));

  const cards = page.locator(SEARCH_SELECTORS.card);
  const n = await cards.count();
  const out = [];

  for (let i = 0; i < n && out.length < limit; i++) {
    const c = cards.nth(i);
    const asin = (await c.getAttribute('data-asin').catch(()=>null)) || null;
    if (!asin) continue;

    const isSponsored = await c.locator('[aria-label="Sponsored"], [data-component-type="sp-sponsored-result"], .s-label-popover-default').count().catch(()=>0);
    if (isSponsored) continue;

    const title = await c.locator(SEARCH_SELECTORS.title).first().textContent().catch(()=>null);
    const href  = await c.locator(SEARCH_SELECTORS.href).first().getAttribute('href').catch(()=>null);
    if (!title || !href) continue;

    const img   = await pickAttrFrom(c, [SEARCH_SELECTORS.image], ['src','data-src','srcset']);
    const priceText = await pickPriceStrictFrom(c, SEARCH_SELECTORS.priceCandidates);
    const ratingText = await c.locator(SEARCH_SELECTORS.rating).first().textContent().catch(()=>null);
    const ratingCountText = await c.locator(SEARCH_SELECTORS.ratingCount).first().textContent().catch(()=>null);

    out.push({
      productName: cleanText(title),
      productUrl: new URL(href, base).href,
      productImage: img || null,
      price: toNumberPrice(priceText),
      rating: parseRating(ratingText),
      ratingCount: parseCount(ratingCountText),
      asin: asin,
      features: [],
    });
  }
  return out;
}

async function enrichCandidate(context, base, c) {
  if (c.price && c.productImage && c.rating && c.ratingCount) return c;
  const page = await context.newPage();
  try {
    await page.goto(c.productUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded').catch(()=>{});
    await sleep(300 + Math.floor(Math.random() * 600));

    const priceText = await pickPriceStrict(page, PDP_SELECTORS.priceStrict);
    const ratingText = await pickText(page, PDP_SELECTORS.rating);
    const ratingCountText = await pickText(page, PDP_SELECTORS.ratingCount);
    let image = await pickAttr(page, PDP_SELECTORS.image, ['src','data-old-hires','data-src','srcset','data-a-dynamic-image']);

    const ld = await extractProductLDJSON(page).catch(()=>null);
    const agg = ld?.aggregateRating || {};
    const offers = ld?.offers || {};

    const price = c.price ?? toNumberPrice(priceText ?? offers.price ?? offers.priceSpecification?.price);
    const rating = c.rating ?? parseRating(ratingText ?? agg.ratingValue);
    const ratingCount = c.ratingCount ?? parseCount(ratingCountText ?? agg.reviewCount ?? agg.ratingCount);

    if (!image) {
      const dyn = await page.locator('#landingImage').first().getAttribute('data-a-dynamic-image').catch(()=>null);
      if (dyn) { try { image = Object.keys(JSON.parse(dyn))[0]; } catch {} }
    }

    return { ...c, price, rating, ratingCount, productImage: image || c.productImage };
  } catch {
    return c;
  } finally {
    await page.close().catch(()=>{});
  }
}

/* ========================= helpers ========================= */

function normalizeBrand(b) {
  const s = cleanText(b || '');
  if (!s) return null;
  // Remove trailing qualifiers like "Store"
  return s.replace(/(Visit the|Brand:|Store)$/i, '').replace(/\s+Store$/i, '').trim() || s;
}

function extractASIN(u) {
  const s = String(u);
  const m = s.match(/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i) || s.match(/\/([A-Z0-9]{10})(?:[\/?]|$)/i);
  return m ? m[1] : null;
}

async function extractASINFromDOM(page){
  try {
    const el = page.locator('#ASIN');
    if (await el.count()) return await el.getAttribute('value');
  } catch {}
  return null;
}

function parseCount(s){
  if (s == null) return null;
  const n = String(s).replace(/[^0-9]/g, '');
  return n ? parseInt(n, 10) : null;
}

async function extractProductLDJSON(page) {
  const scripts = await page.$$eval('script[type="application/ld+json"]', ns => ns.map(n => n.textContent || ''));
  for (const s of scripts) {
    try {
      const json = JSON.parse(s.trim());
      const arr = Array.isArray(json) ? json : [json];
      for (const obj of arr) if (obj['@type'] === 'Product') return obj;
    } catch {}
  }
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

async function pickAttr(page, selectors, attrs){
  for (const sel of selectors){
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

async function pickAttrFrom(locator, selectors, attrs){
  for (const sel of selectors){
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

async function pickPriceStrict(page, selectors){
  for (const sel of selectors){
    const el = page.locator(sel).first();
    if (await el.count()){
      const txt = cleanText(await el.textContent().catch(()=>'')) || '';
      if (looksLikePrice(txt)) return txt;
    }
  }
  return null;
}

async function pickPriceStrictFrom(locator, selectors){
  for (const sel of selectors){
    const el = locator.locator(sel).first();
    if (await el.count()){
      const txt = cleanText(await el.textContent().catch(()=>'')) || '';
      if (looksLikePrice(txt)) return txt;
    }
  }
  return null;
}

function looksLikePrice(t) {
  if (!t) return false;
  const s = t.toLowerCase();
  if (/(emi|saving|savings|save|coupon|bank|m\.?r\.?p|exchange|offer|discount)/.test(s)) return false;
  return /[\₹$€£]\s*\d/.test(s) || /\d[\d,]*\.\d{2}/.test(s) || /\d[\d,]{4,}/.test(s);
}

function stripScore(it){ const { _score, ...rest } = it; return rest; }

function jaccard(A, B){
  const a = new Set(A), b = new Set(B);
  const inter = [...a].filter(x => b.has(x)).length;
  const denom = Math.max(1, a.size + b.size - inter);
  return inter / denom;
}
