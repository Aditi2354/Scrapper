export function calculatePriceQuantiles(prices) {
  if (!prices || prices.length === 0) return { q33: 0, q66: 0 };
  
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const n = sortedPrices.length;
  
  const q33Index = Math.floor(n * 0.33);
  const q66Index = Math.floor(n * 0.66);
  
  return {
    q33: sortedPrices[q33Index] || 0,
    q66: sortedPrices[q66Index] || 0
  };
}

export function categorizeByPrice(products, quantiles) {
  const { q33, q66 } = quantiles;
  
  const budget = [];
  const midRange = [];
  const premium = [];
  
  for (const product of products) {
    if (!product.price) continue;
    
    if (product.price <= q33) {
      budget.push(product);
    } else if (product.price <= q66) {
      midRange.push(product);
    } else {
      premium.push(product);
    }
  }
  
  return { budget, midRange, premium };
}

export function createPriceGroups(products) {
  const validPrices = products
    .map(p => p.price)
    .filter(price => price != null && price > 0);
  
  if (validPrices.length === 0) {
    return {
      budget: [],
      midRange: [],
      premium: [],
      quantiles: { q33: 0, q66: 0 }
    };
  }
  
  const quantiles = calculatePriceQuantiles(validPrices);
  const groups = categorizeByPrice(products, quantiles);
  
  return {
    ...groups,
    quantiles
  };
}