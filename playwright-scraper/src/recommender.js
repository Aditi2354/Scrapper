import pLimit from 'p-limit';
import { topKeywords, similarity } from './utils/text.js';
import { searchCapable } from './adapters/index.js';

const CONCURRENCY = Number(process.env.CONCURRENCY || 3);

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

// New recommendations dispatcher
export async function getRecommendations(site, page, options) {
  if (site === 'amazon') {
    const { url, limit = 15 } = options;
    return await getAmazonRecommendations(page, url, limit);
  }
  
  throw new Error(`Unsupported site: ${site}`);
}
