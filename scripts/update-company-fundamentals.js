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
  normalizeSectorName,
  computeFilingFundamentals,
  writeScreenerIndex,
  writeScreenerDataIfPresent,
  syncMarketSummaryToFirestore
} = require('./lib/screener-store');

const OUT_DIR = path.join(__dirname, '..', 'data', 'profiles');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

let nseCookies = '';

function httpGetJson(url, timeoutMs = 12000, hops = 0) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        clearTimeout(hardTimer);
        resolve(val);
      }
    };
    const hardTimer = setTimeout(() => {
      try { if (req) req.destroy(); } catch (_) {}
      done(null);
    }, timeoutMs);

    let u;
    try { u = new URL(url); } catch (_) { return done(null); }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${u.protocol}//${u.host}/`
    };
    if (nseCookies) headers['Cookie'] = nseCookies;

    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
      timeout: timeoutMs
    }, (res) => {
      if (res.headers['set-cookie']) {
        const map = new Map();
        nseCookies.split('; ').filter(Boolean).forEach((c) => map.set(c.split('=')[0], c));
        res.headers['set-cookie'].map((c) => c.split(';')[0]).forEach((c) => map.set(c.split('=')[0], c));
        nseCookies = Array.from(map.values()).join('; ');
      }
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && hops < 3) {
        res.resume();
        clearTimeout(hardTimer);
        settled = true;
        return resolve(httpGetJson(new URL(res.headers.location, url).toString(), timeoutMs, hops + 1));
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            return done(JSON.parse(body));
          } catch (_) {
            return done(null);
          }
        }
        done(null);
      });
      res.on('error', () => done(null));
    });
    req.on('error', () => done(null));
    req.on('timeout', () => { req.destroy(); done(null); });
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

function extractXbrlFact(xml, tags, ctxIds) {
  const tagList = Array.isArray(tags) ? tags : [tags];
  for (const tag of tagList) {
    for (const ctx of ctxIds) {
      const re = new RegExp(`<[a-z0-9-]+:${tag}\\s+contextRef="${ctx}"[^>]*>([^<]+)<`, 'i');
      const m = xml.match(re);
      if (m && m[1] !== undefined) {
        const v = toCrFromInr(m[1].trim());
        if (v !== null) return v;
      }
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

  const bsCtxs = ['OneI', 'PY_I', 'OneD', 'FourD'];
  const eqCap = extractXbrlFact(xml, [
    'EquityShareCapital',
    'Capital',
    'ShareCapital',
    'PaidUpValueOfEquityShareCapital',
    'PaidUpEquityShareCapital'
  ], bsCtxs);
  const reserves = extractXbrlFact(xml, ['OtherEquity', 'ReservesAndSurplus'], bsCtxs);
  const ltBorrow = extractXbrlFact(xml, ['BorrowingsNoncurrent', 'LongTermBorrowings'], bsCtxs);
  const stBorrow = extractXbrlFact(xml, ['BorrowingsCurrent', 'ShortTermBorrowings'], bsCtxs);
  const totalBorrowings = (ltBorrow !== null || stBorrow !== null)
    ? (ltBorrow || 0) + (stBorrow || 0)
    : (extractXbrlFact(xml, ['Borrowings'], bsCtxs) || 0);
  const totalAssets = extractXbrlFact(xml, [
    'Assets',
    'CapitalAndLiabilities',
    'EquityAndLiabilities',
    'SourcesOfFunds'
  ], bsCtxs);
  const fixedAssets = extractXbrlFact(xml, [
    'PropertyPlantAndEquipment',
    'FixedAssets',
    'PropertyPlantAndEquipmentAndIntangibleAssets'
  ], bsCtxs);
  const investments = extractXbrlFact(xml, [
    'NoncurrentInvestments',
    'Investments',
    'InvestmentsShareholders'
  ], bsCtxs);

  const cfo = extractXbrlFact(xml, 'CashFlowsFromUsedInOperatingActivities', ['FourD', 'OneD']);
  const cfi = extractXbrlFact(xml, 'CashFlowsFromUsedInInvestingActivities', ['FourD', 'OneD']);
  const cff = extractXbrlFact(xml, 'CashFlowsFromUsedInFinancingActivities', ['FourD', 'OneD']);

  const bsValid = bsPeriod && (eqCap !== null || totalAssets !== null);
  const cfValid = cfPeriod && (cfo !== null || cfi !== null || cff !== null);
  if (!bsValid && !cfValid) return null;

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
      netCash: formatInr((cfo || 0) + (cfi || 0) + (cff || 0))
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
      eps: !isNaN(eps) ? `₹${eps}` : '--'
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

function formatShpQuarterLabel(dateStr) {
  const m = String(dateStr || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return '';
  const monLabel = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  return `${monLabel} ${m[3]}`;
}

function isNamedHolderLabel(name) {
  if (!name) return false;
  const clean = String(name).trim().replace(/\s+/g, ' ');
  if (clean.length < 3) return false;
  if (/^(OTHER|OTHERS|SUB-TOTAL|TOTAL\s|ANY OTHER|UNCLAIMED|SUSPENSE|ESCROW|CLEARING MEMBER|RESIDENT INDIVIDUAL|NON RESIDENT|FOREIGN PORTFOLIO INVESTOR|FOREIGN DIRECT INVESTMENT|OVERSEAS DEPOSITOR|SHAREHOLDING BY|TRUSTS WHERE|RELATIVES OF|ASSOCIATE COMPAN|DIRECTORS AND|INDEPENDENT DIRECTOR|KEY MANAGERIAL|INVESTOR EDUCATION|CENTRAL GOVERNMENT|STATE GOVERNMENT|GOVERNMENTS|INSTITUTIONS|NON-INSTITUTIONS|MUTUAL FUNDS$|ALTERNATE INVESTMENT|VENTURE CAPITAL|PROVIDENT FUNDS|INSURANCE\s+COMPANIES$|NBFC|SOVEREIGN WEALTH|ASSET RECONSTRUCTION|OTHER FINANCIAL|BANKS$|FOREIGN NATIONAL|FOREIGN COMPANIES|BODIES CORPORATE$|HUF$|NRIS$|TRUSTS$|LLP$|OVERSEAS CORPORATE|INDIVIDUALS|FINANCIAL INSTITUTIONS|ESOP|EMPLOYEES)/i.test(clean)) {
    return false;
  }
  return true;
}

function parsePublicShareholderRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let section = 0;
  let subCat = '';
  let diiPct = 0, fiiPct = 0, govtPct = 0, pubNonInstPct = 0;
  let mfPct = 0, insPct = 0, pensionPct = 0;
  const diiHolders = [], fiiHolders = [], govtHolders = [], publicHolders = [];

  for (const r of rows) {
    const cat = String(r.category || '').trim();
    const label = String(r.COL_I || '').trim().replace(/\s+/g, ' ');
    const pct = parseFloat(r.COL_VIII);
    const valPct = Number.isFinite(pct) ? Number(pct.toFixed(2)) : 0;

    if (cat === '1' || /^Institutions\s*\(Domestic\)/i.test(label)) { section = 1; subCat = ''; continue; }
    if (cat === '2' || /^Institutions\s*\(Foreign\)/i.test(label)) { section = 2; subCat = ''; continue; }
    if (cat === '3' || /^Central Government/i.test(label)) { section = 3; subCat = ''; continue; }
    if (cat === '4' || /^Non-institutions/i.test(label)) { section = 4; subCat = ''; continue; }

    if (/^Sub-Total\s*\(B\)\(1\)/i.test(label)) { diiPct = valPct; continue; }
    if (/^Sub-Total\s*\(B\)\(2\)/i.test(label)) { fiiPct = valPct; continue; }
    if (/^Sub-Total\s*\(B\)\(3\)/i.test(label)) { govtPct = valPct; continue; }
    if (/^Sub-Total\s*\(B\)\(4\)/i.test(label)) { pubNonInstPct = valPct; continue; }
    if (/^Total Public Shareholding/i.test(label)) continue;

    if (cat && /^[a-z]$/i.test(cat)) {
      subCat = label;
      if (section === 1) {
        if (/Mutual Funds/i.test(label)) mfPct += valPct;
        else if (/Insurance/i.test(label)) insPct += valPct;
        else if (/Provident|Pension/i.test(label)) pensionPct += valPct;
      }
      continue;
    }

    if (!cat && valPct >= 0.05 && isNamedHolderLabel(label)) {
      const cleanSub = subCat
        .replace(/Foreign Portfolio Investors Category I$/i, 'FPI Category I')
        .replace(/Foreign Portfolio Investors Category II$/i, 'FPI Category II')
        .replace(/Provident Funds\/ Pension Funds/i, 'Pension Funds')
        .replace(/Insurance\s+Companies/i, 'Insurance')
        .replace(/Resident Individuals holding.*/i, 'Individual Investor')
        .trim() || 'Institution';
      const entry = { name: label, pct: valPct, subCategory: cleanSub };
      if (section === 1) diiHolders.push(entry);
      else if (section === 2) fiiHolders.push(entry);
      else if (section === 3) govtHolders.push(entry);
      else if (section === 4) publicHolders.push(entry);
    }
  }
  diiHolders.sort((a, b) => b.pct - a.pct);
  fiiHolders.sort((a, b) => b.pct - a.pct);
  govtHolders.sort((a, b) => b.pct - a.pct);
  publicHolders.sort((a, b) => b.pct - a.pct);
  return {
    diiPct: Number(diiPct.toFixed(2)),
    fiiPct: Number(fiiPct.toFixed(2)),
    govtPct: Number(govtPct.toFixed(2)),
    publicPct: Number(pubNonInstPct.toFixed(2)),
    mfPct: Number(mfPct.toFixed(2)),
    insPct: Number(insPct.toFixed(2)),
    pensionPct: Number(pensionPct.toFixed(2)),
    diiHolders: diiHolders.slice(0, 12),
    fiiHolders: fiiHolders.slice(0, 12),
    publicHolders: govtHolders.concat(publicHolders).slice(0, 10)
  };
}

function parsePromoterRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const holders = [];
  for (const r of rows) {
    const cat = String(r.category || '').trim();
    const label = String(r.COL_I || '').trim().replace(/\s+/g, ' ');
    const entityType = String(r.ENTITY_TYPE || '').trim();
    const pct = parseFloat(r.COL_VIII);
    const valPct = Number.isFinite(pct) ? Number(pct.toFixed(2)) : 0;
    if (!cat && valPct >= 0.01 && (/Promoter/i.test(entityType) || isNamedHolderLabel(label))) {
      if (!/^(Indian|Foreign|Sub-Total|Total Shareholding|Any Other|Bodies Corporate|Individuals|Central Government|Financial Institutions)/i.test(label)) {
        holders.push({ name: label, pct: valPct, subCategory: entityType && entityType !== '-' ? entityType : 'Promoter' });
      }
    }
  }
  holders.sort((a, b) => b.pct - a.pct);
  return holders.slice(0, 10);
}

function mergeNewQuarterHolders(existingList, newQuarterList, targetQuartersLen, isNewQuarterAppended, trimOldest) {
  const normKey = (n) => String(n || '').toUpperCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').replace(/\bLIMITED\b/g, 'LTD').replace(/\bPRIVATE\b/g, 'PVT').trim();
  const map = new Map();
  for (const h of (Array.isArray(existingList) ? existingList : [])) {
    const k = normKey(h.name);
    if (!k) continue;
    let hist = Array.isArray(h.history) ? [...h.history] : [];
    if (isNewQuarterAppended) {
      if (trimOldest && hist.length >= targetQuartersLen) hist = hist.slice(hist.length - targetQuartersLen + 1);
      while (hist.length < targetQuartersLen - 1) hist.unshift(null);
      hist.push(null);
    } else {
      while (hist.length < targetQuartersLen) hist.push(null);
    }
    map.set(k, { name: h.name, subCategory: h.subCategory || '', pct: h.pct || 0, history: hist });
  }
  for (const nh of (Array.isArray(newQuarterList) ? newQuarterList : [])) {
    const k = normKey(nh.name);
    if (!k) continue;
    if (!map.has(k)) {
      const hist = new Array(targetQuartersLen).fill(null);
      hist[targetQuartersLen - 1] = nh.pct;
      map.set(k, { name: nh.name, subCategory: nh.subCategory || '', pct: nh.pct, history: hist });
    } else {
      const entry = map.get(k);
      entry.name = nh.name;
      if (nh.subCategory) entry.subCategory = nh.subCategory;
      entry.pct = nh.pct;
      entry.history[targetQuartersLen - 1] = nh.pct;
    }
  }
  const merged = Array.from(map.values()).filter((h) => h.history.some((v) => v !== null && v > 0));
  merged.sort((a, b) => {
    const aL = a.history[targetQuartersLen - 1] ?? 0;
    const bL = b.history[targetQuartersLen - 1] ?? 0;
    return bL - aL || (b.pct || 0) - (a.pct || 0);
  });
  return merged.slice(0, 12);
}

async function fetchLatestShareholdingMasterMap() {
  const rows = await httpGetJson('https://www.nseindia.in/api/corporate-share-holdings-master?index=equities', 20000);
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const r of rows) {
    const sym = String(r.symbol || '').trim().toUpperCase();
    if (!sym || map.has(sym)) continue;
    if (sym === 'JPL' && /Jagran/i.test(r.name || '')) continue;
    const qLabel = formatShpQuarterLabel(r.date);
    if (!qLabel || !r.recordId) continue;
    map.set(sym, {
      quarterLabel: qLabel,
      recordId: String(r.recordId),
      promPct: Number((parseFloat(r.pr_and_prgrp) || 0).toFixed(2)),
      pubValPct: Number((parseFloat(r.public_val) || 0).toFixed(2)),
      empPct: Number((parseFloat(r.employeeTrusts) || 0).toFixed(2))
    });
  }
  return map;
}

async function syncIncrementalShareholding(profile, shpEntry) {
  if (!shpEntry) return false;
  const sh = profile.shareholding;
  const hasQuarters = sh && Array.isArray(sh.quarters) && sh.quarters.length > 0 && sh.series;
  const latestQ = hasQuarters ? sh.quarters[sh.quarters.length - 1] : null;
  const alreadySynced = hasQuarters
    && latestQ === shpEntry.quarterLabel
    && (profile.lastShpRecordId === shpEntry.recordId || (sh.fii !== undefined && sh.holders));

  if (alreadySynced) {
    profile.lastShpRecordId = shpEntry.recordId;
    return false;
  }

  const [promRows, pubRows] = await Promise.all([
    httpGetJson(`https://www.nseindia.in/api/corporate-share-holdings-equities?ndsId=${shpEntry.recordId}&index=promoter`, 10000),
    httpGetJson(`https://www.nseindia.in/api/corporate-share-holdings-equities?ndsId=${shpEntry.recordId}&index=public-shareholder`, 10000)
  ]);
  const promParsed = parsePromoterRows(promRows);
  const pubParsed = parsePublicShareholderRows(pubRows);
  if (!pubParsed && promParsed.length === 0) return false;

  const MAX_Q = 10;
  if (!hasQuarters) {
    profile.shareholding = {
      promoters: `${shpEntry.promPct.toFixed(2)}%`,
      fii: pubParsed ? `${pubParsed.fiiPct.toFixed(2)}%` : undefined,
      dii: pubParsed ? `${pubParsed.diiPct.toFixed(2)}%` : undefined,
      government: pubParsed && pubParsed.govtPct > 0 ? `${pubParsed.govtPct.toFixed(2)}%` : undefined,
      public: pubParsed ? `${pubParsed.publicPct.toFixed(2)}%` : `${shpEntry.pubValPct.toFixed(2)}%`,
      total: '100.00%',
      quarters: [shpEntry.quarterLabel],
      series: {
        promoters: [shpEntry.promPct],
        fii: [pubParsed ? pubParsed.fiiPct : null],
        dii: [pubParsed ? pubParsed.diiPct : null],
        diiMutualFunds: [pubParsed ? pubParsed.mfPct : null],
        diiInsurance: [pubParsed ? pubParsed.insPct : null],
        diiPensionFunds: [pubParsed ? pubParsed.pensionPct : null],
        government: [pubParsed ? pubParsed.govtPct : null],
        public: [pubParsed ? pubParsed.publicPct : shpEntry.pubValPct],
        employeeTrusts: [shpEntry.empPct]
      },
      holders: {
        promoters: mergeNewQuarterHolders([], promParsed, 1, false, false),
        fii: mergeNewQuarterHolders([], pubParsed ? pubParsed.fiiHolders : [], 1, false, false),
        dii: mergeNewQuarterHolders([], pubParsed ? pubParsed.diiHolders : [], 1, false, false),
        public: mergeNewQuarterHolders([], pubParsed ? pubParsed.publicHolders : [], 1, false, false)
      }
    };
    profile.lastShpRecordId = shpEntry.recordId;
    return true;
  }

  const isNewQ = latestQ !== shpEntry.quarterLabel;
  const trimOldest = isNewQ && sh.quarters.length >= MAX_Q;
  if (isNewQ) {
    sh.quarters.push(shpEntry.quarterLabel);
    if (trimOldest) sh.quarters.shift();
  }
  const nQ = sh.quarters.length;
  const pushOrReplace = (arr, val) => {
    const list = Array.isArray(arr) ? [...arr] : new Array(nQ - (isNewQ ? 1 : 0)).fill(null);
    if (isNewQ) {
      list.push(val);
      if (trimOldest && list.length > MAX_Q) list.shift();
    } else {
      list[nQ - 1] = val;
    }
    return list;
  };

  sh.series.promoters = pushOrReplace(sh.series.promoters, shpEntry.promPct);
  sh.series.fii = pushOrReplace(sh.series.fii, pubParsed ? pubParsed.fiiPct : null);
  sh.series.dii = pushOrReplace(sh.series.dii, pubParsed ? pubParsed.diiPct : null);
  sh.series.diiMutualFunds = pushOrReplace(sh.series.diiMutualFunds, pubParsed ? pubParsed.mfPct : null);
  sh.series.diiInsurance = pushOrReplace(sh.series.diiInsurance, pubParsed ? pubParsed.insPct : null);
  sh.series.diiPensionFunds = pushOrReplace(sh.series.diiPensionFunds, pubParsed ? pubParsed.pensionPct : null);
  sh.series.government = pushOrReplace(sh.series.government, pubParsed ? pubParsed.govtPct : null);
  sh.series.public = pushOrReplace(sh.series.public, pubParsed ? pubParsed.publicPct : shpEntry.pubValPct);
  sh.series.employeeTrusts = pushOrReplace(sh.series.employeeTrusts, shpEntry.empPct);

  sh.promoters = `${shpEntry.promPct.toFixed(2)}%`;
  if (pubParsed) {
    sh.fii = `${pubParsed.fiiPct.toFixed(2)}%`;
    sh.dii = `${pubParsed.diiPct.toFixed(2)}%`;
    if (pubParsed.govtPct > 0) sh.government = `${pubParsed.govtPct.toFixed(2)}%`;
    sh.public = `${pubParsed.publicPct.toFixed(2)}%`;
  }
  sh.total = '100.00%';

  const prevHolders = sh.holders || {};
  sh.holders = {
    promoters: mergeNewQuarterHolders(prevHolders.promoters, promParsed, nQ, isNewQ, trimOldest),
    fii: mergeNewQuarterHolders(prevHolders.fii, pubParsed ? pubParsed.fiiHolders : [], nQ, isNewQ, trimOldest),
    dii: mergeNewQuarterHolders(prevHolders.dii, pubParsed ? pubParsed.diiHolders : [], nQ, isNewQ, trimOldest),
    public: mergeNewQuarterHolders(prevHolders.public, pubParsed ? pubParsed.publicHolders : [], nQ, isNewQ, trimOldest)
  };
  profile.lastShpRecordId = shpEntry.recordId;
  return true;
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
  const latestShpMap = await fetchLatestShareholdingMasterMap();
  console.log(`Fetched latest NSE Shareholding Pattern master index for ${latestShpMap.size} equities.`);

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
      let profile = shard[sym];
      const isNewProfile = !profile;
      if (!profile) {
        profile = { updatedAt: new Date().toISOString() };
      }

      const nseInfo = await fetchNseCorpInfo(sym);
      const shpChanged = await syncIncrementalShareholding(profile, latestShpMap.get(sym));
      if (!nseInfo && !shpChanged) {
        unchangedCount++;
        return;
      }

      let changed = shpChanged;

      if (nseInfo && nseInfo.promoterPct !== null) {
        const nextProm = `${nseInfo.promoterPct.toFixed(2)}%`;
        const nextPub = `${Math.max(0, Number((100 - nseInfo.promoterPct).toFixed(2))).toFixed(2)}%`;
        const prevProm = profile.shareholding && profile.shareholding.promoters;
        if (!profile.shareholding) {
          profile.shareholding = {
            promoters: nextProm,
            public: nextPub,
            total: '100.00%'
          };
          changed = true;
        } else if (prevProm !== nextProm && (!profile.shareholding.quarters || profile.shareholding.quarters.length === 0)) {
          profile.shareholding.promoters = nextProm;
          if (!profile.shareholding.fii && !profile.shareholding.dii) {
            profile.shareholding.public = nextPub;
          }
          profile.shareholding.total = '100.00%';
          changed = true;
        }
      }

      if (nseInfo && nseInfo.quarterlyResults.length > 0) {
        const prevLatest = profile.quarterlyResults && profile.quarterlyResults[profile.quarterlyResults.length - 1];
        const newLatest = nseInfo.quarterlyResults[nseInfo.quarterlyResults.length - 1];
        if (!prevLatest || prevLatest.period !== newLatest.period || prevLatest.sales !== newLatest.sales || prevLatest.netProfit !== newLatest.netProfit) {
          profile.quarterlyResults = nseInfo.quarterlyResults;
          changed = true;
        }
      }

      // Parse official NSE Ind-AS XBRL XML for Balance Sheet & Cash Flows when a new filing URL is detected
      if (nseInfo && nseInfo.xbrlUrl && profile.lastXbrlUrl !== nseInfo.xbrlUrl) {
        const xbrlData = await fetchAndParseNseXbrl(nseInfo.xbrlUrl);
        if (xbrlData) {
          if (xbrlData.balanceSheetRow) {
            if (!Array.isArray(profile.balanceSheet)) profile.balanceSheet = [];
            const idxBs = profile.balanceSheet.findIndex((r) => r.year === xbrlData.balanceSheetRow.year);
            if (idxBs >= 0) profile.balanceSheet[idxBs] = xbrlData.balanceSheetRow;
            else profile.balanceSheet.push(xbrlData.balanceSheetRow);
            if (profile.balanceSheet.length > 6) profile.balanceSheet = profile.balanceSheet.slice(-6);
            changed = true;
          }
          if (xbrlData.cashFlowRow) {
            if (!Array.isArray(profile.cashFlows)) profile.cashFlows = [];
            const idxCf = profile.cashFlows.findIndex((r) => r.year === xbrlData.cashFlowRow.year);
            if (idxCf >= 0) profile.cashFlows[idxCf] = xbrlData.cashFlowRow;
            else profile.cashFlows.push(xbrlData.cashFlowRow);
            if (profile.cashFlows.length > 6) profile.cashFlows = profile.cashFlows.slice(-6);
            changed = true;
          }
          if (xbrlData.debtToEquity !== null) {
            stock.debtToEquity = xbrlData.debtToEquity;
            profile.debtToEquity = xbrlData.debtToEquity;
            if (!profile.ratios) profile.ratios = {};
            profile.ratios.debtToEquity = xbrlData.debtToEquity;
            changed = true;
          }
          profile.lastXbrlUrl = nseInfo.xbrlUrl;
        }
      }

      if (changed) {
        if (isNewProfile) shard[sym] = profile;
        profile.sector = normalizeSectorName(profile.sector || stock.sector, profile.industry || stock.industry, stock.name);
        stock.sector = profile.sector;
        if (profile.industry) stock.industry = profile.industry;

        const derived = computeFilingFundamentals(stock.cmp, profile);
        const cleanRatios = {};
        for (const [rk, rv] of Object.entries(derived)) {
          if (typeof rv === 'number' && Number.isFinite(rv)) {
            stock[rk] = rv;
            if (rk !== 'sharesCr' && rk !== 'ttmOpProfitCr') {
              cleanRatios[rk] = rv;
            }
          } else if (rk !== 'ttmOpProfitCr') {
            stock[rk] = null;
          }
        }
        if (Object.keys(cleanRatios).length > 0) profile.ratios = cleanRatios;

        profile.hasFinancialUpdate = true;
        profile.lastFinancialStatementUpdate = new Date().toISOString();
        profile.financialChangeSummary = 'Synced official NSE quarterly results & XBRL balance sheet filings';
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
