export const toNumber = (s) => {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const cleaned = s
    .toString()
    .replace(/[^0-9.,]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

export const moneyToMinor = (s) => {
  const n = toNumber(s);
  return n == null ? null : Math.round(n * 100);
};

export const toFloat = (s) => {
  const n = toNumber(s);
  return n == null ? null : n;
};

export const cleanText = (s) => (s || '').replace(/\s+/g, ' ').trim();
