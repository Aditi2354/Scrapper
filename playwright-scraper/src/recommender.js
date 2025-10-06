import pLimit from 'p-limit';
import { topKeywords, similarity } from './utils/text.js';
import { searchCapable } from './adapters/index.js';
import { getAmazonRecommendations } from './adapters/amazon/recs.js';

const CONCURRENCY = Number(process.env.CONCURRENCY || 3);

/**
 * Get recommendations for a specific site
 */
export async function getRecommendations(site, { url, limit = 15 }, browser) {
  if (site === 'amazon') {
    return await getAmazonRecommendations(browser, { url, limit });
  }
  
  throw new Error(`Unsupported site: ${site}`);
}

export async function buildRecommendations(context, seed, { limit = 24, pages = 2 } = {}) {
  const kw = topKeywords(seed.product_name || seed.product_title || '');
  const lim = pLimit(CONCURRENCY);

  const results = (await Promise.all(
    searchCapable.map(adapter => lim(async () => {
      const page = await context.newPage();
      try {
        return await adapter.searchSimilar(page, seed, { limit, pages });
      } catch (e) {
        return [];
      } finally {
        await page.close();
      }
    }))
  )).flat();

  const scored = results.map(it => ({
    ...it,
    _score: similarity(kw, topKeywords(it.title || '')) + (it.price ? 0.05 : 0) + (it.rating && it.rating !== 'N/A' ? 0.05 : 0)
  }));

  scored.sort((a,b) => b._score - a._score);

  const seen = new Set();
  const dedup = [];
  for (const it of scored) {
    if (!it.url || seen.has(it.url)) continue;
    seen.add(it.url);
    dedup.push(stripScore(it));
    if (dedup.length >= limit) break;
  }
  return dedup;
}

function stripScore(it){ const { _score, ...rest } = it; return rest; }
