/**
 * Shared dataset loader/writer for Stocks 360 sync scripts.
 * Supports both the tracked lightweight index (js/screener-index.js) in CI/GitHub Actions
 * and the optional local full dataset (js/screener-data.js) when present.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const ROOT_DIR = path.join(__dirname, '..', '..');
const DATA_FILE_PATH = path.join(ROOT_DIR, 'js', 'screener-data.js');
const INDEX_FILE_PATH = path.join(ROOT_DIR, 'js', 'screener-index.js');
const SECRET_FILE_PATH = path.join(ROOT_DIR, 'js', 'firebase-secret.json');

function loadScreenerDataset() {
  const hasFullDataFile = fs.existsSync(DATA_FILE_PATH);
  const sourcePath = hasFullDataFile ? DATA_FILE_PATH : INDEX_FILE_PATH;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Neither js/screener-data.js nor js/screener-index.js was found in ${ROOT_DIR}`);
  }

  const fileContent = fs.readFileSync(sourcePath, 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  vm.runInNewContext(fileContent, sandbox);

  const stocks = sandbox.window.STOCKS_SCREENER_DATASET || sandbox.module.exports.STOCKS_SCREENER_DATASET;
  if (!Array.isArray(stocks)) {
    throw new Error(`Could not parse STOCKS_SCREENER_DATASET from ${sourcePath}`);
  }

  const defsMatch = fileContent.match(/const SCREENER_METRIC_DEFINITIONS = (\{[\s\S]*?\});/);
  const defsContent = defsMatch
    ? defsMatch[0]
    : `const SCREENER_METRIC_DEFINITIONS = ${JSON.stringify(sandbox.window.SCREENER_METRIC_DEFINITIONS || {}, null, 2)};`;

  return { stocks, defsContent, sourcePath, hasFullDataFile };
}

function buildCompactIndex(stocks, lastUpdatedLabel) {
  return stocks.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    sector: s.sector || 'Equities',
    ...(s.isin ? { isin: s.isin } : {}),
    ...(s.bseCode ? { bseCode: s.bseCode } : {}),
    ...(s.exchanges ? { exchanges: s.exchanges } : {}),
    cmp: s.cmp || 0,
    dayChange: s.dayChange || 0,
    dayChangePct: s.dayChangePct || 0,
    isGain: s.isGain !== undefined ? s.isGain : (s.dayChange >= 0),
    prevClose: s.prevClose || 0,
    marketCapCr: s.marketCapCr || 0,
    pe: s.pe || 0,
    roePct: s.roePct || 0,
    rocePct: s.rocePct || 0,
    debtToEquity: s.debtToEquity !== undefined ? s.debtToEquity : 0,
    divYieldPct: s.divYieldPct || 0,
    dma50: s.dma50 || 0,
    dma200: s.dma200 || 0,
    goldenCross: !!s.goldenCross,
    rsi14: s.rsi14 || 50,
    volume: s.volume || 0,
    avgVolume: s.avgVolume || 0,
    volumeSurge: s.volumeSurge || 1.0,
    salesGrowth3Y: s.salesGrowth3Y || 0,
    profitGrowth3Y: s.profitGrowth3Y || 0,
    dayOpen: s.dayOpen || 0,
    dayHigh: s.dayHigh || 0,
    dayLow: s.dayLow || 0,
    high52: s.high52 || 0,
    low52: s.low52 || 0,
    lastUpdated: s.lastUpdated || lastUpdatedLabel
  }));
}

function writeScreenerIndex(stocks, defsContent, lastUpdatedLabel) {
  const compactIndex = buildCompactIndex(stocks, lastUpdatedLabel);
  const indexFileContent = `/**
 * Stocks 360 - Ultra-Fast Lightweight Screener & Search Index (screener-index.js)
 * Automatically synchronized on weekdays at 4:45 PM IST.
 * Last Update: ${lastUpdatedLabel}
 */

${defsContent}

const STOCKS_SCREENER_DATASET = ${JSON.stringify(compactIndex)};

if (typeof window !== "undefined") {
  window.SCREENER_METRIC_DEFINITIONS = SCREENER_METRIC_DEFINITIONS;
  window.STOCKS_SCREENER_DATASET = STOCKS_SCREENER_DATASET;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SCREENER_METRIC_DEFINITIONS, STOCKS_SCREENER_DATASET };
}
`;
  fs.writeFileSync(INDEX_FILE_PATH, indexFileContent, 'utf8');
  return Buffer.byteLength(indexFileContent);
}

function writeScreenerDataIfPresent(stocks, defsContent, headerComment, lastUpdatedLabel) {
  if (!fs.existsSync(DATA_FILE_PATH)) {
    return false;
  }
  const newFileContent = `/**
 * Stocks 360 - Comprehensive Stock Screener Dataset (screener-data.js)
 * ${headerComment}
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
  return true;
}

function syncMarketSummaryToFirestore(stocks, lastUpdatedLabel) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(SECRET_FILE_PATH)) return resolve(false);
      const secret = JSON.parse(fs.readFileSync(SECRET_FILE_PATH, 'utf8'));
      const apiKey = secret.apiKey || secret.geminiApiKey;
      const projectId = secret.projectId || 'project-b005dc8f-09b3-4af6-b2b';
      if (!apiKey) return resolve(false);

      const topStocks = stocks.slice(0, 50).map((s) => ({
        symbol: s.symbol,
        cmp: s.cmp,
        dayChangePct: s.dayChangePct,
        isGain: s.isGain
      }));

      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/site_settings/stock_screener_data?key=${apiKey}`;
      const payload = JSON.stringify({
        fields: {
          topStocksJson: { stringValue: JSON.stringify(topStocks) },
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
        },
        timeout: 10000
      }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✓ Successfully synced market summary to Firebase Firestore!');
          resolve(true);
        } else {
          console.log(`Firestore sync notice: HTTP ${res.statusCode}`);
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    } catch (_) {
      resolve(false);
    }
  });
}

module.exports = {
  DATA_FILE_PATH,
  INDEX_FILE_PATH,
  loadScreenerDataset,
  writeScreenerIndex,
  writeScreenerDataIfPresent,
  syncMarketSummaryToFirestore
};
