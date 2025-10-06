import { cleanText, toFloat } from '../utils/normalize.js';
import { waitDomSettled, autoScroll } from '../utils/browser.js';

export function match(u) { return /(^|\.)amazon\.(in|com|co\.uk|de|fr|it|es)/i.test(u.hostname); }
export const id = 'amazon';

/* ===================== PRODUCT (seed) ===================== */
export async function extractProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitDomSettled(page);

  const title = await pickText(page, ['#productTitle','h1#title span','#titleSection #title']);

  // 1) Try to read ONLY inside core price containers
  let priceText = await extractCorePriceText(page);
  // 2) Meta fallback (Amazon often puts correct price here)
  if (!priceText) {
    const meta = await page.locator('meta[name="twitter:data1"]').getAttribute('content').catch(()=>null);
    if (looksLikePrice(meta)) priceText = meta;
  }

  const ratingRaw = await pickText(page, ['#acrPopover .a-icon-alt','span[data-hook="rating-out-of-text"]','i[data-hook="average-star-rating"] span']);
  const ratingCountRaw = await pickText(page, ['#acrCustomerReviewText','span[data-hook="total-review-count"]','#acrCustomerReviewText .a-size-base']);

  let image = await pickAttr(page,
    ['#imgTagWrapperId img','#landingImage','.imageThumb img','#imageBlock img'],
    ['src','data-old-hires','data-src','srcset','data-a-dynamic-image']
  );

  // LD+JSON fallback (extra safety)
  const ld = await extractProductLDJSON(page);
  const offers = ld?.offers || {};
  const agg = ld?.aggregateRating || {};

  let price = money(priceText ?? offers.price ?? offers.priceSpecification?.price);
  const rating = numberFromText(ratingRaw ?? agg.ratingValue);
  const rating_count = intFromText(ratingCountRaw ?? agg.reviewCount ?? agg.ratingCount);

  if (!image) {
    const dyn = await page.locator('#landingImage').first().getAttribute('data-a-dynamic-image').catch(()=>null);
    if (dyn) { try { image = Object.keys(JSON.parse(dyn))[0]; } catch {} }
  }

  // 3) Mobile page fallback (bahut reliable)
  if (price == null) {
    const asin = extractASIN(url);
    if (asin) {
      const mUrl = `https://www.amazon.in/gp/aw/d/${asin}`;
      await page.goto(mUrl, { waitUntil: 'domcontentloaded' });
      await waitDomSettled(page);

      const mPriceText = await pickPriceStrict(page, [
        '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
        '#corePrice_feature_div .a-price .a-offscreen',
        '#priceblock_dealprice',
        '#priceblock_ourprice',
        'span.a-color-price'
      ]);
      if (mPriceText) price = money(mPriceText);

      if (!image) image = await pickAttr(page, ['#main-image-container img','img#ivLargeImage','img'], ['src','data-src','srcset']);

      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(()=>{});
    }
  }

  return {
    product_title: cleanText(title),
    product_name: deriveName(title),
    product_url: page.url().split('?')[0],
    product_image: image,
    price,
    rating,
    rating_count,
    sellers_info: await extractSeller(page)
  };
}

/* ===================== RECOMMENDATIONS ===================== */
export async function searchSimilar(page, seed, { limit = 12, pages = 1 } = {}) {
  const query = encodeURIComponent(seed.product_name || seed.product_title || '');
  const base = `https://www.amazon.in/s?k=${query}`;
  const raw = [];

  for (let p=1; p<=pages; p++) {
    const url = `${base}&page=${p}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitDomSettled(page);
    await autoScroll(page);

    // Prefer proper result cards, skip sponsored
    const cards = page.locator('[data-component-type="s-search-result"].s-result-item, .s-result-item[data-asin]');
    const n = await cards.count();

    for (let i=0; i<n && raw.length < limit * 4; i++) {
      const c = cards.nth(i);

      const asin = await c.getAttribute('data-asin').catch(()=>null);
      const isSponsored = await c.locator('[aria-label="Sponsored"], [data-component-type="sp-sponsored-result"]').count().catch(()=>0);
      if (!asin || isSponsored) continue;

      const title = await c.locator('h2 a span, h5 a span').first().textContent().catch(()=>null);
      const href  = await c.locator('h2 a, h5 a, a.a-link-normal.s-no-outline').first().getAttribute('href').catch(()=>null);

      const img   = await pickAttrFrom(c, ['img.s-image','img'], ['src','data-src','srcset']);
      const priceText = await pickPriceStrictFrom(c, [
        '.a-price[data-a-color="price"] .a-offscreen',
        '.a-price .a-offscreen',
        '.a-color-price'
      ]);
      const ratingText = await c.locator('i.a-icon-star-small span.a-icon-alt, i.a-icon-star span.a-icon-alt').first().textContent().catch(()=>null);
      const ratingCountText = await c.locator('[aria-label$="ratings"], .s-link-style .s-underline-text, [aria-label$="rating"]').first().textContent().catch(()=>null);

      if (!href || !title) continue;

      raw.push({
        title: cleanText(title),
        url: new URL(href, 'https://www.amazon.in').href,
        image: img || null,
        price: money(priceText),
        rating: numberFromText(ratingText),
        rating_count: intFromText(ratingCountText),
        source: 'amazon'
      });
    }
  }

  const seedKW = keywords(seed.product_name || seed.product_title || '');
  const seedPrice = seed.price ?? null;

  const ranked = raw
    .map(it => {
      const sim = jaccard(seedKW, keywords(it.title || ''));
      const ratingBoost = (it.rating || 0) / 5 * 0.35;
      let priceBoost = 0;
      if (seedPrice && it.price) {
        const diff = Math.abs(it.price - seedPrice) / seedPrice;
        priceBoost = diff <= 0.30 ? (0.35 - diff) : 0;
      }
      return { ...it, _score: sim + ratingBoost + priceBoost };
    })
    .sort((a,b) => b._score - a._score)
    .filter(dedupeByUrl())
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);

  return ranked;
}

/* ===================== helpers ===================== */

// --- Price extract only from core container
async function extractCorePriceText(page) {
  // Try most specific first
  const strict = await pickPriceStrict(page, [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen'
  ]);
  if (strict) return strict;

  // Fallback: ANY .a-price INSIDE the core containers (filtering noise)
  const containers = [
    '#corePriceDisplay_desktop_feature_div',
    '#apex_desktop',
    '#corePrice_feature_div'
  ];
  for (const c of containers) {
    try {
      const texts = await page.$$eval(`${c} .a-price .a-offscreen`, els => els.map(e => (e.textContent||'').trim()));
      const cleaned = texts.filter(t => looksLikePrice(t));
      // Prefer the first occurrence (usually the deal price).
      if (cleaned.length) return cleaned[0];
    } catch {}
  }
  return null;
}

function extractASIN(u) {
  const s = String(u);
  const m = s.match(/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i) || s.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m ? m[1] : null;
}

function deriveName(title){ if(!title) return null; return cleanText(title.split('|')[0].split('(')[0]); }
function numberFromText(s){ if (s==null) return null; const m=String(s).match(/([0-9]+(\.[0-9]+)?)/); return m?parseFloat(m[1]):null; }
function intFromText(s){ if (s==null) return null; const m=String(s).replace(/[,\.]/g,'').match(/\d{1,9}/); return m?parseInt(m[0],10):null; }
function money(s){ const n = toFloat(s); return n==null ? null : n; }

function looksLikePrice(t) {
  if (!t) return false;
  const s = t.toLowerCase();
  // ✨ broader filters to avoid wrong amounts
  if (/(emi|saving|savings|save|coupon|bank|m\.?r\.?p|exchange|without exchange|with exchange|offer|discount)/.test(s)) return false;
  return /[\₹$€£]\s*\d/.test(s) || /\d[\d,]*\.\d{2}/.test(s) || /\d[\d,]{4,}/.test(s);
}

async function pickPriceStrict(page, sels) {
  for (const sel of sels) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      const txt = cleanText(await el.textContent().catch(()=>'')) || '';
      if (looksLikePrice(txt)) return txt;
    }
  }
  return null;
}
async function pickPriceStrictFrom(locator, sels) {
  for (const sel of sels) {
    const el = locator.locator(sel).first();
    if (await el.count()) {
      const txt = cleanText(await el.textContent().catch(()=>'')) || '';
      if (looksLikePrice(txt)) return txt;
    }
  }
  return null;
}

async function extractSeller(page){
  const name = await pickText(page, ['#sellerProfileTriggerId', '#tabular-buybox .tabular-buybox-text a']);
  const linkRaw = await page.locator('#sellerProfileTriggerId, #tabular-buybox .tabular-buybox-text a').first().getAttribute('href').catch(()=>null);
  const link = linkRaw ? new URL(linkRaw, 'https://www.amazon.in').href : null;
  return name ? [{ name, link }] : [];
}

async function extractProductLDJSON(page){
  try {
    const scripts = await page.$$eval('script[type="application/ld+json"]', ns => ns.map(n => n.textContent || ''));
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

async function pickText(page, sels){
  for (const sel of sels){
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

/* ---- ranking helpers ---- */
function dedupeByUrl(){ const seen=new Set(); return x=>{ if(!x.url||seen.has(x.url)) return false; seen.add(x.url); return true; }; }
function keywords(str){
  const stop = new Set(['the','a','an','for','and','or','of','to','in','on','with','by','from','plus','pro','max','mini','new','gb','tb','ram','rom','phone','mobile','smartphone','official','store','lifetime','warranty']);
  return (str||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w && !stop.has(w));
}
function jaccard(aArr, bArr){
  const A=new Set(aArr),B=new Set(bArr); const inter=[...A].filter(x=>B.has(x)).length;
  const denom=Math.max(1,A.size+B.size-inter); return inter/denom;
}
