import fs from 'fs/promises';
import path from 'path';

const DEBUG = (process.env.DEBUG_SCRAPE || '').toLowerCase() === 'true';
const LOG_DIR = path.resolve('logs');

export function isDebug(){ return DEBUG; }

export async function capture(page, tag){
  if (!DEBUG) return;
  await fs.mkdir(LOG_DIR, { recursive: true }).catch(()=>{});
  try {
    await page.screenshot({ path: path.join(LOG_DIR, `${tag}.png`), fullPage: true });
  } catch {}
  try {
    const html = await page.content();
    await fs.writeFile(path.join(LOG_DIR, `${tag}.html`), html, 'utf8');
  } catch {}
}

export function dlog(...args){
  if (DEBUG) console.log('[DEBUG]', ...args);
}
