/**
 * Stocks 360 - Official NSE Corporate Filings & Quarterly Results Synchronizer (Zero Yahoo Finance)
 *
 * Capabilities:
 * - Fetches official quarterly financial results (Sales, PBT, Net Profit, Diluted EPS) and
 *   shareholding patterns (Promoter %, Public %) directly from NSE India (`nseindia.com/api/top-corp-info`)
 * - Updates matching fields in `data/profiles/<shard>.json` while preserving existing multi-year
 *   Balance Sheet, Cash Flow, and Ratio data
 * - Rebuilds `js/screener-index.js` (and `js/screener-data.js` if present locally) when stock metrics update
 * - Zero Yahoo Finance API, zero external npm dependencies (Cost: Rs 0)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  loadScreenerDataset,
  writeScreenerIndex,
  writeScreenerDataIfPresent,
  syncMarketSummaryToFirestore
} = require('./lib/screener-store');

const OUT_DIR = path.join(__dirname, '..', 'data', 'profiles');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function httpGetJson(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Referer': 'https://www.nseindia.com/'
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            return resolve(JSON.parse(body));
          } catch (_) {
            return resolve(null);
          }
        }
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function shardKey(symbol) {
  const c = String(symbol || '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '0-9';
}

function loadShard(key) {
  const p = path.join(OUT_DIR, `${key}.json`);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function saveShard(key, data) {
  const p = path.join(OUT_DIR, `${key}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function formatInr(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('en-IN');
}

function formatNseQuarterPeriod(toDateStr) {
  // Converts "30 Sep 2026" -> "Sep 26"
  const m = String(toDateStr || '').match(/\d+\s+([A-Za-z]{3})\s+\d{2}(\d{2})/);
  return m ? `${m[1]} ${m[2]}` : String(toDateStr || '').trim();
}

function httpGetText(url, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.nseindia.com/'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve('');
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function toCrFromInr(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : Math.round(n / 10000000);
}

function extractXbrlFact(xml, tag, ctxIds) {
  for (const ctx of ctxIds) {
    const re = new RegExp(`<[a-z0-9-]+:${tag}\\s+contextRef="${ctx}"[^>]*>([^<]+)<`, 'i');
    const m = xml.match(re);
    if (m && m[1] !== undefined) {
      const v = toCrFromInr(m[1].trim());
      if (v !== null) return v;
    }
  }
  return null;
}

function formatXbrlYearLabel(isoDate) {
  if (!isoDate) return '';
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-/);
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mo = months[parseInt(m[2], 10) - 1] || 'Mar';
  return `${mo} ${m[1].slice(2)}`;
}

async function fetchAndParseNseXbrl(xbrlUrl) {
  if (!xbrlUrl || !/^https:\/\/nsearchives\.nseindia\.com\/.+\.xml$/i.test(xbrlUrl)) return null;
  const xml = await httpGetText(xbrlUrl, 25000);
  if (!xml || xml.length < 1000) return null;

  const oneIMatch = xml.match(/<xbrli:context id="OneI">[\s\S]*?<xbrli:instant>([^<]+)<\/xbrli:instant>/i);
  const fourDMatch = xml.match(/<xbrli:context id="FourD">[\s\S]*?<xbrli:endDate>([^<]+)<\/xbrli:endDate>/i);
  const bsPeriod = formatXbrlYearLabel(oneIMatch && oneIMatch[1]);
  const cfPeriod = formatXbrlYearLabel((fourDMatch && fourDMatch[1]) || (oneIMatch && oneIMatch[1]));

  const eqCap = extractXbrlFact(xml, 'EquityShareCapital', ['OneI', 'PY_I']);
  const reserves = extractXbrlFact(xml, 'OtherEquity', ['OneI', 'PY_I']);
  const ltBorrow = extractXbrlFact(xml, 'BorrowingsNoncurrent', ['OneI', 'PY_I']) || 0;
  const stBorrow = extractXbrlFact(xml, 'BorrowingsCurrent', ['OneI', 'PY_I']) || 0;
  const totalAssets = extractXbrlFact(xml, 'Assets', ['OneI', 'PY_I']);
  const fixedAssets = extractXbrlFact(xml, 'PropertyPlantAndEquipment', ['OneI', 'PY_I']);
  const investments = extractXbrlFact(xml, 'NoncurrentInvestments', ['OneI', 'PY_I']);

  const cfo = extractXbrlFact(xml, 'CashFlowsFromUsedInOperatingActivities', ['FourD', 'OneD']);
  const cfi = extractXbrlFact(xml, 'CashFlowsFromUsedInInvestingActivities', ['FourD', 'OneD']);
  const cff = extractXbrlFact(xml, 'CashFlowsFromUsedInFinancingActivities', ['FourD', 'OneD']);

  const bsValid = bsPeriod && (eqCap !== null || totalAssets !== null);
  const cfValid = cfPeriod && (cfo !== null || cfi !== null || cff !== null);
  if (!bsValid && !cfValid) return null;

  const totalBorrowings = ltBorrow + stBorrow;
  const totalEquity = (eqCap || 0) + (reserves || 0);
  const debtToEquity = totalEquity > 0 ? Number((totalBorrowings / totalEquity).toFixed(2)) : null;

  return {
    balanceSheetRow: bsValid ? {
      year: bsPeriod,
      equityCapital: formatInr(eqCap || 0),
      reserves: formatInr(reserves || 0),
      borrowings: formatInr(totalBorrowings),
      otherLiabilities: formatInr(Math.max(0, (totalAssets || 0) - totalEquity - totalBorrowings)),
      totalLiabilities: formatInr(totalAssets || 0),
      fixedAssets: formatInr(fixedAssets || 0),
      investments: formatInr(investments || 0),
      otherAssets: formatInr(Math.max(0, (totalAssets || 0) - (fixedAssets || 0) - (investments || 0))),
      totalAssets: formatInr(totalAssets || 0)
    } : null,
    cashFlowRow: cfValid ? {
      year: cfPeriod,
      cfo: formatInr(cfo || 0),
      cfi: formatInr(cfi || 0),
      cff: formatInr(cff || 0),
      netCashFlow: formatInr((cfo || 0) + (cfi || 0) + (cff || 0))
    } : null,
    debtToEquity
  };
}

async function fetchNseCorpInfo(symbol) {
  const url = `https://www.nseindia.com/api/top-corp-info?symbol=${encodeURIComponent(symbol)}&market=equities`;
  const data = await httpGetJson(url);
  if (!data || typeof data !== 'object') return null;

  // 1. Parse Shareholding Pattern (latest quarter)
  let promoterPct = null;
  const shpData = data.shareholdings_patterns && data.shareholdings_patterns.data;
  if (shpData && typeof shpData === 'object') {
    const dates = Object.keys(shpData);
    if (dates.length > 0) {
      const latestEntries = shpData[dates[dates.length - 1]] || [];
      for (const entry of latestEntries) {
        const key = Object.keys(entry)[0] || '';
        if (/promoter/i.test(key)) {
          const val = parseFloat(String(entry[key]).trim());
          if (!isNaN(val)) promoterPct = Number(val.toFixed(2));
        }
      }
    }
  }

  // 2. Parse Quarterly Financial Results (NSE reports values in ₹ Lakhs -> divide by 100 for ₹ Cr)
  const finRows = (data.financial_results && Array.isArray(data.financial_results.data))
    ? data.financial_results.data
    : [];

  const quarterlyResults = [];
  const seenPeriods = new Set();
  for (const row of finRows) {
    const period = formatNseQuarterPeriod(row.to_date);
    if (!period || seenPeriods.has(period)) continue;
    const salesCr = Math.round((parseFloat(row.income) || 0) / 100);
    if (salesCr <= 0) continue;

    seenPeriods.add(period);
    const pbtCr = Math.round((parseFloat(row.reProLossBefTax) || 0) / 100);
    const netProfitCr = Math.round((parseFloat(row.proLossAftTax) || 0) / 100);
    const expCr = Math.max(0, salesCr - pbtCr);
    const opm = salesCr > 0 ? `${((pbtCr / salesCr) * 100).toFixed(1)}%` : '0.0%';
    const eps = parseFloat(row.reDilEPS);

    quarterlyResults.push({
      period,
      sales: formatInr(salesCr),
      expenses: formatInr(expCr),
      operatingProfit: formatInr(pbtCr),
      opm,
      netProfit: formatInr(netProfitCr),
      eps: !isNaN(eps) ? `₹${eps}` : '₹0'
    });
    if (quarterlyResults.length >= 4) break;
  }

  if (promoterPct === null && quarterlyResults.length === 0) {
    return null;
  }

  const latestXbrlRow = finRows.find((r) => r.xbrl_attachment && /^https:\/\/nsearchives\.nseindia\.com\/.+\.xml$/i.test(r.xbrl_attachment));

  return {
    promoterPct,
    quarterlyResults: quarterlyResults.reverse(), // oldest -> newest
    xbrlUrl: latestXbrlRow ? latestXbrlRow.xbrl_attachment : ''
  };
}

async function run() {
  console.log('Stocks 360: Initializing 100% Official NSE Corporate Filings & Results synchronizer...');

  let stocks, defsContent, sourcePath;
  try {
    ({ stocks, defsContent, sourcePath } = loadScreenerDataset());
    console.log(`Loaded ${stocks.length} stocks from ${sourcePath}`);
  } catch (e) {
    console.error('Failed to load stock dataset:', e.message);
    process.exit(1);
  }

  const isAll = process.argv.includes('--all') || process.env.ALL === 'true';
  const symbolsArgIdx = process.argv.indexOf('--symbols');
  let targetSymbols = null;
  if (symbolsArgIdx !== -1 && process.argv[symbolsArgIdx + 1]) {
    targetSymbols = new Set(process.argv[symbolsArgIdx + 1].toUpperCase().split(',').map((s) => s.trim()));
  }

  let targetStocks;
  if (targetSymbols) {
    targetStocks = stocks.filter((s) => targetSymbols.has(s.symbol.toUpperCase()));
  } else if (isAll) {
    targetStocks = stocks;
  } else {
    const limit = parseInt(process.argv[2] || process.env.LIMIT || '100', 10);
    targetStocks = stocks.slice(0, Math.min(limit, stocks.length));
  }

  console.log(`Syncing official NSE filings & results for ${targetStocks.length} equities...`);

  const shardCache = {};
  const dirtyShards = new Set();

  function getShard(key) {
    if (!shardCache[key]) shardCache[key] = loadShard(key);
    return shardCache[key];
  }

  function flushDirtyShards() {
    for (const k of dirtyShards) {
      if (shardCache[k]) saveShard(k, shardCache[k]);
    }
    dirtyShards.clear();
  }

  let updatedCount = 0;
  let unchangedCount = 0;
  const CHUNK_SIZE = 10;

  for (let i = 0; i < targetStocks.length; i += CHUNK_SIZE) {
    const chunk = targetStocks.slice(i, i + CHUNK_SIZE);

    await Promise.all(chunk.map(async (stock) => {
      const sym = stock.symbol.toUpperCase();
      const k = shardKey(sym);
      const shard = getShard(k);
      const profile = shard[sym];
      if (!profile) {
        unchangedCount++;
        return;
      }

      const nseInfo = await fetchNseCorpInfo(sym);
      if (!nseInfo) {
        unchangedCount++;
        return;
      }

      let changed = false;

      if (nseInfo.promoterPct !== null && profile.shareholding) {
        const nextProm = `${nseInfo.promoterPct}%`;
        if (profile.shareholding.promoters !== nextProm) {
          profile.shareholding.promoters = nextProm;
          changed = true;
        }
      }

      if (nseInfo.quarterlyResults.length > 0) {
        const prevLatest = profile.quarterlyResults && profile.quarterlyResults[profile.quarterlyResults.length - 1];
        const newLatest = nseInfo.quarterlyResults[nseInfo.quarterlyResults.length - 1];
        if (!prevLatest || prevLatest.period !== newLatest.period || prevLatest.sales !== newLatest.sales || prevLatest.netProfit !== newLatest.netProfit) {
          profile.quarterlyResults = nseInfo.quarterlyResults;
          changed = true;
        }
      }

      // Parse official NSE Ind-AS XBRL XML for Balance Sheet & Cash Flows when a new filing URL is detected
      if (nseInfo.xbrlUrl && profile.lastXbrlUrl !== nseInfo.xbrlUrl) {
        const xbrlData = await fetchAndParseNseXbrl(nseInfo.xbrlUrl);
        if (xbrlData) {
          if (xbrlData.balanceSheetRow && Array.isArray(profile.balanceSheet)) {
            const idxBs = profile.balanceSheet.findIndex((r) => r.year === xbrlData.balanceSheetRow.year);
            if (idxBs >= 0) profile.balanceSheet[idxBs] = xbrlData.balanceSheetRow;
            else profile.balanceSheet.push(xbrlData.balanceSheetRow);
            if (profile.balanceSheet.length > 6) profile.balanceSheet = profile.balanceSheet.slice(-6);
            changed = true;
          }
          if (xbrlData.cashFlowRow && Array.isArray(profile.cashFlows)) {
            const idxCf = profile.cashFlows.findIndex((r) => r.year === xbrlData.cashFlowRow.year);
            if (idxCf >= 0) profile.cashFlows[idxCf] = xbrlData.cashFlowRow;
            else profile.cashFlows.push(xbrlData.cashFlowRow);
            if (profile.cashFlows.length > 6) profile.cashFlows = profile.cashFlows.slice(-6);
            changed = true;
          }
          if (xbrlData.debtToEquity !== null) {
            stock.debtToEquity = xbrlData.debtToEquity;
            profile.debtToEquity = xbrlData.debtToEquity;
            if (profile.ratios) profile.ratios.debtToEquity = xbrlData.debtToEquity;
            changed = true;
          }
          profile.lastXbrlUrl = nseInfo.xbrlUrl;
        }
      }

      if (changed) {
        profile.hasFinancialUpdate = true;
        profile.lastFinancialStatementUpdate = new Date().toISOString();
        profile.financialChangeSummary = 'Synced official NSE quarterly results & shareholding pattern';
        dirtyShards.add(k);
        updatedCount++;
        console.log(`  ★ [NSE SYNCED] ${sym}`);
      } else {
        unchangedCount++;
      }
    }));

    if (i % (CHUNK_SIZE * 10) === 0 && dirtyShards.size > 0) {
      flushDirtyShards();
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  flushDirtyShards();

  if (updatedCount > 0) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
    const dateString = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
    const lastUpdatedLabel = `Today (${dateString}), ${timeString} IST`;

    writeScreenerDataIfPresent(stocks, defsContent, 'Synchronized with official NSE filings.', lastUpdatedLabel);
    writeScreenerIndex(stocks, defsContent, lastUpdatedLabel);
    await syncMarketSummaryToFirestore(stocks, lastUpdatedLabel);
  }

  console.log(`\n======================================================`);
  console.log(`✓ Official NSE Corporate Filings Sync Complete (Zero Yahoo Finance)!`);
  console.log(`✓ Equities Inspected: ${targetStocks.length}`);
  console.log(`✓ Profiles Updated: ${updatedCount}`);
  console.log(`✓ Unchanged / Unavailable: ${unchangedCount}`);
  console.log(`======================================================`);
}

run().catch((err) => {
  console.error('NSE fundamentals sync notice:', err.message);
  process.exit(0);
});
