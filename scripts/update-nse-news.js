/**
 * Stocks 360 - NSE Corporate Announcements Synchronizer
 *
 * Pulls the official NSE corporate announcements feed (all listed equities in a
 * single bulk request), keeps the latest announcements per company, and writes
 * them into small sharded JSON files that the Company Analysis page loads on demand:
 *
 *   data/news/A.json, data/news/B.json, ... data/news/0-9.json
 *
 * Each shard maps SYMBOL -> [{ date, headline, category, link }] (newest first).
 *
 * - Zero npm dependencies (native https)
 * - Cost: Rs 0 (no paid APIs)
 * - If NSE blocks or fails, existing shards are left untouched (no fake news is generated)
 *
 * Usage:
 *   node scripts/update-nse-news.js            # last 3 days (daily run)
 *   NEWS_DAYS=30 node scripts/update-nse-news.js   # backfill
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(__dirname, '..', 'data', 'news');
const LOOKBACK_DAYS = Math.max(1, parseInt(process.env.NEWS_DAYS || '3', 10) || 3);
const MAX_PER_SYMBOL = 6;
const MAX_AGE_DAYS = 90;
const CHUNK_DAYS = 7; // NSE handles small date windows more reliably
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function httpGet(url, cookie) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
        ...(cookie ? { Cookie: cookie } : {})
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: 'timeout' }); });
  });
}

function fmtNseDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function shardKey(symbol) {
  const c = String(symbol || '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '0-9';
}

function cleanText(t) {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .replace(/["']+$/g, '')
    .trim();
}

function isAnnualReportFiling(category, headline) {
  const combined = `${category || ''} ${headline || ''}`;
  return /annual\s*report|integrated\s*report|business\s*responsibility.*sustainability\s*report/i.test(combined);
}

function toItem(a) {
  const sortDate = a.sort_date || '';
  const ts = Date.parse(sortDate.replace(' ', 'T') + '+05:30') || Date.now();
  let headline = cleanText(a.attchmntText) || cleanText(a.desc);
  if (headline.length > 260) headline = headline.slice(0, 257).trim() + '...';
  let category = cleanText(a.desc) || 'Corporate Announcement';
  if (isAnnualReportFiling(category, headline)) {
    category = 'Annual Report';
  }
  return {
    ts,
    date: new Date(ts).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }),
    headline,
    category,
    link: a.attchmntFile && /^https:\/\//.test(a.attchmntFile) ? a.attchmntFile : '',
    id: String(a.seq_id || `${a.symbol}-${sortDate}`)
  };
}

async function fetchAnnouncements(cookie, from, to) {
  const url = `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${fmtNseDate(from)}&to_date=${fmtNseDate(to)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await httpGet(url, cookie);
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        return Array.isArray(j) ? j : (j.data || []);
      } catch (_) { /* retry */ }
    }
    console.log(`  NSE responded ${r.status} (attempt ${attempt}) for ${fmtNseDate(from)}..${fmtNseDate(to)}`);
    await new Promise((res) => setTimeout(res, 2500 * attempt));
  }
  return null;
}

function loadShard(key) {
  const p = path.join(OUT_DIR, `${key}.json`);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (_) { return {}; }
}

async function main() {
  console.log(`Stocks 360: Syncing NSE corporate announcements (last ${LOOKBACK_DAYS} day(s))...`);

  // Warm-up request for cookies (NSE sometimes requires them; works without in many regions)
  const home = await httpGet('https://www.nseindia.com/');
  const cookie = ((home.headers && home.headers['set-cookie']) || []).map((c) => c.split(';')[0]).join('; ');

  const all = [];
  const end = new Date();
  let windowEnd = new Date(end);
  let remaining = LOOKBACK_DAYS;
  let failures = 0;
  while (remaining > 0) {
    const span = Math.min(CHUNK_DAYS, remaining);
    const windowStart = new Date(windowEnd.getTime() - (span - 1) * 86400000);
    const items = await fetchAnnouncements(cookie, windowStart, windowEnd);
    if (items === null) failures++;
    else all.push(...items);
    windowEnd = new Date(windowStart.getTime() - 86400000);
    remaining -= span;
  }

  if (all.length === 0) {
    console.log(failures > 0
      ? 'NSE feed unavailable right now. Existing news files left unchanged.'
      : 'No new announcements found. Existing news files left unchanged.');
    return;
  }
  console.log(`Fetched ${all.length} announcements from NSE.`);

  // Group new items by shard -> symbol
  const incoming = {};
  for (const a of all) {
    if (!a || !a.symbol) continue;
    const sym = String(a.symbol).toUpperCase();
    const key = shardKey(sym);
    incoming[key] = incoming[key] || {};
    incoming[key][sym] = incoming[key][sym] || [];
    incoming[key][sym].push(toItem(a));
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const annualReportCutoff = Date.now() - 365 * 86400000;
  let symbolsTouched = 0;

  for (const key of Object.keys(incoming)) {
    const shard = loadShard(key);
    for (const sym of Object.keys(incoming[key])) {
      const merged = new Map();
      (shard[sym] || []).concat(incoming[key][sym]).forEach((it) => {
        if (!it || !it.headline) return;
        const isAR = isAnnualReportFiling(it.category, it.headline);
        if (it.ts >= cutoff || (isAR && it.ts >= annualReportCutoff)) {
          merged.set(it.id, it);
        }
      });
      const sorted = Array.from(merged.values()).sort((x, y) => y.ts - x.ts);
      const topSlice = sorted.slice(0, MAX_PER_SYMBOL);
      const latestAR = sorted.find((it) => isAnnualReportFiling(it.category, it.headline) && it.link);
      if (latestAR && !topSlice.some((it) => it.id === latestAR.id)) {
        topSlice[topSlice.length - 1] = latestAR;
      }
      shard[sym] = topSlice;
      symbolsTouched++;
    }
    // Drop expired entries across the whole shard (keep Annual Reports up to 365 days)
    for (const sym of Object.keys(shard)) {
      shard[sym] = (shard[sym] || []).filter((it) => {
        const isAR = isAnnualReportFiling(it.category, it.headline);
        return it.ts >= cutoff || (isAR && it.ts >= annualReportCutoff);
      });
      if (shard[sym].length === 0) delete shard[sym];
    }
    const ordered = {};
    Object.keys(shard).sort().forEach((s) => { ordered[s] = shard[s]; });
    fs.writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(ordered), 'utf8');
  }

  fs.writeFileSync(
    path.join(OUT_DIR, '_meta.json'),
    JSON.stringify({ updatedAt: Date.now(), source: 'NSE Corporate Announcements', lookbackDays: LOOKBACK_DAYS }),
    'utf8'
  );
  console.log(`Updated announcements for ${symbolsTouched} companies across ${Object.keys(incoming).length} shard file(s).`);
}

main().catch((e) => {
  console.error('News sync failed (existing files untouched):', e.message);
  process.exit(0);
});
