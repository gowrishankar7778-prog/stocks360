/**
 * Stocks 360 - Official NSE FII/DII Activity & Market Breadth Synchronizer
 * Sources:
 *  - Official NSE FII/DII Cash Trading Activity API (`https://www.nseindia.com/api/fiidiiTradeReact`)
 *  - Official Exchange Bhavcopy / Lightweight Screener Index (`js/screener-index.js`)
 * Outputs:
 *  - data/market-pulse.json (persistent daily FII/DII history + latest market breadth)
 *  - js/market-pulse-data.js (instant frontend bundle `window.STOCKS_MARKET_PULSE`)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const JSON_OUT = path.join(DATA_DIR, 'market-pulse.json');
const JS_OUT = path.join(ROOT, 'js', 'market-pulse-data.js');
const SCREENER_INDEX_PATH = path.join(ROOT, 'js', 'screener-index.js');

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

function toIsoDate(nseDateStr) {
  const m = String(nseDateStr || '').trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return '';
  const mon = MONTHS[m[2].toUpperCase()];
  return mon ? `${m[3]}-${mon}-${m[1]}` : '';
}

function toNum(val) {
  const n = Number(String(val || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

async function fetchNseFiiDii() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/reports/fii-dii'
  };

  let res = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', { headers });
  if (!res.ok) {
    // Warm up NSE session cookie and retry once
    const warm = await fetch('https://www.nseindia.com/', { headers });
    const setCookie = warm.headers.get('set-cookie');
    if (setCookie) {
      headers.Cookie = setCookie.split(',').map((c) => c.split(';')[0]).join('; ');
    }
    res = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', { headers });
  }
  if (!res.ok) {
    throw new Error(`NSE FII/DII HTTP ${res.status}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('NSE FII/DII returned empty dataset');
  }

  let dateDisplay = '';
  let isoDate = '';
  let fii = null;
  let dii = null;

  for (const row of rows) {
    const cat = String(row.category || '').toUpperCase();
    if (!dateDisplay && row.date) {
      dateDisplay = String(row.date).trim();
      isoDate = toIsoDate(dateDisplay);
    }
    const entry = {
      buyCr: toNum(row.buyValue),
      sellCr: toNum(row.sellValue),
      netCr: toNum(row.netValue)
    };
    if (cat.includes('FII') || cat.includes('FPI')) {
      fii = entry;
    } else if (cat.includes('DII')) {
      dii = entry;
    }
  }

  if (!isoDate || (!fii && !dii)) {
    throw new Error('Could not parse FII/DII rows from NSE response');
  }

  const combinedNetCr = Number(
    (((fii && typeof fii.netCr === 'number') ? fii.netCr : 0) +
      ((dii && typeof dii.netCr === 'number') ? dii.netCr : 0)).toFixed(2)
  );

  return {
    date: isoDate,
    dateDisplay,
    fii,
    dii,
    combinedNetCr
  };
}

function computeMarketBreadth() {
  const { STOCKS_SCREENER_DATASET } = require(SCREENER_INDEX_PATH);
  const stocks = Array.isArray(STOCKS_SCREENER_DATASET) ? STOCKS_SCREENER_DATASET : [];

  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let nearHigh52 = 0;
  let nearLow52 = 0;
  let goldenCrossCount = 0;
  let aboveDma200 = 0;
  let sessionLabel = '';
  const sectorMap = new Map();

  for (const s of stocks) {
    if (!sessionLabel && s.lastUpdated) sessionLabel = String(s.lastUpdated);

    const chg = typeof s.dayChange === 'number' ? s.dayChange : 0;
    const chgPct = typeof s.dayChangePct === 'number' ? s.dayChangePct : 0;
    if (chg > 0) advances++;
    else if (chg < 0) declines++;
    else unchanged++;

    const cmp = typeof s.cmp === 'number' ? s.cmp : 0;
    const high52 = typeof s.high52 === 'number' ? s.high52 : 0;
    const low52 = typeof s.low52 === 'number' ? s.low52 : 0;
    const dayHigh = typeof s.dayHigh === 'number' ? s.dayHigh : cmp;
    const dayLow = typeof s.dayLow === 'number' ? s.dayLow : cmp;

    if (high52 > 0 && (dayHigh >= high52 || cmp >= high52 * 0.99)) {
      nearHigh52++;
    }
    if (low52 > 0 && (dayLow <= low52 || cmp <= low52 * 1.01)) {
      nearLow52++;
    }
    if (s.goldenCross === true) {
      goldenCrossCount++;
    }
    if (typeof s.dma200 === 'number' && s.dma200 > 0 && cmp > s.dma200) {
      aboveDma200++;
    }

    const sec = s.sector || 'Diversified Equities';
    if (!sectorMap.has(sec)) {
      sectorMap.set(sec, { sector: sec, count: 0, sumPct: 0, adv: 0, dec: 0 });
    }
    const bucket = sectorMap.get(sec);
    bucket.count++;
    bucket.sumPct += chgPct;
    if (chg > 0) bucket.adv++;
    else if (chg < 0) bucket.dec++;
  }

  const sectorStats = Array.from(sectorMap.values())
    .filter((b) => b.count >= 5)
    .map((b) => ({
      sector: b.sector,
      count: b.count,
      avgChangePct: Number((b.sumPct / b.count).toFixed(2)),
      advances: b.adv,
      declines: b.dec
    }))
    .sort((a, b) => b.avgChangePct - a.avgChangePct);

  return {
    totalStocks: stocks.length,
    advances,
    declines,
    unchanged,
    adRatio: declines > 0 ? Number((advances / declines).toFixed(2)) : advances,
    nearHigh52,
    nearLow52,
    goldenCrossCount,
    aboveDma200,
    sessionLabel: sessionLabel || 'Latest Exchange Session',
    topSectors: sectorStats.slice(0, 4),
    laggingSectors: sectorStats.slice(-4).reverse()
  };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let existingHistory = [];
  if (fs.existsSync(JSON_OUT)) {
    try {
      const prev = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
      if (Array.isArray(prev.fiiDiiHistory)) {
        existingHistory = prev.fiiDiiHistory;
      }
    } catch (_) {}
  }

  let latestFiiDii = null;
  try {
    latestFiiDii = await fetchNseFiiDii();
    const map = new Map();
    for (const item of existingHistory) {
      if (item && item.date) map.set(item.date, item);
    }
    map.set(latestFiiDii.date, latestFiiDii);
    existingHistory = Array.from(map.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 90);
    console.log(`✓ Synced NSE FII/DII for ${latestFiiDii.dateDisplay}: FII ${latestFiiDii.fii ? latestFiiDii.fii.netCr : 'N/A'} Cr, DII ${latestFiiDii.dii ? latestFiiDii.dii.netCr : 'N/A'} Cr`);
  } catch (err) {
    console.warn('NSE FII/DII fetch notice:', err.message);
    if (existingHistory.length > 0) {
      latestFiiDii = existingHistory[0];
    }
  }

  const breadth = computeMarketBreadth();
  console.log(`✓ Computed Market Breadth across ${breadth.totalStocks} stocks: Adv ${breadth.advances} / Dec ${breadth.declines} (A/D ${breadth.adRatio})`);

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'Official NSE FII/DII Cash Activity & Exchange Bhavcopy',
    fiiDiiLatest: latestFiiDii,
    fiiDiiHistory: existingHistory,
    breadth
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');

  const jsContent = `/**
 * Stocks 360 - Market Pulse Data (FII/DII Activity & Market Breadth)
 * Source: ${payload.source}
 * Updated: ${payload.updatedAt}
 */
const STOCKS_MARKET_PULSE = ${JSON.stringify(payload)};

if (typeof window !== "undefined") {
  window.STOCKS_MARKET_PULSE = STOCKS_MARKET_PULSE;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = STOCKS_MARKET_PULSE;
}
`;
  fs.writeFileSync(JS_OUT, jsContent, 'utf8');
  console.log(`✓ Wrote ${JSON_OUT} and ${JS_OUT}`);
}

main().catch((err) => {
  console.error('Market Pulse sync error:', err.message);
  process.exit(1);
});
