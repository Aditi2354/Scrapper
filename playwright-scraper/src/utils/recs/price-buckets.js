import { toNumberPrice } from './text-utils.js';

export function computeBuckets(items){
  const prices = items
    .map(x => toNumberPrice(x.price))
    .filter(n => n != null && Number.isFinite(n))
    .sort((a,b) => a-b);
  if (prices.length === 0) return { q33: null, q66: null };
  const q33 = quantile(prices, 0.33);
  const q66 = quantile(prices, 0.66);
  return { q33, q66 };
}

export function splitByBuckets(items, { q33, q66 }){
  const groups = { budget: [], midRange: [], premium: [] };
  for (const it of items){
    const p = toNumberPrice(it.price);
    if (p == null) { groups.midRange.push(it); continue; }
    if (q33 == null || q66 == null) { groups.midRange.push(it); continue; }
    if (p <= q33) groups.budget.push(it);
    else if (p <= q66) groups.midRange.push(it);
    else groups.premium.push(it);
  }
  return groups;
}

function quantile(sorted, q){
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base+1] !== undefined){
    return sorted[base] + rest * (sorted[base+1] - sorted[base]);
  } else {
    return sorted[base];
  }
}
