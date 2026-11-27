/**
 * Stocks 360 - Automated NSE Stock Prices & Indicators Synchronizer (100% Official NSE Bhavcopy)
 * Runs automatically every weekday (Mon-Fri) at 4:45 PM IST (after NSE market close at 3:30 PM).
 *
 * Capabilities:
 * - Downloads official NSE UDiFF Bhavcopy ZIP directly from nsearchives.nseindia.com
 * - Extracts closing prices, OHLC, previous close, and trading volume for ALL NSE equities in 1 request
 * - Updates 50-DMA, 200-DMA, Golden Crossover, 52W High/Low, and Volume Surge
 * - Updates js/screener-index.js (and js/screener-data.js if present locally)
 * - Zero Yahoo Finance dependency & zero external npm dependencies (uses native Node.js https + zlib)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const {
  loadScreenerDataset,
  writeScreenerIndex,
  writeScreenerDataIfPresent,
  syncMarketSummaryToFirestore
} = require('./lib/screener-store');
const { computeComprehensiveTechnicals } = require('./lib/technicals-engine');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'market', 'nse-ohlcv-history.json.gz');
const PROFILES_DIR = path.join(__dirname, '..', 'data', 'profiles');
const MAX_OHLCV_BARS = 220;

function toIsoDate(ddmmyyyy) {
  const parts = String(ddmmyyyy || '').split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : ddmmyyyy;
}

function getProfileShardName(symbol) {
  const ch = String(symbol || '').trim().toUpperCase().charAt(0);
  return /^[A-Z]$/.test(ch) ? `${ch}.json` : '0-9.json';
}

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

async function fetchLatestNseBhavcopy() {
  // Walk back up to 7 calendar days in IST to find the most recent trading session Bhavcopy
  const nowUtc = Date.now();
  const istNow = new Date(nowUtc + 5.5 * 3600 * 1000);

  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const d = new Date(istNow.getTime() - daysBack * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yyyymmdd = `${yyyy}${mm}${dd}`;
    const url = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${yyyymmdd}_F_0000.csv.zip`;

    const res = await fetchBuffer(url);
    if (res.status === 200 && res.buffer && res.buffer.length > 500) {
      const csvText = unzipFirstEntry(res.buffer);
      const lines = csvText.split(/\r?\n/).filter(Boolean);
      if (lines.length > 10) {
        console.log(`✓ Downloaded official NSE Bhavcopy for ${dd}-${mm}-${yyyy} (${lines.length - 1} rows)`);
        return { csvLines: lines, tradeDate: `${dd}-${mm}-${yyyy}` };
      }
    }
  }
  return null;
}

function parseBhavcopyMap(csvLines) {
  const headers = parseCsvLine(csvLines[0]);
  const idx = {
    symbol: headers.indexOf('TckrSymb'),
    series: headers.indexOf('SctySrs'),
    open: headers.indexOf('OpnPric'),
    high: headers.indexOf('HghPric'),
    low: headers.indexOf('LwPric'),
    close: headers.indexOf('ClsPric'),
    last: headers.indexOf('LastPric'),
    prevClose: headers.indexOf('PrvsClsgPric'),
    volume: headers.indexOf('TtlTradgVol')
  };

  const map = new Map();
  const allowedSeries = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST']);

  for (let i = 1; i < csvLines.length; i++) {
    const cols = parseCsvLine(csvLines[i]);
    const symbol = (cols[idx.symbol] || '').toUpperCase();
    const series = (cols[idx.series] || '').toUpperCase();
    if (!symbol || !allowedSeries.has(series)) continue;

    // Prefer EQ series if a symbol appears in multiple series
    if (map.has(symbol) && series !== 'EQ') continue;

    const close = Number(cols[idx.close]) || Number(cols[idx.last]) || 0;
    if (close <= 0) continue;

    const prevClose = Number(cols[idx.prevClose]) || close;
    const open = Number(cols[idx.open]) || close;
    const high = Number(cols[idx.high]) || close;
    const low = Number(cols[idx.low]) || close;
    const volume = Math.round(Number(cols[idx.volume]) || 0);

    const dayChange = Number((close - prevClose).toFixed(2));
    const dayChangePct = prevClose > 0 ? Number(((dayChange / prevClose) * 100).toFixed(2)) : 0;

    map.set(symbol, {
      cmp: close,
      dayOpen: open,
      dayHigh: high,
      dayLow: low,
      prevClose,
      dayChange,
      dayChangePct,
      isGain: dayChange >= 0,
      volume
    });
  }
  return map;
}

async function fetchLatestNseDeliveryMap() {
  const nowUtc = Date.now();
  const istNow = new Date(nowUtc + 5.5 * 3600 * 1000);

  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const d = new Date(istNow.getTime() - daysBack * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${yyyy}.csv`;

    const res = await fetchBuffer(url);
    if (res.status === 200 && res.buffer && res.buffer.length > 500) {
      const csvText = res.buffer.toString('utf8');
      const lines = csvText.split(/\r?\n/).filter(Boolean);
      if (lines.length < 10) continue;

      const headers = parseCsvLine(lines[0]).map((h) => h.toUpperCase());
      const symIdx = headers.indexOf('SYMBOL');
      const serIdx = headers.indexOf('SERIES');
      const ttlQtyIdx = headers.indexOf('TTL_TRD_QNTY');
      const delivQtyIdx = headers.indexOf('DELIV_QTY');
      const delivPctIdx = headers.indexOf('DELIV_PER');
      if (symIdx === -1 || delivQtyIdx === -1 || delivPctIdx === -1) continue;

      const allowedSeries = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST']);
      const t2tSeries = new Set(['BE', 'BZ', 'SM', 'ST']);
      const map = new Map();

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const symbol = (cols[symIdx] || '').toUpperCase();
        const series = serIdx !== -1 ? (cols[serIdx] || '').toUpperCase() : 'EQ';
        if (!symbol || !allowedSeries.has(series)) continue;
        if (map.has(symbol) && series !== 'EQ') continue;

        let delivQty = Number(cols[delivQtyIdx]);
        let delivPct = Number(cols[delivPctIdx]);

        // NSE marks Trade-to-Trade (BE, BZ, SM, ST) delivery columns as '-' because 100% of traded quantity is compulsory delivery
        if ((!Number.isFinite(delivQty) || delivQty <= 0) && t2tSeries.has(series) && ttlQtyIdx !== -1) {
          const ttlQty = Number(cols[ttlQtyIdx]);
          if (Number.isFinite(ttlQty) && ttlQty > 0) {
            delivQty = ttlQty;
            delivPct = 100;
          }
        }

        if (!Number.isFinite(delivQty) || delivQty <= 0 || !Number.isFinite(delivPct) || delivPct <= 0 || delivPct > 100) {
          continue;
        }

        map.set(symbol, {
          deliveryVolume: Math.round(delivQty),
          deliveryPct: Number(delivPct.toFixed(2))
        });
      }

      if (map.size > 50) {
        console.log(`✓ Downloaded official NSE Delivery data for ${dd}-${mm}-${yyyy} (${map.size} symbols)`);
        return { map, tradeDate: `${dd}-${mm}-${yyyy}` };
      }
    }
  }
  return null;
}

async function updateAllStocks() {
  console.log('Stocks 360: Starting 100% Official NSE Bhavcopy stock synchronizer...');
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const lastUpdatedLabel = `Today (${dateString}), ${timeString} IST`;

  let stocks, defsContent, sourcePath;
  try {
    ({ stocks, defsContent, sourcePath } = loadScreenerDataset());
    console.log(`Loaded ${stocks.length} stocks from ${sourcePath}`);
  } catch (e) {
    console.error('Failed to load stock dataset:', e.message);
    process.exit(1);
  }

  const bhav = await fetchLatestNseBhavcopy();
  if (!bhav) {
    console.warn('Warning: NSE Bhavcopy unavailable right now. Leaving existing stock prices untouched.');
    return;
  }

  const nseMap = parseBhavcopyMap(bhav.csvLines);
  console.log(`Parsed ${nseMap.size} active NSE equity quotes from official Bhavcopy (${bhav.tradeDate}).`);

  const delivRes = await fetchLatestNseDeliveryMap();
  const delivMap = delivRes ? delivRes.map : new Map();

  let historyMap = {};
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      historyMap = JSON.parse(zlib.gunzipSync(fs.readFileSync(HISTORY_FILE)).toString('utf8'));
    } catch (e) {
      console.warn('Warning: Could not read OHLCV history cache:', e.message);
    }
  }
  const isoTradeDate = toIsoDate(bhav.tradeDate);
  const shardUpdates = new Map();

  const updateLimit = process.env.UPDATE_LIMIT ? parseInt(process.env.UPDATE_LIMIT, 10) : stocks.length;
  let updatedCount = 0;

  for (let i = 0; i < Math.min(updateLimit, stocks.length); i++) {
    const s = stocks[i];
    const sym = String(s.symbol || '').toUpperCase();
    const fresh = nseMap.get(sym);
    const deliv = delivMap.get(sym);

    if (deliv) {
      s.deliveryVolume = deliv.deliveryVolume;
      s.deliveryPct = deliv.deliveryPct;
    }

    if (fresh && fresh.cmp > 0) {
      if (typeof s.sharesCr === 'number' && s.sharesCr > 0) {
        s.marketCapCr = Math.round(fresh.cmp * s.sharesCr);
      } else {
        const priceRatio = s.cmp > 0 ? (fresh.cmp / s.cmp) : 1;
        if (priceRatio > 0.5 && priceRatio < 2.0 && typeof s.marketCapCr === 'number' && s.marketCapCr > 0) {
          s.marketCapCr = Math.round(s.marketCapCr * priceRatio);
        }
      }
      if (typeof s.ttmEps === 'number' && s.ttmEps > 0) {
        const rawPe = fresh.cmp / s.ttmEps;
        if (rawPe > 0 && rawPe < 2000) {
          s.pe = Number(rawPe.toFixed(1));
        }
      } else {
        const priceRatio = s.cmp > 0 ? (fresh.cmp / s.cmp) : 1;
        if (priceRatio > 0.5 && priceRatio < 2.0 && typeof s.pe === 'number' && s.pe > 0) {
          s.pe = Number((s.pe * priceRatio).toFixed(1));
        }
      }

      s.cmp = fresh.cmp;
      s.dayOpen = fresh.dayOpen;
      s.dayHigh = fresh.dayHigh;
      s.dayLow = fresh.dayLow;
      s.prevClose = fresh.prevClose;
      s.dayChange = fresh.dayChange;
      s.dayChangePct = fresh.dayChangePct;
      s.isGain = fresh.isGain;
      s.high52 = s.high52 > 0 ? Math.max(s.high52, fresh.dayHigh) : fresh.dayHigh;
      s.low52 = s.low52 > 0 ? Math.min(s.low52, fresh.dayLow) : fresh.dayLow;

      // Update moving averages & volume surge incrementally using NSE EOD data
      if (fresh.volume > 0) {
        s.avgVolume = s.avgVolume > 0
          ? Number(((s.avgVolume * 9 + fresh.volume) / 10).toFixed(1))
          : fresh.volume;
        s.volume = fresh.volume;
        s.volumeSurge = s.avgVolume > 0 ? Number((fresh.volume / s.avgVolume).toFixed(2)) : 1.0;
      }

      if (s.dma50 > 0) {
        s.dma50 = Number(((s.dma50 * 49 + fresh.cmp) / 50).toFixed(2));
      } else {
        s.dma50 = fresh.cmp;
      }
      if (s.dma200 > 0) {
        s.dma200 = Number(((s.dma200 * 199 + fresh.cmp) / 200).toFixed(2));
      } else {
        s.dma200 = fresh.cmp;
      }

      // Append today's bar to rolling 220-day OHLCV cache and recompute exact technicals
      if (!Array.isArray(historyMap[sym])) historyMap[sym] = [];
      const arr = historyMap[sym];
      const newBar = [isoTradeDate, fresh.dayOpen, fresh.dayHigh, fresh.dayLow, fresh.cmp, fresh.volume || 0];
      if (arr.length > 0 && arr[arr.length - 1][0] === isoTradeDate) {
        arr[arr.length - 1] = newBar;
      } else {
        arr.push(newBar);
      }
      if (arr.length > MAX_OHLCV_BARS) {
        historyMap[sym] = arr.slice(-MAX_OHLCV_BARS);
      }

      const tech = computeComprehensiveTechnicals(
        historyMap[sym].map(([d, o, h, l, c, v]) => ({ d, o, h, l, c, v }))
      );
      if (tech) {
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
        if (!shardUpdates.has(shardName)) shardUpdates.set(shardName, []);
        shardUpdates.get(shardName).push({ sym, tech });
      }

      s.goldenCross = s.dma50 > s.dma200 && s.cmp > s.dma50;
      s.lastUpdated = lastUpdatedLabel;
      updatedCount++;
    } else {
      s.lastUpdated = lastUpdatedLabel;
    }
  }

  console.log(`✓ Updated ${updatedCount} / ${Math.min(updateLimit, stocks.length)} NSE stocks from official Bhavcopy (${bhav.tradeDate}).`);

  if (Object.keys(historyMap).length > 0) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, zlib.gzipSync(JSON.stringify(historyMap)));
  }

  for (const [shardName, items] of shardUpdates.entries()) {
    const shardPath = path.join(PROFILES_DIR, shardName);
    let shardData = {};
    if (fs.existsSync(shardPath)) {
      try { shardData = JSON.parse(fs.readFileSync(shardPath, 'utf8')); } catch (_) {}
    }
    for (const { sym, tech } of items) {
      if (!shardData[sym] || typeof shardData[sym] !== 'object') shardData[sym] = { symbol: sym };
      shardData[sym].technicals = tech;
    }
    fs.writeFileSync(shardPath, JSON.stringify(shardData));
  }
  console.log(`✓ Updated comprehensive technicals across ${shardUpdates.size} profile shards.`);

  if (writeScreenerDataIfPresent(stocks, defsContent, 'Automatically synchronized from Official NSE Bhavcopy.', lastUpdatedLabel)) {
    console.log(`✓ Updated js/screener-data.js`);
  }

  const indexBytes = writeScreenerIndex(stocks, defsContent, lastUpdatedLabel);
  console.log(`✓ Rebuilt js/screener-index.js (${(indexBytes / 1024).toFixed(1)} KB) with official NSE Bhavcopy prices!`);

  await syncMarketSummaryToFirestore(stocks, lastUpdatedLabel);
}

updateAllStocks().catch((err) => {
  console.error('Fatal stock sync error:', err.message);
  process.exit(1);
});
