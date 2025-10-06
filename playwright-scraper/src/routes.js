import express from 'express';
import { launch } from './utils/browser.js';
import { pickAdapter } from './adapters/index.js';
import { buildRecommendations } from './recommender.js';
import { getRecommendations } from './recommender-new.js';

export const router = express.Router();
router.use(express.json({ limit: '1mb' }));

router.get('/health', (req, res) => res.json({ ok: true }));

router.post('/scrape/from-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const adapter = pickAdapter(url);
  if (!adapter) return res.status(400).json({ error: 'unsupported site' });

  const { context } = await launch();
  try {
    const page = await context.newPage();
    const seed = await adapter.extractProduct(page, url);
    res.json({ seed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await context.close();
  }
});

router.post('/reco/from-url', async (req, res) => {
  const { url, limit = 24, pages = 2 } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const adapter = pickAdapter(url);
  if (!adapter) return res.status(400).json({ error: 'unsupported site' });

  const { context } = await launch();
  try {
    const page = await context.newPage();
    const seed = await adapter.extractProduct(page, url);
    await page.close();
    const items = await buildRecommendations(context, seed, { limit, pages });
    res.json({ seed, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await context.close();
  }
});

// New Amazon recommendations endpoint
router.post('/recs/:site', async (req, res) => {
  const { site } = req.params;
  const { url, limit } = req.body || {};
  
  if (!url) return res.status(400).json({ error: 'url required' });
  
  // Currently only support Amazon
  if (site !== 'amazon') {
    return res.status(400).json({ error: 'Only amazon recommendations are currently supported' });
  }
  
  try {
    const result = await getRecommendations(site, { url, limit });
    
    if (result.error) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error(`[Routes] Error in /recs/${site}:`, error);
    res.status(500).json({ 
      error: 'Internal server error',
      detail: error.message 
    });
  }
});
