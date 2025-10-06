# Playwright Multi‑Marketplace Scraper + Recommender (v1.1)

Production‑ready Node.js + Express + Playwright scraper with adapters for Amazon, Trendyol, Hepsiburada and cross‑site recommendations.

## Install

```bash
cd playwright-scraper
npm i
cp .env.example .env
# Optional while debugging:
# edit .env -> HEADLESS=false
```

## Run
```bash
npm run dev
```

## Endpoints

### 1) Extract seed product
POST http://localhost:5000/scrape/from-url
```json
{ "url": "https://www.amazon.in/dp/B0F5WTG8RG" }
```

### 2) Build recommendations from URL
POST http://localhost:5000/reco/from-url
```json
{ "url": "https://www.amazon.in/dp/B0F5WTG8RG", "limit": 24, "pages": 2 }
```

## Why fields sometimes miss & how this build fixes it
- Waits for `networkidle` and auto‑scrolls to load lazy content.
- Multiple selector fallbacks across A/B layouts & locales.
- Parses lazy images from `src`, `data-src`, `srcset`, Amazon `data-a-dynamic-image`.
- Fallback to `application/ld+json` for price/rating counts.

## Extend
Add `src/adapters/<site>.js` with `match`, `extractProduct`, `searchSimilar`, then register in `src/adapters/index.js`.
