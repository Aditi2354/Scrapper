import * as amazon from './amazon.js';
import * as trendyol from './trendyol.js';
import * as hepsiburada from './hepsiburada.js';

const registry = [amazon, trendyol, hepsiburada];

export function pickAdapter(url) {
  const u = new URL(url);
  return registry.find(a => a.match(u)) || null;
}

export const searchCapable = registry.filter(a => typeof a.searchSimilar === 'function');
