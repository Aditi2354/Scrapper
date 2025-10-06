export function topKeywords(str, limit = 6) {
  const stop = new Set('the a an for and or of to in on with by from plus pro max mini new 2024 2025 gb tb ram rom case cover phone mobile smartphone unlocked official store'.split(' '));
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !stop.has(w))
    .slice(0, limit);
}

export function similarity(a, b) {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const score = inter / Math.max(1, Math.min(A.size, B.size));
  return score; // 0..1
}
