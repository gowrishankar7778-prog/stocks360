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
const zlib = require('zlib');

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

async function fetchNseIndices() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/'
  };

  const res = await fetch('https://www.nseindia.com/api/allIndices', { headers });
  if (!res.ok) {
    throw new Error(`NSE allIndices HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json && json.data) ? json.data : [];

  const priorityOrder = [
    'NIFTY 50', 'NIFTY NEXT 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY FIN SERVICE',
    'NIFTY AUTO', 'NIFTY PHARMA', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY ENERGY',
    'NIFTY REALTY', 'NIFTY PSU BANK', 'NIFTY MIDCAP 150', 'NIFTY SMALLCAP 250',
    'NIFTY 500', 'INDIA VIX'
  ];
  const rankMap = new Map(priorityOrder.map((name, idx) => [name, idx]));

  return rows
    .filter((r) => r && r.index && typeof r.last === 'number')
    .map((r) => ({
      index: String(r.index).trim(),
      key: String(r.key || '').trim(),
      last: Number(r.last.toFixed(2)),
      variation: typeof r.variation === 'number' ? Number(r.variation.toFixed(2)) : 0,
      percentChange: typeof r.percentChange === 'number' ? Number(r.percentChange.toFixed(2)) : 0,
      open: typeof r.open === 'number' ? Number(r.open.toFixed(2)) : null,
      high: typeof r.high === 'number' ? Number(r.high.toFixed(2)) : null,
      low: typeof r.low === 'number' ? Number(r.low.toFixed(2)) : null,
      previousClose: typeof r.previousClose === 'number' ? Number(r.previousClose.toFixed(2)) : null,
      yearHigh: typeof r.yearHigh === 'number' ? Number(r.yearHigh.toFixed(2)) : null,
      yearLow: typeof r.yearLow === 'number' ? Number(r.yearLow.toFixed(2)) : null,
      pe: r.pe ? toNum(r.pe) : null,
      pb: r.pb ? toNum(r.pb) : null,
      dy: r.dy ? toNum(r.dy) : null
    }))
    .sort((a, b) => {
      const ra = rankMap.has(a.index) ? rankMap.get(a.index) : 999;
      const rb = rankMap.has(b.index) ? rankMap.get(b.index) : 999;
      if (ra !== rb) return ra - rb;
      return a.index.localeCompare(b.index);
    });
}

async function fetchBseIndices() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/csv,text/plain,*/*',
    'Referer': 'https://www.bseindia.com/'
  };

  let csv = null;
  let tradeDate = '';
  const now = new Date();
  for (let offset = 0; offset <= 6; offset++) {
    const dt = new Date(now.getTime() - offset * 86400000);
    const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const d = String(ist.getDate()).padStart(2, '0');
    const m = String(ist.getMonth() + 1).padStart(2, '0');
    const y = ist.getFullYear();
    const url = `https://www.bseindia.com/bsedata/Index_Bhavcopy/INDEXSUMMARY_${d}${m}${y}.csv`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('IndexName') && text.includes('ClosePrice')) {
          csv = text;
          tradeDate = `${y}-${m}-${d}`;
          break;
        }
      }
    } catch (_) {}
  }

  if (!csv) {
    throw new Error('Could not fetch recent BSE Index Summary CSV');
  }

  const priority = [
    'BSE SENSEX', 'BSE 100', 'BSE 200', 'BSE 500', 'BSE MIDCAP', 'BSE SMALLCAP',
    'BSE BANKEX', 'BSE IT', 'BSE AUTO', 'BSE HEALTHCARE', 'BSE FMCG', 'BSE METAL',
    'BSE OIL & GAS', 'BSE POWER', 'BSE REALTY', 'BSE CAPITAL GOODS'
  ];
  const rankMap = new Map(priority.map((name, idx) => [name, idx]));

  const lines = csv.split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const indexName = String(cols[2] || '').replace(/"/g, '').trim();
    const prev = toNum(cols[3]);
    const open = toNum(cols[4]);
    const high = toNum(cols[5]);
    const low = toNum(cols[6]);
    const last = toNum(cols[7]);
    const yearHigh = toNum(cols[8]);
    const yearLow = toNum(cols[9]);
    if (!indexName || last == null || last <= 0) continue;
    const variation = prev != null && prev > 0 ? Number((last - prev).toFixed(2)) : 0;
    const percentChange = prev != null && prev > 0 ? Number(((variation / prev) * 100).toFixed(2)) : 0;

    out.push({
      index: indexName,
      tradeDate,
      last,
      variation,
      percentChange,
      open,
      high,
      low,
      previousClose: prev,
      yearHigh,
      yearLow,
      pe: null
    });
  }

  return out.sort((a, b) => {
    const ra = rankMap.has(a.index.toUpperCase()) ? rankMap.get(a.index.toUpperCase()) : 999;
    const rb = rankMap.has(b.index.toUpperCase()) ? rankMap.get(b.index.toUpperCase()) : 999;
    if (ra !== rb) return ra - rb;
    return a.index.localeCompare(b.index);
  });
}

async function fetchNseCircuits(stocks) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/csv,text/plain,*/*',
    'Referer': 'https://www.nseindia.com/'
  };

  const res = await fetch('https://nsearchives.nseindia.com/content/equities/sec_list.csv', { headers });
  if (!res.ok) {
    throw new Error(`NSE sec_list.csv HTTP ${res.status}`);
  }
  const csv = await res.text();
  const lines = csv.split(/\r?\n/);
  const bandMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 4) continue;
    const sym = String(parts[0] || '').replace(/"/g, '').trim().toUpperCase();
    const band = parseFloat(String(parts[3] || '').replace(/"/g, '').trim());
    if (sym && Number.isFinite(band) && band > 0 && band <= 20) {
      bandMap.set(sym, band);
    }
  }

  const upperCircuit = [];
  const lowerCircuit = [];

  for (const s of stocks) {
    if (!s || s.exchanges === 'BSE') continue;
    const sym = String(s.symbol || '').toUpperCase();
    const band = bandMap.get(sym);
    if (!band) continue;
    const cmp = typeof s.cmp === 'number' ? s.cmp : 0;
    const prev = typeof s.prevClose === 'number' ? s.prevClose : 0;
    const dayHigh = typeof s.dayHigh === 'number' ? s.dayHigh : cmp;
    const dayLow = typeof s.dayLow === 'number' ? s.dayLow : cmp;
    const vol = typeof s.volume === 'number' ? s.volume : 0;
    if (cmp <= 0 || prev <= 0 || vol <= 0) continue;

    const tol = Math.max(0.05, prev * 0.0018);
    const upperTarget = prev * (1 + band / 100);
    const lowerTarget = prev * (1 - band / 100);

    if (cmp >= upperTarget - tol && Math.abs(cmp - dayHigh) <= tol) {
      upperCircuit.push({
        symbol: sym,
        name: s.name,
        cmp,
        dayChangePct: s.dayChangePct || Number((((cmp - prev) / prev) * 100).toFixed(2)),
        bandPct: band,
        volume: vol
      });
    } else if (cmp <= lowerTarget + tol && Math.abs(cmp - dayLow) <= tol) {
      lowerCircuit.push({
        symbol: sym,
        name: s.name,
        cmp,
        dayChangePct: s.dayChangePct || Number((((cmp - prev) / prev) * 100).toFixed(2)),
        bandPct: band,
        volume: vol
      });
    }
  }

  upperCircuit.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  lowerCircuit.sort((a, b) => (b.volume || 0) - (a.volume || 0));

  return {
    bandCount: bandMap.size,
    upperCircuit: upperCircuit.slice(0, 30),
    lowerCircuit: lowerCircuit.slice(0, 30)
  };
}

function extractFirstCsvFromZip(buf) {
  let eocdOffset = -1;
  for (let i = Math.max(0, buf.length - 65558); i <= buf.length - 22; i++) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP End-of-Central-Directory not found');
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('Invalid ZIP Central Directory');
  const compMethod = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
  const lfhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
  const lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
  const compressed = buf.subarray(dataStart, dataStart + compSize);
  return (compMethod === 8 ? zlib.inflateRawSync(compressed) : compressed).toString('utf8');
}

function parseUdiffFoCsv(csv, matchedDate) {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] || '').split(',').map((h) => h.trim());
  const idxTp = header.indexOf('FinInstrmTp');
  const idxSym = header.indexOf('TckrSymb');
  const idxOpt = header.indexOf('OptnTp');
  const idxOi = header.indexOf('OpnIntrst');
  const idxChgOi = header.indexOf('ChngInOpnIntrst');
  const idxVol = header.indexOf('TtlTradgVol');
  const idxUnd = header.indexOf('UndrlygPric');

  const aggMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const tp = (cols[idxTp] || '').trim();
    const sym = (cols[idxSym] || '').trim().toUpperCase();
    if (!sym || !tp) continue;
    const isIndex = tp === 'IDO' || tp === 'IDF';
    const opt = (cols[idxOpt] || '').trim().toUpperCase();
    const oi = Number(cols[idxOi]) || 0;
    const chgOi = Number(cols[idxChgOi]) || 0;
    const vol = Number(cols[idxVol]) || 0;
    const und = Number(cols[idxUnd]) || 0;

    if (!aggMap.has(sym)) {
      aggMap.set(sym, {
        symbol: sym,
        isIndex,
        underlyingPrice: und > 0 ? und : null,
        ceOi: 0,
        peOi: 0,
        futOi: 0,
        totalChgOi: 0,
        totalVol: 0
      });
    }
    const rec = aggMap.get(sym);
    if (und > 0 && !rec.underlyingPrice) rec.underlyingPrice = und;
    if (opt === 'CE') rec.ceOi += oi;
    else if (opt === 'PE') rec.peOi += oi;
    else rec.futOi += oi;
    rec.totalChgOi += chgOi;
    rec.totalVol += vol;
  }

  const all = Array.from(aggMap.values()).map((r) => {
    const totalOi = r.ceOi + r.peOi + r.futOi;
    const prevOi = totalOi - r.totalChgOi;
    const chgOiPct = prevOi > 0 ? Number(((r.totalChgOi / prevOi) * 100).toFixed(2)) : 0;
    return {
      symbol: r.symbol,
      isIndex: r.isIndex,
      underlyingPrice: r.underlyingPrice,
      ceOi: r.ceOi,
      peOi: r.peOi,
      futOi: r.futOi,
      totalOi,
      totalChgOi: r.totalChgOi,
      chgOiPct,
      pcrOi: r.ceOi > 0 ? Number((r.peOi / r.ceOi).toFixed(2)) : null
    };
  });

  const indexPcr = all
    .filter((r) => r.isIndex && r.totalOi > 0)
    .sort((a, b) => b.totalOi - a.totalOi);

  const stockFo = all.filter((r) => !r.isIndex && r.totalOi > 0);
  const topStockOi = stockFo
    .slice()
    .sort((a, b) => b.totalOi - a.totalOi)
    .slice(0, 20);
  const topOiGainers = stockFo
    .filter((r) => r.chgOiPct > 0 && r.totalOi >= 100000)
    .sort((a, b) => b.chgOiPct - a.chgOiPct)
    .slice(0, 15);

  return {
    tradeDate: matchedDate,
    indexPcr,
    topStockOi,
    topOiGainers
  };
}

async function fetchNseFoSnapshot() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Referer': 'https://www.nseindia.com/all-reports-derivatives'
  };

  const now = new Date();
  for (let offset = 0; offset <= 6; offset++) {
    const dt = new Date(now.getTime() - offset * 86400000);
    const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const y = ist.getFullYear();
    const m = String(ist.getMonth() + 1).padStart(2, '0');
    const d = String(ist.getDate()).padStart(2, '0');
    const yyyymmdd = `${y}${m}${d}`;
    const url = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${yyyymmdd}_F_0000.csv.zip`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        const csv = extractFirstCsvFromZip(Buffer.from(ab));
        return parseUdiffFoCsv(csv, `${y}-${m}-${d}`);
      }
    } catch (_) {}
  }

  throw new Error('Could not fetch recent NSE F&O Bhavcopy ZIP');
}

async function fetchBseFoSnapshot() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/csv,text/plain,*/*',
    'Referer': 'https://www.bseindia.com/'
  };

  const now = new Date();
  for (let offset = 0; offset <= 6; offset++) {
    const dt = new Date(now.getTime() - offset * 86400000);
    const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const y = ist.getFullYear();
    const m = String(ist.getMonth() + 1).padStart(2, '0');
    const d = String(ist.getDate()).padStart(2, '0');
    const yyyymmdd = `${y}${m}${d}`;
    const url = `https://www.bseindia.com/download/BhavCopy/Derivative/BhavCopy_BSE_FO_0_0_0_${yyyymmdd}_F_0000.CSV`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const csv = await res.text();
        if (csv && csv.includes('FinInstrmTp') && csv.includes('OpnIntrst')) {
          return parseUdiffFoCsv(csv, `${y}-${m}-${d}`);
        }
      }
    } catch (_) {}
  }

  throw new Error('Could not fetch recent BSE F&O Bhavcopy CSV');
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

    if (high52 > 0 && low52 > 0 && high52 > low52 * 1.02) {
      if (dayHigh >= high52 || cmp >= high52 * 0.99) {
        nearHigh52++;
      }
      if (dayLow <= low52 || cmp <= low52 * 1.01) {
        nearLow52++;
      }
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

  const { STOCKS_SCREENER_DATASET } = require(SCREENER_INDEX_PATH);
  const allStocks = Array.isArray(STOCKS_SCREENER_DATASET) ? STOCKS_SCREENER_DATASET : [];

  const breadth = computeMarketBreadth();
  console.log(`✓ Computed Market Breadth across ${breadth.totalStocks} stocks: Adv ${breadth.advances} / Dec ${breadth.declines} (A/D ${breadth.adRatio})`);

  let existingIndices = [];
  let existingBseIndices = [];
  let existingUpper = [];
  let existingLower = [];
  let existingFo = null;
  let existingBseFo = null;
  if (fs.existsSync(JSON_OUT)) {
    try {
      const prev = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
      if (Array.isArray(prev.nseIndices)) existingIndices = prev.nseIndices;
      if (Array.isArray(prev.bseIndices)) existingBseIndices = prev.bseIndices;
      if (Array.isArray(prev.nseUpperCircuit)) existingUpper = prev.nseUpperCircuit;
      if (Array.isArray(prev.nseLowerCircuit)) existingLower = prev.nseLowerCircuit;
      if (prev.nseFoSnapshot) existingFo = prev.nseFoSnapshot;
      if (prev.bseFoSnapshot) existingBseFo = prev.bseFoSnapshot;
    } catch (_) {}
  }

  let nseIndices = existingIndices;
  try {
    nseIndices = await fetchNseIndices();
    console.log(`✓ Synced ${nseIndices.length} official NSE Indices`);
  } catch (err) {
    console.warn('NSE Indices fetch notice:', err.message);
  }

  let bseIndices = existingBseIndices;
  try {
    bseIndices = await fetchBseIndices();
    console.log(`✓ Synced ${bseIndices.length} official BSE Indices (${bseIndices[0] ? bseIndices[0].tradeDate : ''})`);
  } catch (err) {
    console.warn('BSE Indices fetch notice:', err.message);
  }

  let nseUpperCircuit = existingUpper;
  let nseLowerCircuit = existingLower;
  try {
    const circuits = await fetchNseCircuits(allStocks);
    nseUpperCircuit = circuits.upperCircuit;
    nseLowerCircuit = circuits.lowerCircuit;
    console.log(`✓ Computed NSE Circuits (${circuits.bandCount} bands): Upper=${nseUpperCircuit.length}, Lower=${nseLowerCircuit.length}`);
  } catch (err) {
    console.warn('NSE Circuits fetch notice:', err.message);
  }

  let nseFoSnapshot = existingFo;
  try {
    nseFoSnapshot = await fetchNseFoSnapshot();
    console.log(`✓ Synced NSE F&O Bhavcopy (${nseFoSnapshot.tradeDate}): ${nseFoSnapshot.indexPcr.length} indices, ${nseFoSnapshot.topStockOi.length} top OI stocks`);
  } catch (err) {
    console.warn('NSE F&O Bhavcopy fetch notice:', err.message);
  }

  let bseFoSnapshot = existingBseFo;
  try {
    bseFoSnapshot = await fetchBseFoSnapshot();
    console.log(`✓ Synced BSE F&O Bhavcopy (${bseFoSnapshot.tradeDate}): ${bseFoSnapshot.indexPcr.length} indices, ${bseFoSnapshot.topStockOi.length} top OI stocks`);
  } catch (err) {
    console.warn('BSE F&O Bhavcopy fetch notice:', err.message);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'Official NSE & BSE Market Data, FII/DII, Indices, Price Bands, and Derivatives Records',
    fiiDiiLatest: latestFiiDii,
    fiiDiiHistory: existingHistory,
    breadth,
    nseIndices,
    bseIndices,
    nseUpperCircuit,
    nseLowerCircuit,
    nseFoSnapshot,
    bseFoSnapshot
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
