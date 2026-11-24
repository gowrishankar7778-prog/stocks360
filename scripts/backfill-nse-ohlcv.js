/**
 * Stocks 360 - One-Time 220-Trading-Day NSE Bhavcopy OHLCV Backfill & Technicals Builder
 * Downloads archived daily NSE UDiFF Bhavcopy ZIPs (~220 trading sessions),
 * stores a compact rolling cache at data/market/nse-ohlcv-history.json.gz,
 * computes comprehensive Moving Averages, Indicators, Fibonacci, and Pivots,
 * and updates data/profiles/*.json and js/screener-index.js.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { loadScreenerDataset, writeScreenerIndex, writeScreenerDataIfPresent } = require('./lib/screener-store');
const { computeComprehensiveTechnicals } = require('./lib/technicals-engine');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'market', 'nse-ohlcv-history.json.gz');
const HOLIDAYS_FILE = path.join(__dirname, '..', 'data', 'market', 'nse-holidays.json');
const PROFILES_DIR = path.join(__dirname, '..', 'data', 'profiles');
const TARGET_TRADING_DAYS = 220;
const MAX_CALENDAR_DAYS = 350;

function fetchBuffer(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    if (redirectsLeft <= 0) return resolve({ status: 0, buffer: null });
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.nseindia.com/'
      },
      timeout: 20000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchBuffer(nextUrl, redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve({ status: res.statusCode, buffer: null });
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    });
    req.on('error', () => resolve({ status: 0, buffer: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, buffer: null }); });
  });
}

function unzipFirstEntry(buf) {
  if (!buf || buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Invalid ZIP buffer from NSE Bhavcopy');
  }
  const compMethod = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const payload = compSize > 0 ? buf.subarray(start, start + compSize) : buf.subarray(start);
  if (compMethod === 8) return zlib.inflateRawSync(payload).toString('utf8');
  if (compMethod === 0) return payload.toString('utf8');
  throw new Error(`Unsupported ZIP compression method: ${compMethod}`);
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseBhavcopyRows(csvLines, wantedSymbols) {
  const headers = parseCsvLine(csvLines[0]);
  const idx = {
    symbol: headers.indexOf('TckrSymb'),
    series: headers.indexOf('SctySrs'),
    open: headers.indexOf('OpnPric'),
    high: headers.indexOf('HghPric'),
    low: headers.indexOf('LwPric'),
    close: headers.indexOf('ClsPric'),
    vol: headers.indexOf('TtlTradgVol')
  };
  const out = new Map();
  const priority = { EQ: 1, BE: 2, BZ: 3, SM: 4, ST: 5 };

  for (let i = 1; i < csvLines.length; i++) {
    const cols = parseCsvLine(csvLines[i]);
    if (cols.length < 10) continue;
    const sym = (cols[idx.symbol] || '').toUpperCase();
    if (!sym || !wantedSymbols.has(sym)) continue;
    const srs = (cols[idx.series] || '').toUpperCase();
    if (!['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(srs)) continue;

    const close = parseFloat(cols[idx.close]);
    if (!Number.isFinite(close) || close <= 0) continue;

    const open = parseFloat(cols[idx.open]) || close;
    const high = parseFloat(cols[idx.high]) || close;
    const low = parseFloat(cols[idx.low]) || close;
    const vol = parseInt(cols[idx.vol], 10) || 0;

    const existing = out.get(sym);
    if (!existing || (priority[srs] || 99) < (priority[existing.srs] || 99)) {
      out.set(sym, { srs, bar: [open, high, low, close, vol] });
    }
  }
  return out;
}

function loadHolidaySet() {
  const set = new Set();
  if (fs.existsSync(HOLIDAYS_FILE)) {
    try {
      const d = JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf8'));
      for (const h of d.holidays || []) {
        if (h && h.date) set.add(h.date);
      }
    } catch (_) {}
  }
  return set;
}

function getProfileShardName(symbol) {
  const ch = String(symbol || '').trim().toUpperCase().charAt(0);
  return /^[A-Z]$/.test(ch) ? `${ch}.json` : '0-9.json';
}

async function run() {
  const { stocks, defsContent } = loadScreenerDataset();
  const wantedSymbols = new Set(stocks.map((s) => String(s.symbol || '').toUpperCase()).filter(Boolean));
  const holidays = loadHolidaySet();

  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const candidateDates = [];
  for (let daysBack = 0; daysBack < MAX_CALENDAR_DAYS; daysBack++) {
    const d = new Date(istNow.getTime() - daysBack * 86400000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    if (holidays.has(iso)) continue;
    candidateDates.push({ iso, yyyymmdd: `${yyyy}${mm}${dd}` });
  }

  console.log(`Scanning up to ${candidateDates.length} weekday candidates to collect ${TARGET_TRADING_DAYS} Bhavcopy sessions...`);

  const dayResults = [];
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < candidateDates.length && dayResults.length < TARGET_TRADING_DAYS) {
      const idx = cursor++;
      if (idx >= candidateDates.length) break;
      const item = candidateDates[idx];
      const url = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${item.yyyymmdd}_F_0000.csv.zip`;
      const res = await fetchBuffer(url);
      if (res.status === 200 && res.buffer && res.buffer.length > 500) {
        try {
          const csvText = unzipFirstEntry(res.buffer);
          const lines = csvText.split(/\r?\n/).filter(Boolean);
          if (lines.length > 50) {
            const map = parseBhavcopyRows(lines, wantedSymbols);
            dayResults.push({ date: item.iso, map });
            if (dayResults.length % 25 === 0) {
              console.log(`  Collected ${dayResults.length}/${TARGET_TRADING_DAYS} trading sessions (latest: ${item.iso})...`);
            }
          }
        } catch (_) {}
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Sort oldest -> newest
  dayResults.sort((a, b) => a.date.localeCompare(b.date));
  const trimmedDays = dayResults.slice(-TARGET_TRADING_DAYS);
  console.log(`✓ Collected ${trimmedDays.length} official NSE Bhavcopy sessions (${trimmedDays[0]?.date} to ${trimmedDays[trimmedDays.length - 1]?.date}).`);

  // Build per-symbol compact history: { SYM: [[date, o, h, l, c, v], ...] }
  const historyMap = {};
  for (const sym of wantedSymbols) {
    historyMap[sym] = [];
  }
  for (const day of trimmedDays) {
    for (const [sym, entry] of day.map.entries()) {
      historyMap[sym].push([day.date, ...entry.bar]);
    }
  }

  // Save gzipped history cache
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  const gzBuf = zlib.gzipSync(JSON.stringify(historyMap));
  fs.writeFileSync(HISTORY_FILE, gzBuf);
  console.log(`✓ Saved rolling OHLCV cache to ${path.relative(process.cwd(), HISTORY_FILE)} (${(gzBuf.length / (1024 * 1024)).toFixed(2)} MB gzipped).`);

  // Compute technicals and update screener-index + profile shards
  const shardGroups = new Map();
  let computedCount = 0;

  for (const s of stocks) {
    const sym = String(s.symbol || '').toUpperCase();
    const raw = historyMap[sym];
    if (!raw || raw.length < 5) continue;

    const bars = raw.map(([d, o, h, l, c, v]) => ({ d, o, h, l, c, v }));
    const tech = computeComprehensiveTechnicals(bars);
    if (!tech) continue;

    computedCount++;

    // Update screener-index compact fields
    const ma20 = tech.movingAverages['20'];
    const ma50 = tech.movingAverages['50'];
    const ma200 = tech.movingAverages['200'];
    if (ma50 && ma50.sma !== null) s.dma50 = ma50.sma;
    if (ma200 && ma200.sma !== null) s.dma200 = ma200.sma;
    if (tech.indicators.rsi14 !== null) s.rsi14 = tech.indicators.rsi14;
    if (tech.fibonacci) {
      if (tech.fibonacci.swingHigh > 0) s.high52 = tech.fibonacci.swingHigh;
      if (tech.fibonacci.swingLow > 0) s.low52 = tech.fibonacci.swingLow;
      s.fibZone = tech.fibonacci.zone;
    }
    s.goldenCross = Boolean(s.dma50 > 0 && s.dma200 > 0 && s.dma50 > s.dma200 && s.cmp > s.dma50);
    s.sma20 = ma20 ? ma20.sma : null;
    s.ema20 = ma20 ? ma20.ema : null;
    s.ema50 = ma50 ? ma50.ema : null;
    s.ema200 = ma200 ? ma200.ema : null;
    s.macdHist = tech.indicators.macd ? tech.indicators.macd.histogram : null;
    s.adx14 = tech.indicators.adx14;
    s.bbPct = tech.indicators.bollinger ? tech.indicators.bollinger.posPct : null;
    s.atrPct = tech.indicators.atrPct;
    s.stochK = tech.indicators.stochastic ? tech.indicators.stochastic.k : null;
    s.roc14 = tech.indicators.roc14;
    s.maBullCount = tech.maBullCount;
    s.techRating = tech.overallRating;

    const shardName = getProfileShardName(sym);
    if (!shardGroups.has(shardName)) shardGroups.set(shardName, []);
    shardGroups.get(shardName).push({ sym, tech });
  }

  for (const [shardName, items] of shardGroups.entries()) {
    const shardPath = path.join(PROFILES_DIR, shardName);
    let shardData = {};
    if (fs.existsSync(shardPath)) {
      try { shardData = JSON.parse(fs.readFileSync(shardPath, 'utf8')); } catch (_) {}
    }
    for (const { sym, tech } of items) {
      if (!shardData[sym] || typeof shardData[sym] !== 'object') {
        shardData[sym] = { symbol: sym };
      }
      shardData[sym].technicals = tech;
    }
    fs.writeFileSync(shardPath, JSON.stringify(shardData));
  }
  console.log(`✓ Updated technicals across ${shardGroups.size} profile shards (${computedCount} stocks).`);

  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const label = `${trimmedDays[trimmedDays.length - 1]?.date || nowIst.toISOString().slice(0, 10)} (NSE Bhavcopy)`;
  writeScreenerDataIfPresent(stocks, defsContent, 'Automatically synchronized from Official NSE Bhavcopy.', label);
  const indexBytes = writeScreenerIndex(stocks, defsContent, label);
  console.log(`✓ Rebuilt js/screener-index.js (${(indexBytes / (1024 * 1024)).toFixed(2)} MB).`);
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
