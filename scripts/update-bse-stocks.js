/**
 * Stocks 360 - Official BSE India Listed Equities & Daily Bhavcopy Synchronizer
 *
 * Capabilities:
 * - Downloads official BSE UDiFF Bhavcopy CSV directly from bseindia.com
 * - Matches dual-listed NSE + BSE stocks accurately by ISIN
 * - Imports all BSE-exclusive listed equities into the searchable screener index
 * - Writes sharded BSE quote files into data/bse/<A..Z,0-9>.json for instant NSE/BSE switching
 * - Zero external npm dependencies (native Node.js https)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const {
  loadScreenerDataset,
  normalizeSectorName,
  writeScreenerIndex,
  writeScreenerDataIfPresent
} = require('./lib/screener-store');

const BSE_DIR = path.join(__dirname, '..', 'data', 'bse');
const NSE_CSV_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';

if (!fs.existsSync(BSE_DIR)) {
  fs.mkdirSync(BSE_DIR, { recursive: true });
}

function fetchText(url, headers = {}, redirectsLeft = 3) {
  return new Promise((resolve) => {
    if (redirectsLeft <= 0) return resolve({ status: 0, body: '' });
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.bseindia.com/',
        ...headers
      },
      timeout: 25000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchText(nextUrl, headers, redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve({ status: res.statusCode, body: '' });
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function shardKey(symbol) {
  const c = String(symbol || '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '0-9';
}

function detectSector(name) {
  return normalizeSectorName(null, null, name);
}

async function fetchNseIsinMap() {
  const res = await fetchText(NSE_CSV_URL, { Referer: 'https://www.nseindia.com/' });
  const map = new Map();
  if (res.status !== 200 || !res.body) return map;
  const lines = res.body.split(/\r?\n/).filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const sym = (cols[0] || '').toUpperCase();
    const isin = (cols[6] || '').toUpperCase();
    if (sym && isin && isin.startsWith('IN')) {
      map.set(sym, isin);
    }
  }
  return map;
}

async function fetchLatestBseBhavcopy() {
  const nowUtc = Date.now();
  const istNow = new Date(nowUtc + 5.5 * 3600 * 1000);

  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const d = new Date(istNow.getTime() - daysBack * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yyyymmdd = `${yyyy}${mm}${dd}`;
    const url = `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyymmdd}_F_0000.CSV`;

    const res = await fetchText(url);
    if (res.status === 200 && res.body && res.body.startsWith('TradDt,')) {
      const lines = res.body.split(/\r?\n/).filter(Boolean);
      if (lines.length > 50) {
        console.log(`✓ Downloaded official BSE Bhavcopy for ${dd}-${mm}-${yyyy} (${lines.length - 1} rows)`);
        return { csvLines: lines, tradeDate: `${dd}-${mm}-${yyyy}` };
      }
    }
  }
  return null;
}

function fetchBuffer(url, headers = {}, redirectsLeft = 3) {
  return new Promise((resolve) => {
    if (redirectsLeft <= 0) return resolve({ status: 0, buffer: null });
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.bseindia.com/',
        ...headers
      },
      timeout: 25000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchBuffer(nextUrl, headers, redirectsLeft - 1));
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

function extractFirstZipEntryText(zipBuf) {
  if (!zipBuf || zipBuf.length < 30 || zipBuf.readUInt32LE(0) !== 0x04034b50) {
    return '';
  }
  const compressionMethod = zipBuf.readUInt16LE(8);
  const compSize = zipBuf.readUInt32LE(18);
  const nameLen = zipBuf.readUInt16LE(26);
  const extraLen = zipBuf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const dataEnd = compSize > 0 ? dataStart + compSize : zipBuf.length;
  const slice = zipBuf.subarray(dataStart, dataEnd);
  if (compressionMethod === 0) return slice.toString('utf8');
  if (compressionMethod === 8) return zlib.inflateRawSync(slice).toString('utf8');
  return '';
}

async function fetchLatestBseDeliveryMap() {
  const nowUtc = Date.now();
  const istNow = new Date(nowUtc + 5.5 * 3600 * 1000);

  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const d = new Date(istNow.getTime() - daysBack * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const url = `https://www.bseindia.com/BSEDATA/gross/${yyyy}/SCBSEALL${dd}${mm}.zip`;

    const res = await fetchBuffer(url);
    if (res.status === 200 && res.buffer && res.buffer.length > 500) {
      try {
        const text = extractFirstZipEntryText(res.buffer);
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 10) continue;

        const headers = lines[0].split('|').map((h) => h.trim().toUpperCase());
        const codeIdx = headers.indexOf('SCRIP CODE');
        const delivQtyIdx = headers.indexOf('DELIVERY QTY');
        const delivPctIdx = headers.indexOf('DELV. PER.');
        if (codeIdx === -1 || delivQtyIdx === -1 || delivPctIdx === -1) continue;

        const map = new Map();
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split('|');
          const code = String(cols[codeIdx] || '').trim();
          const delivQty = Number(cols[delivQtyIdx]);
          const delivPct = Number(cols[delivPctIdx]);
          if (!code || !Number.isFinite(delivQty) || delivQty <= 0 || !Number.isFinite(delivPct) || delivPct <= 0 || delivPct > 100) {
            continue;
          }
          map.set(code, {
            deliveryVolume: Math.round(delivQty),
            deliveryPct: Number(delivPct.toFixed(2))
          });
        }
        if (map.size > 50) {
          console.log(`✓ Downloaded official BSE Delivery data for ${dd}-${mm}-${yyyy} (${map.size} scrips)`);
          return { map, tradeDate: `${dd}-${mm}-${yyyy}` };
        }
      } catch (_) {}
    }
  }
  return null;
}

async function runBseSync() {
  console.log('Stocks 360: Starting Official BSE India Equities & Bhavcopy Synchronizer...');
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const lastUpdatedLabel = `Today (${dateString}), ${timeString} IST`;

  const { stocks, defsContent } = loadScreenerDataset();
  const nseIsinMap = await fetchNseIsinMap();
  console.log(`Loaded ${stocks.length} existing stocks; mapped ${nseIsinMap.size} NSE ISINs.`);

  // Build lookup indexes
  const isinToStock = new Map();
  const symbolSet = new Set();
  const bseCodeToStock = new Map();

  stocks.forEach((s) => {
    const sym = String(s.symbol || '').toUpperCase();
    symbolSet.add(sym);
    if (!s.isin && nseIsinMap.has(sym)) {
      s.isin = nseIsinMap.get(sym);
    }
    if (s.isin) {
      isinToStock.set(String(s.isin).toUpperCase(), s);
    }
    if (s.bseCode) {
      bseCodeToStock.set(String(s.bseCode), s);
    }
    if (!s.exchanges) {
      s.exchanges = s.bseCode ? 'NSE,BSE' : 'NSE';
    }
  });

  const bhav = await fetchLatestBseBhavcopy();
  if (!bhav) {
    console.warn('Warning: BSE Bhavcopy unavailable right now. Existing BSE shards left untouched.');
    return;
  }
  const delivRes = await fetchLatestBseDeliveryMap();
  const bseDelivMap = delivRes ? delivRes.map : new Map();

  const headers = parseCsvLine(bhav.csvLines[0]);
  const idx = {
    bseCode: headers.indexOf('FinInstrmId'),
    isin: headers.indexOf('ISIN'),
    bseSymbol: headers.indexOf('TckrSymb'),
    series: headers.indexOf('SctySrs'),
    name: headers.indexOf('FinInstrmNm'),
    open: headers.indexOf('OpnPric'),
    high: headers.indexOf('HghPric'),
    low: headers.indexOf('LwPric'),
    close: headers.indexOf('ClsPric'),
    last: headers.indexOf('LastPric'),
    prevClose: headers.indexOf('PrvsClsgPric'),
    volume: headers.indexOf('TtlTradgVol')
  };

  const bseShards = {};
  let dualMatched = 0;
  let bseExclusiveAdded = 0;
  let bseExclusiveUpdated = 0;

  for (let i = 1; i < bhav.csvLines.length; i++) {
    const cols = parseCsvLine(bhav.csvLines[i]);
    const bseCode = String(cols[idx.bseCode] || '').trim();
    const isin = String(cols[idx.isin] || '').trim().toUpperCase();
    const bseSymbol = String(cols[idx.bseSymbol] || '').trim().toUpperCase();
    const bseGroup = String(cols[idx.series] || '').trim();
    const name = String(cols[idx.name] || '').trim();
    const close = Number(cols[idx.close]) || Number(cols[idx.last]) || 0;
    if (!bseCode || close <= 0) continue;

    const prevClose = Number(cols[idx.prevClose]) || close;
    const open = Number(cols[idx.open]) || close;
    const high = Number(cols[idx.high]) || close;
    const low = Number(cols[idx.low]) || close;
    const volume = Math.round(Number(cols[idx.volume]) || 0);
    const dayChange = Number((close - prevClose).toFixed(2));
    const dayChangePct = prevClose > 0 ? Number(((dayChange / prevClose) * 100).toFixed(2)) : 0;
    const isGain = dayChange >= 0;
    const bseDeliv = bseDelivMap.get(bseCode);

    let targetStock = (isin && isinToStock.get(isin)) || bseCodeToStock.get(bseCode) || null;

    if (targetStock) {
      targetStock.bseCode = bseCode;
      if (isin && !targetStock.isin) targetStock.isin = isin;
      if (targetStock.exchanges === 'BSE') {
        // BSE-only stock: update primary quote & rolling EOD technicals directly from BSE Bhavcopy
        targetStock.cmp = close;
        targetStock.dayOpen = open;
        targetStock.dayHigh = high;
        targetStock.dayLow = low;
        targetStock.prevClose = prevClose;
        targetStock.dayChange = dayChange;
        targetStock.dayChangePct = dayChangePct;
        targetStock.isGain = isGain;
        targetStock.high52 = targetStock.high52 > 0 ? Math.max(targetStock.high52, high) : high;
        targetStock.low52 = targetStock.low52 > 0 ? Math.min(targetStock.low52, low) : low;
        if (volume > 0) {
          targetStock.avgVolume = targetStock.avgVolume > 0
            ? Number(((targetStock.avgVolume * 9 + volume) / 10).toFixed(1))
            : volume;
          targetStock.volume = volume;
          targetStock.volumeSurge = targetStock.avgVolume > 0 ? Number((volume / targetStock.avgVolume).toFixed(2)) : 1.0;
        }
        if (bseDeliv) {
          targetStock.deliveryVolume = bseDeliv.deliveryVolume;
          targetStock.deliveryPct = bseDeliv.deliveryPct;
        }
        targetStock.dma50 = targetStock.dma50 > 0 ? Number(((targetStock.dma50 * 49 + close) / 50).toFixed(2)) : close;
        targetStock.dma200 = targetStock.dma200 > 0 ? Number(((targetStock.dma200 * 199 + close) / 200).toFixed(2)) : close;
        targetStock.goldenCross = targetStock.dma50 > targetStock.dma200 && close > targetStock.dma50;
        targetStock.lastUpdated = `BSE ${bhav.tradeDate}`;
        bseExclusiveUpdated++;
      } else {
        targetStock.exchanges = 'NSE,BSE';
        dualMatched++;
      }
    } else {
      // New BSE-exclusive listed equity
      let sym = bseSymbol && !symbolSet.has(bseSymbol) ? bseSymbol : `BSE${bseCode}`;
      if (symbolSet.has(sym)) sym = `BSE${bseCode}`;
      symbolSet.add(sym);

      targetStock = {
        symbol: sym,
        name: name || bseSymbol || `BSE ${bseCode}`,
        sector: detectSector(name),
        isin: isin || '',
        bseCode,
        exchanges: 'BSE',
        cmp: close,
        dayChange,
        dayChangePct,
        isGain,
        prevClose,
        marketCapCr: null,
        pe: null,
        roePct: null,
        rocePct: null,
        debtToEquity: null,
        dma50: close,
        dma200: close,
        goldenCross: false,
        rsi14: 50,
        volume,
        avgVolume: volume,
        volumeSurge: 1.0,
        deliveryVolume: bseDeliv ? bseDeliv.deliveryVolume : undefined,
        deliveryPct: bseDeliv ? bseDeliv.deliveryPct : undefined,
        dayOpen: open,
        dayHigh: high,
        dayLow: low,
        high52: high,
        low52: low,
        lastUpdated: `BSE ${bhav.tradeDate}`
      };
      stocks.push(targetStock);
      if (isin) isinToStock.set(isin, targetStock);
      bseCodeToStock.set(bseCode, targetStock);
      bseExclusiveAdded++;
    }

    const sk = shardKey(targetStock.symbol);
    if (!bseShards[sk]) bseShards[sk] = {};
    bseShards[sk][String(targetStock.symbol).toUpperCase()] = {
      bseCode,
      bseSymbol: bseSymbol || bseCode,
      bseGroup,
      isin: isin || '',
      cmp: close,
      dayOpen: open,
      dayHigh: high,
      dayLow: low,
      prevClose,
      dayChange,
      dayChangePct,
      isGain,
      volume,
      deliveryVolume: bseDeliv ? bseDeliv.deliveryVolume : undefined,
      deliveryPct: bseDeliv ? bseDeliv.deliveryPct : undefined,
      tradeDate: bhav.tradeDate,
      lastUpdated: `BSE ${bhav.tradeDate}`
    };
  }

  for (const [k, shardObj] of Object.entries(bseShards)) {
    fs.writeFileSync(path.join(BSE_DIR, `${k}.json`), JSON.stringify(shardObj), 'utf8');
  }

  console.log(`✓ Dual-listed NSE+BSE matched by ISIN: ${dualMatched}`);
  console.log(`✓ BSE-exclusive equities added: ${bseExclusiveAdded} (updated: ${bseExclusiveUpdated})`);
  console.log(`✓ Total universe (NSE + BSE): ${stocks.length} listed equities`);

  writeScreenerDataIfPresent(stocks, defsContent, 'Synchronized NSE + BSE equities.', lastUpdatedLabel);
  const indexBytes = writeScreenerIndex(stocks, defsContent, lastUpdatedLabel);
  console.log(`✓ Rebuilt js/screener-index.js (${(indexBytes / 1024).toFixed(1)} KB) with NSE + BSE universe!`);
}

runBseSync().catch((err) => {
  console.error('BSE sync error:', err.message);
  process.exit(1);
});
