// src/adapters/hepsiburada.js
import { cleanText, toFloat } from '../utils/normalize.js';
import { waitDomSettled, autoScroll } from '../utils/browser.js';

export const id = 'hepsiburada';
export function match(u) { return /(^|\.)hepsiburada\.com$/i.test(u.hostname); }

/* ===================== PRODUCT (seed) ===================== */
export async function extractProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitDomSettled(page);
  await acceptConsent(page);

  // small nudge so lazy things resolve
  try { await page.evaluate(() => window.scrollTo(0, 120)); } catch {}
  try { await page.waitForTimeout(250); } catch {}

  // ---- TITLE
  let title =
    await pickText(page, [
      'h1[data-test-id="product-name"]',
      'h1.product-name',
      'h1#product-name'
    ]) ||
    await pickAttr(page, ['meta[property="og:title"]'], ['content']) ||
    await page.title().catch(()=>null);
  title = cleanTitle(title);

  // ---- IMAGE
  let image =
    await pickImage(page, [
      'img[data-test-id="product-image"]',
      '.product-image img',
      '.image-gallery img',
      'picture source[srcset]'
    ]) ||
    await pickAttr(page, ['meta[property="og:image:secure_url"]','meta[property="og:image"]'], ['content']);

  if (!image) {
    const ld = await readLDProduct(page);
    image = pickImageFromJSON(ld) || image;
    if (!image) {
      const any = await readAnyJSONScript(page);
      image = pickImageFromJSON(any) || image;
    }
  }

  // ---- PRICE (Turkish text)
  let priceText = await pickText(page, [
    '[data-test-id="price-current-price"]',
    '#offering-price',
    '.product-price-container .price',
    '.price', '.primary-price'
  ]);

  if (!looksLikePrice(priceText)) {
    const meta = await pickAttr(page, ['meta[itemprop="price"]'], ['content']);
    if (meta && /\d/.test(meta)) priceText = formatTRY(numberTR(meta));
  }
  if (!looksLikePrice(priceText)) {
    const ld = await readLDProduct(page);
    const num = firstNumber(ld?.offers?.price);
    if (num != null) priceText = formatTRY(num);
  }
  if (!looksLikePrice(priceText)) priceText = await findPriceInBody(page);
  priceText = normalizeTRY(priceText);

  // ---- open reviews tab (कुछ लेआउट में count तभी दिखता है)
  await openReviewsIfAvailable(page);

  // ==================== RATING & COUNT (DOM → LD-JSON → body) ====================
  let ratingText = await pickText(page, [
    '[itemprop="ratingValue"]',
    'meta[itemprop="ratingValue"][content]',
    '[data-test-id="average-rating"]',
    '.rating-star .rating-star__point',
    '.rating-average',
    '[aria-label*="/ 5"]'
  ]);

  let ratingCountText = await pickText(page, [
    '[itemprop="reviewCount"]',
    'meta[itemprop="reviewCount"][content]',
    '[data-test-id="rating-and-review-count"]',
    '[data-test-id="review-count"]',
    '[data-test-id="comments-count"]',
    '[data-test-id="comments-tab"]',
    '.rating-star__count',
    '.rating-count',
    '.rating-and-review-count',
    '.reviews-count',
    '[aria-label*="değerlendirme"]',
    '[aria-label*="yorum"]',
    '[aria-label*="oy"]'
  ]);

  // normalize mixed strings → सिर्फ़ संख्या
  if (ratingCountText && !/^\d+$/.test(String(ratingCountText).trim())) {
    const m = String(ratingCountText).match(/(\d{1,3}(?:\.\d{3})*)/);
    if (m) ratingCountText = m[1];
  }

  // LD-JSON fallback
  if (!ratingText || !ratingCountText) {
    const ld = await readLDProduct(page);
    if (!ratingText) {
      const v = (ld?.aggregateRating?.ratingValue ??
                ((ld?.aggregateRating?.['@type'] === 'AggregateRating') ? ld?.aggregateRating?.ratingValue : null));
      if (v != null) ratingText = String(v);
    }
    if (!ratingCountText) {
      const rc = (ld?.aggregateRating?.reviewCount ?? ld?.aggregateRating?.ratingCount);
      if (rc != null) ratingCountText = String(rc);
    }
  }

  // Body fallbacks (TR)
  if (!ratingText) {
    ratingText = await findFirstInBody(page, /([0-5](?:[.,]\d)?)\s*(?:\/\s*5|puan)/i, 1);
  }
  if (!ratingCountText) {
    ratingCountText = await findFirstInBody(page, /\b(\d{1,6})\b(?=.*?(değerlendirme|yorum|oy))/i, 1);
  }

  // ==================== SELLER (DOM → LD-JSON seller/brand → body) ====================
  let sellerName = await pickText(page, [
    '[data-test-id="merchant-name"] a',
    '[data-test-id="merchant-name"]',
    '[data-test-id="seller-name"] a',
    '[data-test-id="seller-name"]',
    '.merchant .merchant__name a',
    '.merchant .merchant__name',
    '.seller-name a',
    '.seller-name',
    '[data-test-id="brand-name"] a',
    '.brand-name a'
  ]);

  let sellerHref = await pickHref(page, [
    '[data-test-id="merchant-name"] a',
    '[data-test-id="seller-name"] a',
    '.merchant .merchant__name a',
    '.seller-name a',
    'a[href^="/magaza/"]',
    '[data-test-id="brand-name"] a',
    '.brand-name a'
  ]);
  if (sellerHref) sellerHref = absUrl('https://www.hepsiburada.com', sellerHref);

  if (!sellerName || !sellerHref) {
    const ld = await readLDProduct(page);
    const sellerFromLd =
      ld?.seller?.name ||
      ld?.offers?.seller?.name ||
      (typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name) ||
      null;
    if (!sellerName && sellerFromLd) sellerName = cleanText(sellerFromLd);
  }

  // आख़िरी fallback: body में “Satıcı: …”
  if (!sellerName) {
    const bodySeller = await findFirstInBody(page, /Satıcı:\s*([^\n•|]+)/i, 1);
    if (bodySeller) sellerName = cleanText(bodySeller);
  }

  return {
    product_title: title || null,
    product_name: deriveName(title) || null,
    product_url: page.url().split('?')[0],
    product_image: image || null,
    price: priceText || null,
    rating: toRating(ratingText),
    rating_count: toInt(ratingCountText),
    sellers_info: sellerName ? [{ name: sellerName, link: sellerHref || null }] : []
  };
}

/* ===================== SEARCH / RECO ===================== */
export async function searchSimilar(page, seed, { limit = 12, pages = 1 } = {}) {
  const q = encodeURIComponent(seed.product_name || seed.product_title || '');
  const out = [];

  for (let p=1; p<=pages; p++) {
    const url = `https://www.hepsiburada.com/ara?q=${q}&sayfa=${p}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitDomSettled(page);
    await acceptConsent(page);
    await autoScroll(page, { maxSteps: 4 });

    const cards = page.locator(
      '[data-test-id="product-card"], li.productListContent-z7dIm, .productListContent .productListContent-item'
    );
    const n = await cards.count().catch(()=>0);

    for (let i=0; i<n && out.length < limit*3; i++) {
      const c = cards.nth(i);
      const href  = await c.locator('a[href*="/-p-"]').first().getAttribute('href').catch(()=>null);
      const title = cleanText(await c.locator('[data-test-id="product-card-name"], .product-title, h3').first().textContent().catch(()=>null) || '');
      if (!href || !title) continue;

      const priceText = normalizeTRY(await c
        .locator('[data-test-id="price-current-price"], .price, .primary-price')
        .first().innerText().catch(()=>null));

      const ratingText = await c.locator('[itemprop="ratingValue"], .rating-average').first().innerText().catch(()=>null);
      const ratingCountText = await c.locator('[itemprop="reviewCount"], .rating-count, .rating-star__count, [data-test-id="rating-and-review-count"]').first().innerText().catch(()=>null);

      out.push({
        title,
        url: absUrl('https://www.hepsiburada.com', href),
        image: null,
        price: priceText || null,
        rating: toRating(ratingText),
        rating_count: toInt(ratingCountText),
        source: 'hepsiburada'
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
    const btn = page.locator('#onetrust-accept-btn-handler, .onetrust-accept-btn-handler');
    if (await btn.count()) await btn.click({ timeout: 2000 }).catch(()=>{});
  } catch {}
}

function cleanTitle(t){
  const s = cleanText(t || '');
  return s.replace(/\s*[-–]\s*(Fiyatı|Yorumları).*$/i, '').trim() || null;
}
function deriveName(t){ return cleanText((t||'').split('|')[0].split('(')[0]); }

// helpers friendly to mixed strings
function toRating(s){ const n = toFloat(s); return n==null?null:n; }
function toInt(s){
  if (s==null) return null;
  const m = String(s).replace(/[^\d]/g,'').match(/\d{1,9}/);
  return m ? parseInt(m[0],10) : null;
}

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
      .format(num).replace(/\s+/g,' ').trim();
  } catch { return `${num} TL`; }
}
function numberTR(s){
  if (s == null) return null;
  const t = String(s).replace(/\./g,'').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
function firstNumber(val){
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const m = String(val).match(/[0-9]+(?:[.,][0-9]+)?/);
  if (!m) return null;
  const s = m[0].replace(/\./g,'').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

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
async function pickAttr(page, sels, attrs){
  for (const sel of sels){
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    for (const a of attrs){
      const v = await el.getAttribute(a).catch(()=>null);
      if (v) return v;
    }
  }
  return null;
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
    const current = await el.evaluate(e => {
      if (!e) return null;
      if (e.tagName && e.tagName.toLowerCase() === 'source') {
        const ss = e.getAttribute('srcset');
        if (ss) return ss.split(',')[0].trim().split(' ')[0];
      }
      return e.currentSrc || e.src || e.getAttribute('data-src') || e.getAttribute('srcset');
    }).catch(()=>null);
    if (!current) continue;
    if (String(current).includes(',')) {
      const first = String(current).split(',')[0]?.trim().split(' ')[0];
      if (first) return first;
    }
    return current;
  }
  return null;
}

async function openReviewsIfAvailable(page){
  try {
    const btn = page.locator(
      '[data-test-id="comments-tab"], a[href*="#yorum"], a[href*="#review"], [role="tab"][aria-controls*="comments"]'
    ).first();
    if (await btn.count()) {
      await btn.scrollIntoViewIfNeeded().catch(()=>{});
      await btn.click({ timeout: 1200 }).catch(()=>{});
      await page.waitForTimeout(400).catch(()=>{});
    }
  } catch {}
}

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

async function readLDProduct(page){
  try {
    const arr = await page.$$eval('script[type="application/ld+json"]', ns => ns.map(n => n.textContent||''));
    for (const s of arr) {
      try {
        const j = JSON.parse(s.trim()); const list = Array.isArray(j) ? j : [j];
        for (const o of list) if (o['@type']==='Product') return o;
      } catch {}
    }
  } catch {}
  return null;
}
async function readAnyJSONScript(page){
  try {
    const scripts = await page.$$eval('script:not([type]),script[type="application/json"]', ns => ns.map(n => n.textContent||''));
    for (const txt of scripts) {
      try {
        if (!txt || txt.length < 10) continue;
        const j = JSON.parse(txt);
        if (j && typeof j === 'object') return j;
      } catch {}
    }
  } catch {}
  return null;
}

/* JSON image pick */
function pickImageFromJSON(root){
  if (!root) return null;
  if (typeof root === 'string' && /\.(png|jpe?g|webp)(\?|$)/i.test(root)) return root;
  if (Array.isArray(root)) {
    for (const v of root) {
      const r = pickImageFromJSON(v);
      if (r) return r;
    }
    return null;
  }
  if (root && typeof root === 'object') {
    if (root.url && /\.(png|jpe?g|webp)(\?|$)/i.test(root.url)) return root.url;
    const keys = ['image','imageUrl','imageURL','thumbnail','images','imageGallery','media'];
    for (const k of keys) {
      if (root[k]) {
        const r = pickImageFromJSON(root[k]);
        if (r) return r;
      }
    }
  }
  return null;
}

/* misc */
function absUrl(base, href){ try { return new URL(href, base).href; } catch { return href || null; } }
function strip(o){ const { _s, ...r } = o; return r; }
function kwds(s){ return (s||'').toLowerCase().replace(/[^a-z0-9\sğüşöçıİĞÜŞÖÇ]/g,' ').split(/\s+/).filter(Boolean); }
function jacc(Aarr, Barr){ const A=new Set(Aarr),B=new Set(Barr); const i=[...A].filter(x=>B.has(x)).length; const d=Math.max(1,A.size+B.size-i); return i/d; }
