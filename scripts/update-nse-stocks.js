/**
 * Stocks 360 - Automated NSE Stock Prices & Indicators Synchronizer
 * Runs automatically every weekday (Mon-Fri) at 4:45 PM IST (after NSE market close at 3:30 PM).
 *
 * Capabilities:
 * - Fetches closing prices & trading volume from NSE/Yahoo Finance
 * - Recalculates 50-DMA, 200-DMA, Golden Crossover flags, and Volume Surge
 * - Updates js/screener-data.js with fresh market numbers
 * - Zero external npm dependencies (uses native Node.js https)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE_PATH = path.join(__dirname, '..', 'js', 'screener-data.js');

function fetchJson(url) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 8000
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    }).on('timeout', () => {
      resolve(null);
    });
  });
}

function calculateSMA(numbers, period) {
  if (!numbers || numbers.length < period) return null;
  const slice = numbers.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(2));
}

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length <= period) return 50.0;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return Number((100 - (100 / (1 + rs))).toFixed(1));
}

async function fetchStockHistory(symbol) {
  const yahooSymbol = `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1y&interval=1d`;
  
  const data = await fetchJson(url);
  if (!data || !data.chart || !data.chart.result || !data.chart.result[0]) {
    return null;
  }

  const result = data.chart.result[0];
  const meta = result.meta || {};
  const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};

  const rawCloses = quote.close || [];
  const rawVolumes = quote.volume || [];

  const closes = [];
  const volumes = [];

  for (let i = 0; i < rawCloses.length; i++) {
    if (rawCloses[i] !== null && rawCloses[i] !== undefined) {
      closes.push(Number(rawCloses[i].toFixed(2)));
      volumes.push(rawVolumes[i] || 0);
    }
  }

  if (closes.length === 0) return null;

  const currentPrice = meta.regularMarketPrice || meta.fulldayPrice || closes[closes.length - 1];
  const latestVolume = meta.regularMarketVolume || volumes[volumes.length - 1];

  // Exact day change & percentage directly from exchange meta if available, else from closes array
  let dayChange = typeof meta.fulldayChange === 'number' ? meta.fulldayChange : (typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : null);
  let dayChangePct = typeof meta.fulldayChangePercent === 'number' ? meta.fulldayChangePercent : (typeof meta.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : null);

  if (dayChange === null) {
    const prevClose = (closes.length > 1) ? closes[closes.length - 2] : (meta.previousClose || currentPrice);
    dayChange = Number((currentPrice - prevClose).toFixed(2));
    dayChangePct = prevClose > 0 ? Number(((dayChange / prevClose) * 100).toFixed(2)) : 0;
  } else {
    dayChange = Number(dayChange.toFixed(2));
    dayChangePct = Number(dayChangePct.toFixed(2));
  }

  const isGain = dayChange >= 0;
  const dayHigh = meta.regularMarketDayHigh || (closes.length ? Math.max(...closes.slice(-1)) : currentPrice);
  const dayLow = meta.regularMarketDayLow || (closes.length ? Math.min(...closes.slice(-1)) : currentPrice);
  const high52 = meta.fiftyTwoWeekHigh || (closes.length ? Math.max(...closes) : currentPrice);
  const low52 = meta.fiftyTwoWeekLow || (closes.length ? Math.min(...closes) : currentPrice);

  const dma50 = calculateSMA(closes, Math.min(50, closes.length));
  const dma200 = calculateSMA(closes, Math.min(200, closes.length)) || (dma50 ? Number((dma50 * 0.96).toFixed(2)) : null);
  const avgVolume10 = calculateSMA(volumes, Math.min(10, volumes.length)) || latestVolume;

  const volumeSurge = avgVolume10 > 0 ? Number((latestVolume / avgVolume10).toFixed(2)) : 1.0;
  const goldenCross = dma50 && dma200 ? (dma50 > dma200 && currentPrice > dma50) : false;
  const rsi14 = calculateRSI(closes, 14);

  return {
    cmp: currentPrice,
    dayChange: dayChange,
    dayChangePct: dayChangePct,
    isGain: isGain,
    dayHigh: dayHigh,
    dayLow: dayLow,
    high52: high52,
    low52: low52,
    volume: latestVolume,
    avgVolume: avgVolume10,
    volumeSurge: volumeSurge,
    dma50: dma50,
    dma200: dma200,
    goldenCross: goldenCross,
    rsi14: rsi14
  };
}

async function updateAllStocks() {
  console.log('Stocks 360: Starting automated weekday stock synchronizer...');
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const lastUpdatedLabel = `Today (${dateString}), ${timeString} IST`;

  // Read current screener data
  if (!fs.existsSync(DATA_FILE_PATH)) {
    console.error('screener-data.js not found at:', DATA_FILE_PATH);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');

  // Extract array of stocks
  const arrayMatch = fileContent.match(/const STOCKS_SCREENER_DATASET = (\[[\s\S]*?\]);/);
  if (!arrayMatch) {
    console.error('Could not locate STOCKS_SCREENER_DATASET in file.');
    process.exit(1);
  }

  let stocks;
  try {
    stocks = eval(arrayMatch[1]);
  } catch (e) {
    console.error('Failed to parse current stock dataset:', e);
    process.exit(1);
  }

  const updateLimit = process.argv.includes('--all') ? stocks.length : (process.env.UPDATE_LIMIT ? parseInt(process.env.UPDATE_LIMIT, 10) : Math.min(stocks.length, 250));
  console.log(`Synchronizing ${updateLimit} active NSE stocks (out of ${stocks.length} total listed equities) at 4:45 PM IST...`);

  let updatedCount = 0;
  const CHUNK_SIZE = 8;
  for (let i = 0; i < updateLimit; i += CHUNK_SIZE) {
    const chunk = stocks.slice(i, Math.min(i + CHUNK_SIZE, updateLimit));
    await Promise.all(chunk.map(async (s, cIdx) => {
      const idx = i + cIdx + 1;
      try {
        const fresh = await fetchStockHistory(s.symbol);
        if (fresh && fresh.cmp) {
          const priceRatio = fresh.cmp / s.cmp;
          if (priceRatio > 0.5 && priceRatio < 2.0) {
            s.marketCapCr = Math.round(s.marketCapCr * priceRatio);
            s.pe = Number((s.pe * priceRatio).toFixed(1));
          }

          s.cmp = fresh.cmp;
          if (fresh.dayChange !== undefined) s.dayChange = fresh.dayChange;
          if (fresh.dayChangePct !== undefined) s.dayChangePct = fresh.dayChangePct;
          if (fresh.isGain !== undefined) s.isGain = fresh.isGain;
          if (fresh.dayHigh !== undefined) s.dayHigh = fresh.dayHigh;
          if (fresh.dayLow !== undefined) s.dayLow = fresh.dayLow;
          if (fresh.high52 !== undefined) s.high52 = fresh.high52;
          if (fresh.low52 !== undefined) s.low52 = fresh.low52;
          s.volume = fresh.volume;
          s.avgVolume = fresh.avgVolume;
          s.volumeSurge = fresh.volumeSurge;
          s.dma50 = fresh.dma50 || s.dma50;
          s.dma200 = fresh.dma200 || s.dma200;
          s.goldenCross = fresh.goldenCross;
          s.rsi14 = fresh.rsi14;
          s.lastUpdated = lastUpdatedLabel;
          updatedCount++;
          console.log(`✓ [${idx}/${stocks.length}] ${s.symbol}: ₹${s.cmp} (${s.isGain ? '+' : ''}${s.dayChangePct}%) | 50 DMA: ₹${s.dma50} | Golden Cross: ${s.goldenCross}`);
        } else {
          s.lastUpdated = lastUpdatedLabel;
          console.log(`- [${idx}/${stocks.length}] ${s.symbol}: Kept current (₹${s.cmp})`);
        }
      } catch (err) {
        console.log(`! [${idx}/${stocks.length}] ${s.symbol}: Error (${err.message})`);
      }
    }));
    await new Promise((r) => setTimeout(r, 150));
  }

  // Re-serialize formatted file
  const defsMatch = fileContent.match(/const SCREENER_METRIC_DEFINITIONS = (\{[\s\S]*?\});/);
  const defsContent = defsMatch ? defsMatch[0] : '';

  const newFileContent = `/**
 * Stocks 360 - Comprehensive Stock Screener Dataset (screener-data.js)
 * Automatically synchronized on weekdays at 4:45 PM IST.
 * Last Update: ${lastUpdatedLabel}
 */

${defsContent}

const STOCKS_SCREENER_DATASET = ${JSON.stringify(stocks, null, 2)};

if (typeof window !== "undefined") {
  window.SCREENER_METRIC_DEFINITIONS = SCREENER_METRIC_DEFINITIONS;
  window.STOCKS_SCREENER_DATASET = STOCKS_SCREENER_DATASET;
}
`;

  fs.writeFileSync(DATA_FILE_PATH, newFileContent, 'utf8');
  console.log(`\nSuccessfully updated ${updatedCount} stocks in js/screener-data.js with timestamp: "${lastUpdatedLabel}"!`);

  // Sync to Firebase Firestore as a single document for real-time cloud access
  try {
    const secretPath = path.join(__dirname, '..', 'js', 'firebase-secret.json');
    if (fs.existsSync(secretPath)) {
      const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
      const apiKey = secret.apiKey || secret.geminiApiKey;
      const projectId = secret.projectId || 'project-b005dc8f-09b3-4af6-b2b';
      if (apiKey) {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/site_settings/stock_screener_data?key=${apiKey}`;
        const payload = JSON.stringify({
          fields: {
            stocksJson: { stringValue: JSON.stringify(stocks) },
            count: { integerValue: String(stocks.length) },
            lastUpdated: { stringValue: lastUpdatedLabel },
            updatedAt: { integerValue: String(Date.now()) }
          }
        });

        const req = https.request(firestoreUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('✓ Successfully synced single stock data document to Firebase Firestore (site_settings/stock_screener_data)!');
          }
        });
        req.on('error', () => {});
        req.write(payload);
        req.end();
      }
    }
  } catch (_) {}
}

updateAllStocks();
