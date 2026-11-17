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

const SCREENER_METRIC_DEFINITIONS = {
  cmp: {
    label: 'Current Market Price (CMP)',
    unit: '₹',
    category: 'price',
    description: 'Latest closing equity price from official NSE/BSE Bhavcopy records.'
  },
  dayChangePct: {
    label: 'Day Change %',
    unit: '%',
    category: 'price',
    description: 'Daily percentage price change compared with the previous close.'
  },
  marketCapCr: {
    label: 'Market Cap (₹ Cr)',
    unit: '₹ Cr',
    category: 'fundamental',
    description: 'Derived from official Bhavcopy CMP multiplied by diluted shares inferred from official NSE quarterly filings.'
  },
  pe: {
    label: 'Stock P/E (TTM)',
    unit: 'x',
    category: 'fundamental',
    description: 'Bhavcopy CMP divided by Trailing 12-Month (4-quarter) Diluted EPS from official NSE filings.'
  },
  roePct: {
    label: 'ROE % (TTM)',
    unit: '%',
    category: 'fundamental',
    description: 'Trailing 12-Month Net Profit divided by Total Equity from official NSE Ind-AS XBRL Balance Sheet.'
  },
  rocePct: {
    label: 'ROCE % (TTM)',
    unit: '%',
    category: 'fundamental',
    description: 'Trailing 12-Month Profit Before Tax divided by Capital Employed (Total Equity + Borrowings) from official NSE filings.'
  },
  debtToEquity: {
    label: 'Debt to Equity',
    unit: 'x',
    category: 'fundamental',
    description: 'Total Borrowings divided by Total Equity from official NSE Ind-AS XBRL Balance Sheet filings.'
  },
  high52: {
    label: '52-Week High',
    unit: '₹',
    category: 'price',
    description: 'Highest traded price tracked over the past 52 weeks.'
  },
  low52: {
    label: '52-Week Low',
    unit: '₹',
    category: 'price',
    description: 'Lowest traded price tracked over the past 52 weeks.'
  },
  dma50: {
    label: '50-Day Moving Average (50 DMA)',
    unit: '₹',
    category: 'technical',
    description: 'Rolling 50-session moving average of closing price.'
  },
  dma200: {
    label: '200-Day Moving Average (200 DMA)',
    unit: '₹',
    category: 'technical',
    description: 'Rolling 200-session moving average of closing price.'
  },
  goldenCross: {
    label: 'Golden Crossover (50 DMA > 200 DMA)',
    unit: 'Flag',
    category: 'technical',
    description: 'Bullish technical state where 50 DMA is above 200 DMA and CMP is above 50 DMA.'
  },
  rsi14: {
    label: 'RSI (14-Day Relative Strength)',
    unit: 'pts',
    category: 'technical',
    description: 'Momentum oscillator from 0 to 100 (>70 overbought, <30 oversold).'
  },
  volume: {
    label: "Day's Trading Volume",
    unit: 'shares',
    category: 'volume',
    description: 'Total shares traded in the latest exchange session.'
  },
  avgVolume: {
    label: '10-Day Average Volume',
    unit: 'shares',
    category: 'volume',
    description: 'Rolling 10-session average trading volume.'
  },
  volumeSurge: {
    label: 'Volume Surge Ratio',
    unit: 'x',
    category: 'volume',
    description: 'Ratio of latest session volume to 10-day average volume.'
  }
};

function normalizeSectorName(rawSector, rawIndustry, companyName) {
  const ind = String(rawIndustry || '').toUpperCase();
  const sec = String(rawSector || '').toUpperCase();
  const name = String(companyName || '').toUpperCase();
  const combined = `${ind} ${sec}`;

  // 1. Banking & Financial Sub-sectors (check Capital Markets & Banking before generic Finance)
  if (/CAPITAL MARKET|ASSET MANAGEMENT|STOCK EXCHANGE|DEPOSITORY|BROKER/i.test(combined) || /DEPOSITORY|STOCK EXCHANGE|SECURITIES|BROKING|MUTUAL FUND AMC/i.test(name)) {
    return 'Capital Markets & Asset Management';
  }
  if (/BANK/i.test(ind) || (/BANK/i.test(sec) && !/NBFC/i.test(sec)) || /\bBANK\b/i.test(name)) {
    return 'Banking & Financial Services';
  }
  if (/CREDIT SERVICES|INSURANCE|MORTGAGE|FINANCIAL CONGLOMERATE|FINANCIAL SERVICES|NBFC/i.test(combined) || /FINANC|FINSERV|CAPITAL|INVEST|HOUSING FIN|INSURANCE|CREDIT/i.test(name)) {
    return 'Financial Services & NBFC';
  }

  // 2. Technology & Telecom/Media
  if (/TELECOM|BROADCAST|MEDIA|ENTERTAINMENT|PUBLISHING|COMMUNICATION|MOTION PICTURE|ADVERTISING/i.test(combined) || /TELECOM|MEDIA|COMMUNICATION|ENTERTAINMENT|NETWORK|TV/i.test(name)) {
    return 'Media & Telecommunications';
  }
  if (/INFORMATION TECHNOLOGY|SOFTWARE|COMPUTER|SEMICONDUCTOR|INTERNET CONTENT|IT SERVICES|TECH/i.test(combined) || /\bTECH\b|INFOTECH|SOFTWARE|SOFT\b|SYSTEMS|DIGITAL|CYBER/i.test(name)) {
    return 'Information Technology';
  }

  // 3. Healthcare & Pharma
  if (/DRUG|PHARMA|BIOTECH|HEALTHCARE|DIAGNOSTIC|MEDICAL|HOSPITAL/i.test(combined) || /PHARMA|HEALTH|BIO|LAB|DRUG|MEDIC|HOSPITAL/i.test(name)) {
    return 'Pharmaceuticals & Healthcare';
  }

  // 4. Agri & Chemicals
  if (/AGRICULTURAL INPUTS|FERTILIZ|AGRO.?CHEM/i.test(combined) || /FERTIL|AGROCHEM|PESTICID|CROP/i.test(name)) {
    return 'Agri & Fertilizers';
  }
  if (/CHEMICAL|PETROCHEM|PLASTIC|POLYMER|SPECIALITY/i.test(combined) || /CHEM|CARBON|POLY|PETRO|DYES|PIGMENT/i.test(name)) {
    return 'Chemicals & Materials';
  }

  // 5. Automobiles & Auto Ancillaries
  if (/AUTO|VEHICLE|WHEELER|TYRE|TIRE|RECREATIONAL VEHICLES/i.test(combined) || /AUTO|MOTOR|TYRE|VEHICLE|BRAKE|GEAR|AXLE/i.test(name)) {
    return 'Automotive & Ancillaries';
  }

  // 6. Metals & Mining
  if (/STEEL|ALUMINUM|COPPER|METAL|GOLD|SILVER|MINING|COAL|ZINC/i.test(combined) || /STEEL|METAL|MINING|IRON|ALUMIN|COPPER|COAL|ALLOY|FORG/i.test(name)) {
    return 'Metals & Mining';
  }

  // 7. Energy, Oil & Power
  if (/OIL|GAS|REFIN|UTILITIES|POWER|SOLAR|ELECTRIC|RENEWABLE|ENERGY/i.test(combined) || /POWER|ENERGY|SOLAR|WIND|OIL|PETROLEUM|REFIN|ELECTRIC|HYDRO|GREEN/i.test(name)) {
    return 'Energy, Oil & Power';
  }

  // 8. Capital Goods & Industrial Machinery
  if (/INDUSTRIAL MACHINERY|ELECTRICAL EQUIPMENT|AEROSPACE|DEFENSE|DEFENCE|TOOLS|INDUSTRIAL DISTRIBUTION|CONGLOMERATE/i.test(combined) || /MACHINERY|BEARING|PUMP|SWITCHGEAR|CABLE|WIRES|DEFENCE|TRANSFORMER/i.test(name)) {
    return 'Capital Goods & Industrial Machinery';
  }

  // 9. Infrastructure, Cement & Construction
  if (/ENGINEERING & CONSTRUCTION|BUILDING|CEMENT|INFRASTRUCTURE|PIPES/i.test(combined) || /INFRA|ENGINEER|CONSTRUCT|CEMENT|BUILD|PIPES|PROJECTS/i.test(name)) {
    return 'Infrastructure & Construction';
  }

  // 10. Real Estate
  if (/REAL ESTATE|REIT|HOUSING/i.test(combined) || /REALTY|ESTATE|HOUSING|DEVELOPERS|PROPERT|INFRASTRUCTURE DEVELOP/i.test(name)) {
    return 'Real Estate & Housing';
  }

  // 11. Consumer & FMCG
  if (/FOOD|BEVERAGE|HOUSEHOLD|PERSONAL PRODUCTS|TOBACCO|CONFECTION|FARM PRODUCTS|CONSUMER DEFENSIVE|PACKAGED|DAIRY|SUGAR|FMCG/i.test(combined) || /FOOD|BEVERAG|SUGAR|TEA|COFFEE|AGRO|CONSUMER|FMCG|DAIRY|BREWER|DISTILL/i.test(name)) {
    return 'Consumer & FMCG';
  }

  // 12. Textiles
  if (/TEXTILE|APPAREL/i.test(combined) || /TEXTILE|COTTON|GARMENT|SPINNING|SILK|APPAREL|WEAV|DENIM|YARN/i.test(name)) {
    return 'Textiles & Apparels';
  }

  // 13. Logistics & Transport
  if (/FREIGHT|LOGISTIC|SHIPPING|RAILROAD|TRUCKING|AIRPORT|AIRLINE|MARINE|PORT/i.test(combined) || /LOGISTIC|SHIPPING|PORTS|TRANSPORT|AIRWAYS|CARGO|EXPRESS/i.test(name)) {
    return 'Logistics & Transport';
  }

  // 14. Hospitality & Tourism
  if (/LODGING|RESORT|RESTAURANT|TRAVEL|LEISURE|HOSPITALITY/i.test(combined) || /HOTEL|RESORT|TOUR|TRAVEL|HOSPITALITY/i.test(name)) {
    return 'Hospitality & Tourism';
  }

  // 15. Retail & Lifestyle
  if (/RETAIL|LUXURY|DEPARTMENT STORE|FOOTWEAR|JEWEL|FURNISHING|PACKAGING/i.test(combined) || /RETAIL|FASHION|JEWEL|MART\b|STORE|FOOTWEAR|GOLD/i.test(name)) {
    return 'Retail & Lifestyle';
  }

  return 'Diversified Equities';
}

function parseFilingNumber(val) {
  if (val === null || val === undefined || val === '' || val === '--') return NaN;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return NaN;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function computeFilingFundamentals(cmp, profile) {
  const numCmp = Number(cmp) || 0;
  const qr = (profile && Array.isArray(profile.quarterlyResults)) ? profile.quarterlyResults : [];
  const bsList = (profile && Array.isArray(profile.balanceSheet)) ? profile.balanceSheet : [];

  // Infer diluted shares (in Crores) from the most recent valid official NSE quarterly filing
  let sharesCr = null;
  for (let i = qr.length - 1; i >= 0; i--) {
    const pat = parseFilingNumber(qr[i].netProfit);
    const eps = parseFilingNumber(qr[i].eps);
    if (Number.isFinite(pat) && Number.isFinite(eps) && Math.abs(pat) >= 2 && Math.abs(eps) >= 0.05 && (pat * eps > 0)) {
      const candidate = pat / eps;
      if (candidate > 0.01 && candidate < 100000) {
        sharesCr = Number(candidate.toFixed(4));
        break;
      }
    }
  }
  if (!sharesCr) {
    for (let i = qr.length - 1; i >= 0; i--) {
      const pat = parseFilingNumber(qr[i].netProfit);
      const eps = parseFilingNumber(qr[i].eps);
      if (Number.isFinite(pat) && Number.isFinite(eps) && Math.abs(pat) >= 0.5 && Math.abs(eps) >= 0.02 && (pat * eps > 0)) {
        const candidate = pat / eps;
        if (candidate > 0.01 && candidate < 100000) {
          sharesCr = Number(candidate.toFixed(4));
          break;
        }
      }
    }
  }

  const marketCapCr = (numCmp > 0 && sharesCr) ? Math.round(numCmp * sharesCr) : null;

  // Trailing 12-Month (TTM) metrics strictly require >= 4 filed quarters
  let ttmSalesCr = null;
  let ttmOpProfitCr = null;
  let ttmPatCr = null;
  let ttmEps = null;
  let pe = null;

  if (qr.length >= 4) {
    const last4 = qr.slice(-4);
    let salesSum = 0;
    let opSum = 0;
    let patSum = 0;
    let epsSum = 0;
    let validSales = 0;
    let validPat = 0;
    let validEps = 0;

    for (const q of last4) {
      const s = parseFilingNumber(q.sales);
      const op = parseFilingNumber(q.operatingProfit);
      const pat = parseFilingNumber(q.netProfit);
      const eps = parseFilingNumber(q.eps);
      if (Number.isFinite(s)) { salesSum += s; validSales++; }
      if (Number.isFinite(op)) { opSum += op; }
      if (Number.isFinite(pat)) { patSum += pat; validPat++; }
      if (Number.isFinite(eps)) { epsSum += eps; validEps++; }
    }

    if (validSales === 4) ttmSalesCr = Math.round(salesSum);
    if (validPat === 4) {
      ttmPatCr = Math.round(patSum);
      ttmOpProfitCr = Math.round(opSum);
    }
    if (validEps === 4) {
      ttmEps = Number(epsSum.toFixed(2));
      if (numCmp > 0 && ttmEps > 0) {
        const rawPe = numCmp / ttmEps;
        if (rawPe > 0 && rawPe < 2000) {
          pe = Number(rawPe.toFixed(1));
        }
      }
    }
  }

  // Balance sheet ratios from latest official NSE Ind-AS XBRL filing
  let bookValue = null;
  let roePct = null;
  let rocePct = null;
  let debtToEquity = null;

  if (bsList.length > 0) {
    const latestBs = bsList[bsList.length - 1];
    const eqCap = parseFilingNumber(latestBs.equityCapital) || 0;
    const res = parseFilingNumber(latestBs.reserves) || 0;
    const bor = parseFilingNumber(latestBs.borrowings);
    const totalEquityCr = eqCap + res;

    if (totalEquityCr > 1) {
      if (sharesCr) {
        bookValue = Number((totalEquityCr / sharesCr).toFixed(1));
      }
      if (Number.isFinite(bor) && bor >= 0) {
        const de = bor / totalEquityCr;
        if (de >= 0 && de <= 50) {
          debtToEquity = Number(de.toFixed(2));
        }
      }
      if (ttmPatCr !== null) {
        const roe = (ttmPatCr / totalEquityCr) * 100;
        if (roe >= -250 && roe <= 250) {
          roePct = Number(roe.toFixed(1));
        }
      }
      const capEmployed = totalEquityCr + (Number.isFinite(bor) && bor > 0 ? bor : 0);
      if (ttmOpProfitCr !== null && capEmployed > 1) {
        const roce = (ttmOpProfitCr / capEmployed) * 100;
        if (roce >= -250 && roce <= 250) {
          rocePct = Number(roce.toFixed(1));
        }
      }
    }
  }

  let promoterPct = null;
  if (profile && profile.shareholding && profile.shareholding.promoters) {
    const pNum = parseFilingNumber(profile.shareholding.promoters);
    if (Number.isFinite(pNum) && pNum >= 0 && pNum <= 100) {
      promoterPct = Number(pNum.toFixed(2));
    }
  }

  return {
    sharesCr,
    marketCapCr,
    pe,
    ttmEps,
    ttmSalesCr,
    ttmOpProfitCr,
    ttmPatCr,
    bookValue,
    roePct,
    rocePct,
    debtToEquity,
    promoterPct
  };
}

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

  const defsContent = `const SCREENER_METRIC_DEFINITIONS = ${JSON.stringify(SCREENER_METRIC_DEFINITIONS, null, 2)};`;

  return { stocks, defsContent, sourcePath, hasFullDataFile };
}

function buildCompactIndex(stocks, lastUpdatedLabel) {
  return stocks.map((s) => {
    const out = {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector || 'Diversified Equities',
      ...(s.industry ? { industry: s.industry } : {}),
      ...(s.isin ? { isin: s.isin } : {}),
      ...(s.bseCode ? { bseCode: s.bseCode } : {}),
      ...(s.exchanges ? { exchanges: s.exchanges } : {}),
      cmp: s.cmp || 0,
      dayChange: s.dayChange || 0,
      dayChangePct: s.dayChangePct || 0,
      isGain: s.isGain !== undefined ? s.isGain : (s.dayChange >= 0),
      prevClose: s.prevClose || 0,
      dma50: s.dma50 || 0,
      dma200: s.dma200 || 0,
      goldenCross: !!s.goldenCross,
      rsi14: s.rsi14 || 50,
      volume: s.volume || 0,
      avgVolume: s.avgVolume || 0,
      volumeSurge: s.volumeSurge || 1.0,
      dayOpen: s.dayOpen || 0,
      dayHigh: s.dayHigh || 0,
      dayLow: s.dayLow || 0,
      high52: s.high52 || 0,
      low52: s.low52 || 0,
      lastUpdated: s.lastUpdated || lastUpdatedLabel
    };
    const optionalNums = [
      'sharesCr', 'marketCapCr', 'pe', 'ttmEps', 'ttmSalesCr',
      'ttmPatCr', 'bookValue', 'roePct', 'rocePct', 'debtToEquity', 'promoterPct'
    ];
    optionalNums.forEach((k) => {
      if (typeof s[k] === 'number' && Number.isFinite(s[k])) {
        out[k] = s[k];
      }
    });
    return out;
  });
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
  SCREENER_METRIC_DEFINITIONS,
  normalizeSectorName,
  parseFilingNumber,
  computeFilingFundamentals,
  loadScreenerDataset,
  writeScreenerIndex,
  writeScreenerDataIfPresent,
  syncMarketSummaryToFirestore
};
