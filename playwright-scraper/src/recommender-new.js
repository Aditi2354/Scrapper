// Recommendations dispatcher - routes requests to appropriate provider
import { getRecommendations as getAmazonRecommendations } from './adapters/amazon/recs.js';
import { newContext } from './utils/recs/antibot.js';
import { chromium } from 'playwright';

// Check if URL is supported Amazon domain
function isAmazonUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return /(^|\.)amazon\.(in|com|co\.uk|de|fr|it|es)/i.test(hostname);
  } catch {
    return false;
  }
}

// Main dispatcher function
export async function getRecommendations(site, { url, limit = 15 }) {
  console.log(`[Recommender] Getting recommendations for ${site} from ${url}`);
  
  // Validate inputs
  if (!url) {
    return { error: 'URL is required' };
  }
  
  if (site !== 'amazon' && !isAmazonUrl(url)) {
    return { error: 'Only Amazon recommendations are currently supported' };
  }
  
  if (!isAmazonUrl(url)) {
    return { error: 'URL must be from a supported Amazon domain' };
  }
  
  // Validate limit
  const validLimit = Math.min(Math.max(parseInt(limit) || 15, 5), 50);
  
  let browser;
  let context;
  
  try {
    // Launch browser and create context
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      devtools: process.env.PWDEVTOOLS === 'true'
    });
    
    context = await newContext(browser, url);
    
    // Route to Amazon provider
    const result = await getAmazonRecommendations(context, url, { limit: validLimit });
    
    return result;
    
  } catch (error) {
    console.error(`[Recommender] Error: ${error.message}`);
    return {
      error: 'Failed to get recommendations',
      detail: error.message
    };
  } finally {
    // Cleanup
    if (context) {
      try {
        await context.close();
      } catch (error) {
        console.warn(`[Recommender] Context cleanup error: ${error.message}`);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.warn(`[Recommender] Browser cleanup error: ${error.message}`);
      }
    }
  }
}