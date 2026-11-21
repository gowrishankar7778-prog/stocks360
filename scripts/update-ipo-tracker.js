/**
 * Stocks 360 - Official NSE Mainboard & SME IPO Tracker Synchronizer
 * Sources (100% Official Static/Public NSE Feeds, Cost: Rs 0):
 *  - https://www.nseindia.com/api/ipo-current-issue
 *  - https://www.nseindia.com/api/all-upcoming-issues?category=ipo
 *  - https://www.nseindia.com/api/public-past-issues
 * Enriches recently listed/past IPOs with closing CMP from js/screener-index.js
 * Outputs:
 *  - data/market/ipo-tracker.json
 *  - js/ipo-data.js (`window.STOCKS_IPO_DATA`)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MARKET_DIR = path.join(ROOT, 'data', 'market');
const JSON_OUT = path.join(MARKET_DIR, 'ipo-tracker.json');
const JS_OUT = path.join(ROOT, 'js', 'ipo-data.js');
const SCREENER_INDEX_PATH = path.join(ROOT, 'js', 'screener-index.js');

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'
};

async function fetchJsonSafe(url) {
  const res = await fetch(url, { headers: NSE_HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function parseIssuePriceNum(val) {
  const cleaned = String(val == null ? '' : val).replace(/,/g, '').trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatIssueSizeShares(val) {
  const n = Number(String(val == null ? '' : val).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return '--';
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr Shares`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L Shares`;
  return `${n.toLocaleString('en-IN')} Shares`;
}

function normalizeCurrentOrUpcoming(rows) {
  return (rows || [])
    .filter((r) => r && r.companyName)
    .map((r) => ({
      symbol: r.symbol ? String(r.symbol).trim().toUpperCase() : '',
      companyName: String(r.companyName).trim(),
      series: String(r.series || r.segment || 'Equity').trim(),
      issueStartDate: String(r.issueStartDate || '--').trim(),
      issueEndDate: String(r.issueEndDate || '--').trim(),
      issuePrice: String(r.issuePrice || '--').trim(),
      issueSizeText: formatIssueSizeShares(r.issueSize),
      status: String(r.status || '').trim()
    }));
}

function normalizePast(rows, cmpMap) {
  return (rows || [])
    .filter((r) => r && (r.companyName || r.company))
    .map((r) => {
      const sym = String(r.symbol || '').trim().toUpperCase();
      const issuePriceNum = parseIssuePriceNum(r.issuePrice);
      const cmp = sym && cmpMap.has(sym) ? cmpMap.get(sym) : null;
      const gainPct =
        issuePriceNum && cmp
          ? Number((((cmp - issuePriceNum) / issuePriceNum) * 100).toFixed(2))
          : null;
      return {
        symbol: sym,
        companyName: String(r.companyName || r.company || sym).trim(),
        securityType: String(r.securityType || 'EQ').trim(),
        ipoStartDate: String(r.ipoStartDate || '--').trim(),
        ipoEndDate: String(r.ipoEndDate || '--').trim(),
        listingDate: String(r.listingDate || '--').trim(),
        priceRange: String(r.priceRange || '--').trim(),
        issuePrice: issuePriceNum,
        cmp,
        gainPct
      };
    });
}

async function main() {
  if (!fs.existsSync(MARKET_DIR)) {
    fs.mkdirSync(MARKET_DIR, { recursive: true });
  }

  let cmpMap = new Map();
  if (fs.existsSync(SCREENER_INDEX_PATH)) {
    const { STOCKS_SCREENER_DATASET } = require(SCREENER_INDEX_PATH);
    for (const s of STOCKS_SCREENER_DATASET || []) {
      if (s && s.symbol && typeof s.cmp === 'number' && s.cmp > 0) {
        cmpMap.set(String(s.symbol).toUpperCase(), s.cmp);
      }
    }
  }

  let prev = { openIpos: [], upcomingIpos: [], pastIpos: [] };
  if (fs.existsSync(JSON_OUT)) {
    try {
      prev = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')) || prev;
    } catch (_) {}
  }

  let openIpos = prev.openIpos || [];
  let upcomingIpos = prev.upcomingIpos || [];
  let pastIpos = prev.pastIpos || [];

  try {
    const rawOpen = await fetchJsonSafe('https://www.nseindia.com/api/ipo-current-issue');
    openIpos = normalizeCurrentOrUpcoming(rawOpen);
    console.log(`✓ Synced Open IPOs: ${openIpos.length}`);
  } catch (err) {
    console.warn('Open IPOs fetch notice:', err.message);
  }

  try {
    const rawUpcoming = await fetchJsonSafe('https://www.nseindia.com/api/all-upcoming-issues?category=ipo');
    upcomingIpos = normalizeCurrentOrUpcoming(rawUpcoming);
    console.log(`✓ Synced Upcoming IPOs: ${upcomingIpos.length}`);
  } catch (err) {
    console.warn('Upcoming IPOs fetch notice:', err.message);
  }

  try {
    const rawPast = await fetchJsonSafe('https://www.nseindia.com/api/public-past-issues');
    pastIpos = normalizePast(rawPast, cmpMap);
    console.log(`✓ Synced Past / Listed IPOs: ${pastIpos.length}`);
  } catch (err) {
    console.warn('Past IPOs fetch notice:', err.message);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'Official NSE Mainboard & SME IPO Disclosures',
    openIpos,
    upcomingIpos,
    pastIpos
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');

  const jsContent = `/**
 * Stocks 360 - Official NSE IPO Tracker Dataset (ipo-data.js)
 * Updated: ${payload.updatedAt}
 */
const STOCKS_IPO_DATA = ${JSON.stringify(payload)};

if (typeof window !== "undefined") {
  window.STOCKS_IPO_DATA = STOCKS_IPO_DATA;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = STOCKS_IPO_DATA;
}
`;
  fs.writeFileSync(JS_OUT, jsContent, 'utf8');
  console.log(`✓ Wrote ${JSON_OUT} and ${JS_OUT}`);
}

main().catch((err) => {
  console.error('IPO Tracker sync error:', err.message);
  process.exit(1);
});
