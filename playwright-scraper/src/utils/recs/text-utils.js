// Text and parsing helpers specific to recommendations

export function cleanText(s){ return (s||'').replace(/\s+/g,' ').trim(); }

export function tokenize(str, { limit = 8 } = {}){
  const stop = new Set(['the','a','an','for','and','or','of','to','in','on','with','by','from','plus','pro','max','mini','new','gb','tb','ram','rom','phone','mobile','smartphone','official','store','2024','2025']);
  return cleanText(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w => w && !stop.has(w))
    .slice(0, limit);
}

export function parseRating(s){
  if (s == null) return null;
  const m = String(s).match(/([0-9]+(\.[0-9]+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  if (n > 5 && n <= 10) return Math.round((n/2)*10)/10; // sometimes 8.6/10
  return Math.max(0, Math.min(5, n));
}

export function parseInlinePrice(s){
  if (s == null) return null;
  const cleaned = String(s)
    .replace(/[^0-9.,]/g,'')
    .replace(/,(?=\d{3}(\D|$))/g,'')
    .replace(/\.(?=\d{3}(\D|$))/g,'')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function toNumberPrice(v){
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return parseInlinePrice(v);
}
