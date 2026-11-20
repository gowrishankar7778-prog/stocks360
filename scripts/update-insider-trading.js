/**
 * Stocks 360 - Automated Official NSE SEBI PIT Insider Trading Synchronizer
 * Scheduled every weekday at 6:45 PM IST alongside Bulk & Block Deals.
 *
 * Source (100% Official NSE SEBI PIT API, Cost: Rs 0):
 * - https://www.nseindia.com/api/corporates-pit?index=equities&symbol=<SYM>
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'market');
const OUT_FILE = path.join(OUT_DIR, 'insider-trading.json');
const SCREENER_INDEX_PATH = path.join(ROOT, 'js', 'screener-index.js');
const DEALS_FILE = path.join(OUT_DIR, 'bulk-block-deals.json');

const MONTHS_IDX = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

function parseNseDateToUpper(str) {
  const s = String(str || '').trim();
  const m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const mon = m[2].toUpperCase();
  if (MONTHS_IDX[mon] === undefined) return '';
  return `${dd}-${mon}-${m[3]}`;
}

function parseNseDateMs(dateStr) {
  const m = String(dateStr || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return 0;
  const mon = MONTHS_IDX[m[2].toUpperCase()];
  if (mon === undefined) return 0;
  return Date.UTC(Number(m[3]), mon, Number(m[1]));
}

function parseNum(val) {
  const cleaned = String(val == null ? '' : val).replace(/,/g, '').trim();
  if (!cleaned || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function fetchSymbolPitJson(symbol) {
  return new Promise((resolve) => {
    const url = `https://www.nseindia.com/api/corporates-pit?index=equities&symbol=${encodeURIComponent(symbol)}`;
    const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    execFile(
      curlBin,
      [
        '-sL',
        '--max-time', '12',
        '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        '-H', 'Accept: application/json, text/plain, */*',
        '-H', 'Referer: https://www.nseindia.com/companies-listing/corporate-filings-insider-trading',
        url
      ],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout);
          return resolve(Array.isArray(parsed && parsed.data) ? parsed.data : []);
        } catch (_) {
          return resolve([]);
        }
      }
    );
  });
}

function normalizeJsonRow(r, fallbackSym) {
  const symbol = String((r && r.symbol) || fallbackSym || '').trim().toUpperCase();
  const companyName = String((r && r.company) || symbol).trim();
  const clientName = String((r && r.acqName) || '').trim();
  if (!symbol || !clientName) return null;

  const txType = String((r && r.tdpTransactionType) || '').trim().toUpperCase();
  let side = '';
  if (txType === 'BUY' || txType.includes('ACQUISITION')) side = 'BUY';
  else if (txType === 'SELL' || txType.includes('DISPOSAL')) side = 'SELL';
  else return null;

  const quantity = Math.round(parseNum(r.secAcq || r.buyQuantity || r.sellquantity));
  const valueRupees = parseNum(r.secVal || r.buyValue || r.sellValue);
  if (quantity <= 0) return null;

  const valueCr = valueRupees > 0 ? Number((valueRupees / 10000000).toFixed(2)) : 0;
  const price = valueRupees > 0 ? Number((valueRupees / quantity).toFixed(2)) : 0;
  const postPct = parseNum(r.afterAcqSharesPer);
  const category = String(r.personCategory || '').trim();
  const mode = String(r.acqMode || '').trim();
  const date = parseNseDateToUpper(r.date) || parseNseDateToUpper(r.intimDt);
  if (!date) return null;

  return {
    date,
    symbol,
    companyName: companyName || symbol,
    clientName,
    category: category || 'Insider',
    mode: mode || '-',
    dealType: category && mode ? `${category} • ${mode}` : (category || mode || 'SEBI PIT'),
    side,
    quantity,
    price,
    valueCr,
    postPct: Number.isFinite(postPct) ? Number(postPct.toFixed(2)) : null
  };
}

function tradeKey(d) {
  return `${d.date}|${d.symbol}|${d.clientName.toUpperCase()}|${d.side}|${d.quantity}|${d.valueCr}`;
}

function getTargetSymbols(limit = 200) {
  const set = new Set();
  if (fs.existsSync(DEALS_FILE)) {
    try {
      const deals = JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
      for (const d of deals.deals || []) {
        if (d && d.symbol) set.add(String(d.symbol).toUpperCase());
      }
    } catch (_) {}
  }

  const { STOCKS_SCREENER_DATASET } = require(SCREENER_INDEX_PATH);
  const nseStocks = (Array.isArray(STOCKS_SCREENER_DATASET) ? STOCKS_SCREENER_DATASET : [])
    .filter((s) => s && s.exchanges !== 'BSE' && s.symbol)
    .sort((a, b) => (b.marketCapCr || 0) - (a.marketCapCr || 0));

  for (const s of nseStocks) {
    set.add(String(s.symbol).toUpperCase());
    if (set.size >= limit) break;
  }
  return Array.from(set);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const symbols = getTargetSymbols(200);
  const freshRows = [];
  const CHUNK = 16;

  for (let i = 0; i < symbols.length; i += CHUNK) {
    const batch = symbols.slice(i, i + CHUNK);
    const results = await Promise.all(batch.map((sym) => fetchSymbolPitJson(sym).then((arr) => ({ sym, arr }))));
    for (const { sym, arr } of results) {
      for (const row of arr) {
        const norm = normalizeJsonRow(row, sym);
        if (norm) freshRows.push(norm);
      }
    }
  }
  console.log(`✓ Fetched NSE SEBI PIT Insider Trading across ${symbols.length} NSE equities: ${freshRows.length} Buy/Sell disclosures`);

  let existingRows = [];
  if (fs.existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      if (Array.isArray(prev.deals)) existingRows = prev.deals;
    } catch (_) {}
  }

  const deduped = new Map();
  for (const row of existingRows) {
    if (row && row.symbol && row.date) deduped.set(tradeKey(row), row);
  }
  for (const row of freshRows) {
    deduped.set(tradeKey(row), row);
  }

  const merged = Array.from(deduped.values()).sort((a, b) => {
    const da = parseNseDateMs(a.date);
    const db = parseNseDateMs(b.date);
    if (db !== da) return db - da;
    return (b.valueCr || 0) - (a.valueCr || 0);
  });

  const availableDates = Array.from(new Set(merged.map((d) => d.date))).sort((a, b) => parseNseDateMs(b) - parseNseDateMs(a));
  const latestTradeDate = availableDates[0] || '';

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'Official NSE SEBI PIT Insider Trading Disclosures',
    latestTradeDate,
    availableDates,
    totalDeals: merged.length,
    deals: merged
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✓ Saved ${merged.length} Insider Trading disclosures across ${availableDates.length} dates (Latest: ${latestTradeDate})`);
}

main().catch((err) => {
  console.error('Insider Trading sync error:', err.message);
  process.exit(1);
});
