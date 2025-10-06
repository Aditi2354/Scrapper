// src/adapters/trendyol.js
import { cleanText, toFloat } from '../utils/normalize.js';
import { waitDomSettled, autoScroll } from '../utils/browser.js';

export const id = 'trendyol';
export function match(u) { return /(^|\.)trendyol\.com$/i.test(u.hostname); }

/* ===================== PRODUCT (seed) ===================== */
export async function extractProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitDomSettled(page);
  await acceptConsent(page);

  // reviews tab की चीजें अक्सर lazy होती हैं — पहले से खोलकर रखते हैं
  await openReviewsIfAvailable(page).catch(()=>{});

  // हल्का scroll ताकि hero img/srcset resolve हो जाए
  try { await page.evaluate(() => window.scrollTo(0, 140)); } catch {}
  try { await page.waitForTimeout(250); } catch {}

  // ---- TITLE
  let productTitle =
    await pickText(page, ['h1[data-testid="product-name"]','h1.pr-new-br span','h1.pr-new-br']) ||
    await pickMeta(page, 'meta[property="og:title"]') ||
    await page.title().catch(() => null);
  productTitle = cleanTitle(productTitle);

  // ---- IMAGE
  let image =
    await pickImage(page, [
      'img[data-testid="product-detail-main-image"]',
      '.base-product-image img',
      '.detail-section img'
    ]) || await pickMeta(page, 'meta[property="og:image"]');

  // ---- PRICE (as Turkish text)
  let priceText = await pickText(page, [
    '[data-testid="price-current-price"]',
    '.pr-bx-w .prc-dsc',
    '.product-price-container .prc-org',
    '.prc-dscntd', '.prc-sllng', '.prc-orgnl',
    '[itemprop="price"]',
    'meta[itemprop="price"][content]',
    '[data-price]'
  ]);

  // meta[itemprop=price] numeric → TR text
  if (!looksLikePrice(priceText)) {
    const metaPrice = await pickMeta(page, 'meta[itemprop="price"]');
    if (metaPrice && /\d/.test(metaPrice)) priceText = formatTRY(numberTR(metaPrice));
  }

  // Embedded JSON (NEXT / preloaded state) → numeric → TR text
  if (!looksLikePrice(priceText)) {
    const anyJSON = (await readNextData(page)) || (await readPreloadedState(page)) || (await readAnyJSONScript(page));
    const num =
      firstNumber(findAny(anyJSON, ['sellingPrice','discountedPrice','price','marketPrice','listPrice','promotionPrice','originalPrice','currentPrice']))
      ?? firstNumber(anyJSON?.offers?.price);
    if (num != null) priceText = formatTRY(num);
  }

  // last resort: body regex with TL/₺ (age text से बचें)
  if (!looksLikePrice(priceText)) {
    priceText = await findPriceInBody(page);
  }
  priceText = normalizeTRY(priceText);

  // ---- RATING + COUNT (first try: visible DOM near reviews)
  let ratingText = await pickText(page, [
    '[data-testid="rating-score"]',
    '.rating-score',
    '[itemprop="ratingValue"]',
    'meta[itemprop="ratingValue"][content]',
    '[data-test-id="average-rating"]',
    '.rating-average, .average-rating'
  ]);

  let ratingCountText = await pickText(page, [
    '[data-testid="review-count"]',
    '.rating-count',
    '.rvw-cnt',
    '[itemprop="reviewCount"]',
    'meta[itemprop="reviewCount"][content]'
  ]);

  // open reviews if not found yet (lazy panels)
  if (!ratingText || !ratingCountText) {
    await openReviewsIfAvailable(page).catch(()=>{});
    if (!ratingText) {
      ratingText = await pickText(page, [
        '[data-testid="rating-score"]',
        '.rating-score',
        '[itemprop="ratingValue"]',
        'meta[itemprop="ratingValue"][content]',
        '[data-test-id="average-rating"]',
        '.rating-average, .average-rating'
      ]);
    }
    if (!ratingCountText) {
      ratingCountText = await pickText(page, [
        '[data-testid="review-count"]',
        '.rating-count',
        '.rvw-cnt',
        '[itemprop="reviewCount"]',
        'meta[itemprop="reviewCount"][content]'
      ]);
    }
  }

  // final body fallbacks (context-aware)
  if (!ratingText) {
    // only if looks like rating: "/ 5" or "puan"
    ratingText = await findFirstInBody(page, /([0-5](?:[.,]\d)?)\s*(?:\/\s*5|puan)/i, 1);
  }
  if (!ratingCountText) {
    // number near değerlendirme/yorum/oy
    ratingCountText = await findFirstInBody(page, /\b(\d{1,6})\b(?=.*?(değerlendirme|yorum|oy))/i, 1);
  }

  // ---- SELLER
  let sellerName = await pickText(page, [
    '[data-testid="store-name"]',
    '.merchant-name',
    '.seller-container a',
    'a[href*="/magaza/"]'
  ]);
  let sellerHref =
    await pickHref(page, [
      '[data-testid="store-name"] a',
      '.merchant-name a',
      '.seller-container a',
      'a[href*="/magaza/"]'
    ]);
  sellerHref = sellerHref ? abs('https://www.trendyol.com', sellerHref) : null;

  // अगर placeholder link '/magaza/x-m-<id>' मिला और name मौजूद है → canonical बनाओ
  if (sellerHref && /\/magaza\/x-m-(\d+)/i.test(sellerHref) && sellerName) {
    const id = sellerHref.match(/\/magaza\/x-m-(\d+)/i)?.[1];
    if (id) sellerHref = `https://www.trendyol.com/magaza/${slugifyTR(sellerName)}-m-${id}`;
  }

  // Fallback seller via JSON
  if (!sellerName || !sellerHref) {
    const anyJSON = (await readNextData(page)) || (await readPreloadedState(page)) || (await readAnyJSONScript(page));
    const merch = findAny(anyJSON, ['merchant','seller','store']);
    const name  = merch?.name || merch?.merchantName || merch?.sellerName;
    const id    = merch?.id || merch?.merchantId || merch?.sellerId;
    const slug  = merch?.slug || (name ? slugifyTR(name) : null);
    const url   = merch?.url || merch?.storeUrl || (slug && id ? `/magaza/${slug}-m-${id}` : null);
    if (!sellerName && name) sellerName = cleanText(name);
    if (!sellerHref && url)  sellerHref = abs('https://www.trendyol.com', url);
  }

  return {
    product_title: productTitle || null,
    product_name: deriveName(productTitle) || null,
    product_url: page.url().split('?')[0],
    product_image: image || null,
    price: priceText || null,                 // e.g. "261,45 TL"
    rating: toRating(ratingText),             // 0..5 or null
    rating_count: toInt(ratingCountText),     // integer or null
    sellers_info: sellerName ? [{ name: sellerName, link: sellerHref || null }] : []
  };
}

/* ===================== SEARCH / RECO ===================== */
export async function searchSimilar(page, seed, { limit = 12, pages = 1 } = {}) {
  const q = encodeURIComponent(seed.product_name || seed.product_title || '');
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const url = `https://www.trendyol.com/sr?q=${q}&pi=${p}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitDomSettled(page);
    await acceptConsent(page);
    await autoScroll(page, { maxSteps: 4 });

    const cards = page.locator('[data-testid="product-card"], .prdct-cntnr-wrppr .p-card-wrppr');
    const n = await cards.count().catch(() => 0);
    for (let i = 0; i < n && out.length < limit * 3; i++) {
      const c = cards.nth(i);
      const title = cleanText(await c.locator('[data-testid="product-card-name"], .prdct-desc-cntnr-ttl').first().textContent().catch(()=>null) || '');
      const href  = await c.getAttribute('href').catch(()=>null);
      if (!href || !title) continue;

      let priceText = await c
        .locator('[data-testid="price-current-price"], .prc-box-dscntd, .prc-box-sllng, .prc-box-orgnl, .prc-box')
        .first().textContent().catch(()=>null);
      priceText = normalizeTRY(priceText);

      const ratingText = await c.locator('[data-testid="rating-score"], .rating-score').first().textContent().catch(()=>null);
      const ratingCountText = await c.locator('[data-testid="rating-count"], .rating-count, .rvw-cnt').first().textContent().catch(()=>null);

      out.push({
        title,
        url: abs('https://www.trendyol.com', href),
        image: null,
        price: priceText || null,
        rating: toRating(ratingText),
        rating_count: toInt(ratingCountText),
        source: 'trendyol'
      });
    }
  }

  const kw = kwds(seed.product_name || seed.product_title || '');
  const ranked = out.map(it => ({ ...it, _s: jacc(kw, kwds(it.title||'')) + (it.price?0.15:0) + (it.rating?0.1:0) }))
                    .sort((a,b)=>b._s - a._s);

  const seen = new Set(), items=[];
  for (const it of ranked) { if (seen.has(it.url)) continue; seen.add(it.url); items.push(strip(it)); if (items.length>=limit) break; }
  return items;
}

/* ===================== helpers ===================== */
async function acceptConsent(page){
  try {
    const btn = page.locator('#onetrust-accept-btn-handler, button#onetrust-accept-btn-handler, .onetrust-accept-btn-handler');
    if (await btn.count()) await btn.click({ timeout: 2000 }).catch(()=>{});
  } catch {}
}

// NEW: softly open reviews tab/panel if present
async function openReviewsIfAvailable(page){
  try {
    const btn = page.locator(
      '[data-testid="tab-panel-reviews"], [data-testid="reviews-tab"], a[href*="#yorum"], a[href*="#review"], a[href="#reviews"]'
    ).first();
    if (await btn.count()) {
      await btn.scrollIntoViewIfNeeded().catch(()=>{});
      await btn.click({ timeout: 1200 }).catch(()=>{});
      await page.waitForTimeout(400).catch(()=>{});
    }
  } catch {}
}

function cleanTitle(t){
  const s = cleanText(t || '');
  return s.replace(/\s*[-–]\s*(Fiyatı|Yorumları).*$/i, '').trim() || null;
}
function deriveName(t){ return cleanText((t||'').split('|')[0].split('(')[0]); }
function toRating(s){ const n = toFloat(s); return n==null?null:n; }
function toInt(s){ if (s==null) return null; const m=String(s).replace(/[^\d]/g,'').match(/\d{1,9}/); return m?parseInt(m[0],10):null; }

function looksLikePrice(s){ return !!(s && /(?:₺|\bTL\b)/i.test(s) && /\d/.test(s)); }
function normalizeTRY(s){
  if (!s) return null;
  const t = s.replace(/\s+/g,' ').trim();
  if (!/\bTL\b|₺/i.test(t) && /\d/.test(t)) return `${t} TL`;
  return t;
}
function formatTRY(num){
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })
      .format(num)
      .replace(/\s+/g,' ')
      .trim();
  } catch { return `${num} TL`; }
}
function numberTR(s){
  if (s == null) return null;
  const t = String(s).replace(/\./g,'').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/* ---------- DOM helpers ---------- */
async function pickText(page, sels){
  for (const sel of sels){
    const el = page.locator(sel).first();
    if (await el.count()){
      const t = await el.innerText().catch(()=>null);
      if (t && t.trim()) return cleanText(t);
    }
  }
  return null;
}
async function pickMeta(page, sel){
  try { return await page.locator(sel).getAttribute('content'); } catch { return null; }
}
async function pickHref(page, sels){
  for (const sel of sels){
    const el = page.locator(sel).first();
    if (await el.count()){
      const href = await el.getAttribute('href').catch(()=>null);
      if (href) return href;
    }
  }
  return null;
}
async function pickImage(page, sels){
  for (const sel of sels){
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    const current = await el.evaluate(e => (e && (e.currentSrc || e.src || e.getAttribute('data-src') || e.getAttribute('srcset'))) || null).catch(()=>null);
    if (!current) continue;
    if (String(current).includes(',')) {
      const first = String(current).split(',')[0]?.trim().split(' ')[0];
      if (first) return first;
    }
    return current;
  }
  return null;
}

/* ---------- Body fallback helpers ---------- */
async function findPriceInBody(page){
  try {
    const t = (await page.evaluate(()=>document.body?.innerText||'')).replace(/\s+/g,' ');
    const m = t.match(/((?:₺|\bTL\b)\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*(?:TL|₺))/i);
    return m ? m[1] : null;
  } catch { return null; }
}
async function findFirstInBody(page, regex, groupIdx = 0){
  try {
    const t = (await page.evaluate(()=>document.body?.innerText||'')).replace(/\s+/g,' ');
    const m = t.match(regex);
    return m ? m[groupIdx] : null;
  } catch { return null; }
}

/* ---------- Embedded JSON readers ---------- */
async function readLDProduct(page){
  try {
    const arr = await page.$$eval('script[type="application/ld+json"]', ns => ns.map(n => n.textContent||''));
    for (const s of arr) {
      try {
        const j = JSON.parse(s.trim()); const list = Array.isArray(j)?j:[j];
        for (const o of list) if (o['@type']==='Product') return o;
      } catch {}
    }
  } catch {}
  return null;
}
async function readNextData(page){
  try {
    const txt = await page.locator('#__NEXT_DATA__').textContent({ timeout: 6000 });
    return JSON.parse(txt || '{}');
  } catch { return null; }
}
async function readPreloadedState(page){
  try { return await page.evaluate(() => (window.__PRELOADED_STATE__ || null)); }
  catch { return null; }
}
async function readAnyJSONScript(page){
  try {
    const scripts = await page.$$eval('script:not([type]),script[type="application/json"]', ns => ns.map(n => n.textContent||''));
    for (const txt of scripts) {
      try { if (txt && txt.length >= 10) { const j = JSON.parse(txt); if (j && typeof j === 'object') return j; } }
      catch {}
    }
  } catch {}
  return null;
}

/* ---- deep search ---- */
function findAny(root, keys){
  if (!root) return null;
  const seen = new Set(); const stack = [root];
  while (stack.length){
    const obj = stack.pop();
    if (!obj || typeof obj !== 'object') continue;
    if (seen.has(obj)) continue; seen.add(obj);
    for (const k of Object.keys(obj)){
      const v = obj[k];
      if (keys.includes(k) && v != null && v !== '') return v;
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}
function firstNumber(val){
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const m = String(val).match(/[0-9]+(?:[.,]\d+)?/);
  if (!m) return null;
  const s = m[0].replace(/\./g,'').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function slugifyTR(s){
  const map = { ç:'c', Ç:'c', ğ:'g', Ğ:'g', ı:'i', İ:'i', ö:'o', Ö:'o', ş:'s', Ş:'s', ü:'u', Ü:'u' };
  return (s || '').split('').map(ch => map[ch] ?? ch).join('').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function abs(base, href){ try { return new URL(href, base).href; } catch { return href || null; } }
function strip(o){ const { _s, ...r } = o; return r; }
function kwds(s){ return (s||'').toLowerCase().replace(/[^a-z0-9\sğüşöçıİĞÜŞÖÇ]/g,' ').split(/\s+/).filter(Boolean); }
function jacc(Aarr, Barr){ const A=new Set(Aarr),B=new Set(Barr); const i=[...A].filter(x=>B.has(x)).length; const d=Math.max(1,A.size+B.size-i); return i/d; }
