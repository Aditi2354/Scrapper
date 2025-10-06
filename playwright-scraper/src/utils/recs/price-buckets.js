// src/utils/recs/price-buckets.js

function quantile(sortedNums, q) {
  if (!sortedNums.length) return null;
  const pos = (sortedNums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedNums[base + 1] !== undefined) {
    return sortedNums[base] + rest * (sortedNums[base + 1] - sortedNums[base]);
  } else {
    return sortedNums[base];
  }
}

export function bucketizeByPrice(items) {
  const priced = items.filter(x => Number.isFinite(x.price)).map(x => x.price).sort((a,b) => a - b);
  if (priced.length < 3) {
    return { budget: items.slice(0, 5), midRange: items.slice(5, 10), premium: items.slice(10, 15) };
  }
  const q33 = quantile(priced, 1/3);
  const q66 = quantile(priced, 2/3);

  const budget = [];
  const midRange = [];
  const premium = [];

  for (const it of items) {
    if (!Number.isFinite(it.price)) { midRange.push(it); continue; }
    if (it.price <= q33) budget.push(it);
    else if (it.price <= q66) midRange.push(it);
    else premium.push(it);
  }
  return { budget, midRange, premium };
}
