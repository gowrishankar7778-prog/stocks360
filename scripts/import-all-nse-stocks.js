/**
 * Stocks 360 - Official NSE Universe Importer
 * Fetches the complete official master list of all equity stocks listed on the National Stock Exchange of India (NSE)
 * directly from https://archives.nseindia.com/content/equities/EQUITY_L.csv
 *
 * Merges existing live-synced stocks with all official NSE listed equities (~2,400+ companies)
 * and writes to js/screener-data.js and Firebase Firestore.
 */

const https = require('https');
const {
  loadScreenerDataset,
  normalizeSectorName,
  writeScreenerIndex,
  writeScreenerDataIfPresent,
  syncMarketSummaryToFirestore
} = require('./lib/screener-store');

const NSE_CSV_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';

function fetchUrl(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    if (redirectsLeft <= 0) return resolve('');
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 20000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchUrl(nextUrl, redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve('');
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function detectSector(name) {
  return normalizeSectorName(null, null, name);
}

async function runImport() {
  console.log('Stocks 360: Downloading official master NSE equity list...');
  const csvData = await fetchUrl(NSE_CSV_URL);
  const lines = csvData.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0].toUpperCase().startsWith('SYMBOL,')) {
    console.log('NSE master CSV unavailable or invalid right now. Leaving existing stock universe unchanged.');
    return;
  }
  console.log(`Downloaded ${lines.length} total equity rows from archives.nseindia.com`);

  // Read existing screener dataset (prefers js/screener-data.js locally, falls back to js/screener-index.js in CI)
  const { stocks: existingStocks, defsContent, sourcePath } = loadScreenerDataset();
  console.log(`Found ${existingStocks.length} existing stocks in ${sourcePath}.`);

  const existingMap = new Map();
  existingStocks.forEach(s => {
    existingMap.set(s.symbol.toUpperCase(), s);
  });
  console.log(`Found ${existingStocks.length} existing stocks with verified live market data.`);

  const mergedStocks = [];
  const processedSymbols = new Set();

  // First preserve all existing verified live stocks in order
  existingStocks.forEach(s => {
    const symUpper = s.symbol.toUpperCase();
    if (!processedSymbols.has(symUpper)) {
      processedSymbols.add(symUpper);
      mergedStocks.push(s);
    }
  });

  // Now import every remaining equity security from the official NSE master list
  let importedCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());
    if (parts.length < 3) continue;

    const symbol = parts[0];
    const companyName = parts[1];
    const series = parts[2];
    const isin = parts[6] || '';
    const faceValue = Number(parts[7]) || 10;

    // Filter to active equity series
    if (series !== 'EQ' && series !== 'BE' && series !== 'BZ') continue;
    if (!symbol || processedSymbols.has(symbol.toUpperCase())) continue;

    processedSymbols.add(symbol.toUpperCase());

    const newStock = {
      symbol: symbol,
      name: companyName,
      sector: detectSector(companyName),
      exchanges: 'NSE',
      cmp: 0,
      dayChange: 0,
      dayChangePct: 0,
      isGain: true,
      prevClose: 0,
      lastUpdated: "NSE Official Master",
      marketCapCr: null,
      pe: null,
      roePct: null,
      rocePct: null,
      debtToEquity: null,
      dma50: 0,
      dma200: 0,
      goldenCross: false,
      rsi14: 50,
      volume: 0,
      avgVolume: 0,
      volumeSurge: 1.0,
      dayOpen: 0,
      dayHigh: 0,
      dayLow: 0,
      high52: 0,
      low52: 0,
      series: series,
      isin: isin,
      faceValue: faceValue
    };

    mergedStocks.push(newStock);
    importedCount++;
  }

  console.log(`Successfully merged ${importedCount} new NSE stocks! Total universe: ${mergedStocks.length} listed equities.`);

  if (importedCount === 0) {
    console.log('No new NSE listings to add. Existing files untouched.');
    return;
  }

  const now = new Date();
  const timeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const lastUpdatedLabel = `Today (${dateString}), ${timeString} IST`;

  if (writeScreenerDataIfPresent(mergedStocks, defsContent, `Master National Stock Exchange (NSE) Equities Database: ${mergedStocks.length} Companies`, lastUpdatedLabel)) {
    console.log(`✓ Wrote ${mergedStocks.length} NSE stocks to js/screener-data.js`);
  }

  const indexBytes = writeScreenerIndex(mergedStocks, defsContent, lastUpdatedLabel);
  console.log(`✓ Updated js/screener-index.js (${(indexBytes / 1024).toFixed(1)} KB) with ${mergedStocks.length} NSE stocks`);

  await syncMarketSummaryToFirestore(mergedStocks, lastUpdatedLabel);
}

runImport().catch((err) => {
  console.error('Import script error:', err.message);
  process.exit(1);
});
