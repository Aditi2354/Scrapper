// Price bucketing utilities for categorizing products

export function categorizePrices(products, seedPrice = null) {
  if (!products.length) return { budget: [], midRange: [], premium: [] };
  
  // Filter products with valid prices
  const withPrices = products.filter(p => p.price && p.price > 0);
  if (!withPrices.length) return { budget: [], midRange: [], premium: [] };
  
  // Sort by price to calculate quantiles
  const sortedPrices = withPrices.map(p => p.price).sort((a, b) => a - b);
  
  // Calculate 33rd and 66th percentiles
  const q33Index = Math.floor(sortedPrices.length * 0.33);
  const q66Index = Math.floor(sortedPrices.length * 0.66);
  
  const q33Price = sortedPrices[q33Index];
  const q66Price = sortedPrices[q66Index];
  
  // If we have seed price, adjust thresholds to be more relative
  let budgetThreshold, premiumThreshold;
  
  if (seedPrice && seedPrice > 0) {
    // Create buckets relative to seed price with some market context
    const marketMin = Math.min(...sortedPrices);
    const marketMax = Math.max(...sortedPrices);
    
    // Adaptive thresholds based on seed price position in market
    budgetThreshold = Math.max(q33Price, seedPrice * 0.7);
    premiumThreshold = Math.min(q66Price, seedPrice * 1.5);
    
    // Ensure reasonable spread
    if (premiumThreshold - budgetThreshold < marketMax * 0.1) {
      budgetThreshold = q33Price;
      premiumThreshold = q66Price;
    }
  } else {
    budgetThreshold = q33Price;
    premiumThreshold = q66Price;
  }
  
  // Categorize products
  const budget = [];
  const midRange = [];
  const premium = [];
  
  for (const product of products) {
    if (!product.price || product.price <= 0) {
      // Products without price go to mid-range by default
      midRange.push(product);
    } else if (product.price <= budgetThreshold) {
      budget.push(product);
    } else if (product.price <= premiumThreshold) {
      midRange.push(product);
    } else {
      premium.push(product);
    }
  }
  
  return { budget, midRange, premium };
}

export function createPriceBuckets(products, seedPrice = null, maxPerBucket = 5) {
  const { budget, midRange, premium } = categorizePrices(products, seedPrice);
  
  // Sort each bucket by rating (descending) then by price (ascending)
  const sortByQuality = (a, b) => {
    const ratingA = a.rating || 0;
    const ratingB = b.rating || 0;
    
    if (ratingA !== ratingB) return ratingB - ratingA;
    
    const priceA = a.price || Infinity;
    const priceB = b.price || Infinity;
    return priceA - priceB;
  };
  
  return {
    budget: budget.sort(sortByQuality).slice(0, maxPerBucket),
    midRange: midRange.sort(sortByQuality).slice(0, maxPerBucket),
    premium: premium.sort(sortByQuality).slice(0, maxPerBucket)
  };
}

export function createTopRatedBucket(products, maxCount = 5) {
  return products
    .filter(p => p.rating && p.rating > 0)
    .sort((a, b) => {
      // Primary sort by rating
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      
      // Secondary sort by review count
      return (b.ratingCount || 0) - (a.ratingCount || 0);
    })
    .slice(0, maxCount);
}

export function createFeatureMatchBucket(products, seedFeatures = [], maxCount = 5) {
  if (!seedFeatures.length) return products.slice(0, maxCount);
  
  // Score products based on feature matches
  const scored = products.map(product => {
    let featureMatchScore = 0;
    const productFeatures = product.features || [];
    
    if (productFeatures.length) {
      const seedFeatureSet = new Set(seedFeatures.join(' ').toLowerCase().split(/\s+/));
      const productFeatureSet = new Set(productFeatures.join(' ').toLowerCase().split(/\s+/));
      
      const intersection = [...seedFeatureSet].filter(f => productFeatureSet.has(f));
      featureMatchScore = intersection.length / Math.max(seedFeatureSet.size, 1);
    }
    
    return { ...product, _featureScore: featureMatchScore };
  });
  
  return scored
    .sort((a, b) => (b._featureScore || 0) - (a._featureScore || 0))
    .slice(0, maxCount)
    .map(({ _featureScore, ...rest }) => rest);
}