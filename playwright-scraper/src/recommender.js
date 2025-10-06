import pLimit from 'p-limit';
import { topKeywords, similarity } from './utils/text.js';
import { searchCapable } from './adapters/index.js';
import { AmazonRecommendations } from './adapters/amazon/recs.js';

const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const amazonRecs = new AmazonRecommendations();

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

/**
 * Get recommendations for a specific site using the new recommendations system
 * @param {string} site - Site name (e.g., 'amazon')
 * @param {Object} options - Options { url, limit }
 * @returns {Promise<Object>} Recommendations object or error
 */
export async function getRecommendations(site, { url, limit = 50 } = {}) {
  try {
    if (site === 'amazon') {
      return await amazonRecs.getRecommendations(url, limit);
    } else {
      throw new Error(`Unsupported site: ${site}`);
    }
  } catch (error) {
    console.error(`Recommendations error for ${site}:`, error);
    return {
      error: 'Failed to get recommendations',
      detail: error.message,
      site,
      inputUrl: url
    };
  } finally {
    // Cleanup browser resources
    try {
      await amazonRecs.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
