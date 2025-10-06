export function bucketizeByPrice(items, seedPrice) {
  const withPrice = items.filter(it => it.price != null);
  if (withPrice.length === 0) {
    return {
      budget: [],
      midRange: [],
      premium: []
    };
  }
  
  // Calculate 33rd and 66th percentiles
  const sorted = [...withPrice].sort((a, b) => a.price - b.price);
  const p33Idx = Math.floor(sorted.length * 0.33);
  const p66Idx = Math.floor(sorted.length * 0.66);
  
  const p33 = sorted[p33Idx]?.price || 0;
  const p66 = sorted[p66Idx]?.price || Infinity;
  
  const budget = [];
  const midRange = [];
  const premium = [];
  
  for (const item of withPrice) {
    if (item.price <= p33) {
      budget.push(item);
    } else if (item.price <= p66) {
      midRange.push(item);
    } else {
      premium.push(item);
    }
  }
  
  return { budget, midRange, premium };
}

export function selectTopRated(items, count = 5) {
  return [...items]
    .filter(it => it.rating != null && it.rating > 0)
    .sort((a, b) => {
      // Sort by rating desc, then ratingCount desc
      if (b.rating !== a.rating) return b.rating - a.rating;
      return (b.ratingCount || 0) - (a.ratingCount || 0);
    })
    .slice(0, count);
}

export function selectFeatureMatch(items, seed, count = 5) {
  // Items already scored by ranker, just take top N
  return items.slice(0, count);
}
