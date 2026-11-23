/**
 * Stocks 360 - Official NSE Mainboard & SME IPO Tracker Synchronizer
 * Sources (100% Official Static/Public NSE Feeds, Cost: Rs 0):
 *  - https://www.nseindia.com/api/ipo-current-issue
 *  - https://www.nseindia.com/api/all-upcoming-issues?category=ipo
 *  - https://www.nseindia.com/api/public-past-issues
 *  - https://www.nseindia.com/api/ipo-detail?symbol=<SYMBOL>
 * Enriches recently listed/past IPOs with CMP, Market Cap & P/E from js/screener-index.js
 * Outputs:
 *  - data/market/ipo-tracker.json
 *  - js/ipo-data.js (`window.STOCKS_IPO_DATA`)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const MARKET_DIR = path.join(ROOT, 'data', 'market');
const JSON_OUT = path.join(MARKET_DIR, 'ipo-tracker.json');
const JS_OUT = path.join(ROOT, 'js', 'ipo-data.js');
const SCREENER_INDEX_PATH = path.join(ROOT, 'js', 'screener-index.js');

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'
};

const ALLOWED_DOC_URL_RE = /^https:\/\/(nsearchives\.nseindia\.com|archives\.nseindia\.com|ipoforms\.nseindia\.com|www\.nseindia\.com|www\.sebi\.gov\.in)\//i;

function httpsGetIpv4Json(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      family: 4,
      timeout: 15000,
      headers: {
        ...NSE_HEADERS,
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
        }
        try {
          const buf = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] || '').toLowerCase();
          let decoded = buf;
          if (enc.includes('br')) decoded = zlib.brotliDecompressSync(buf);
          else if (enc.includes('gzip')) decoded = zlib.gunzipSync(buf);
          else if (enc.includes('deflate')) decoded = zlib.inflateSync(buf);
          resolve(JSON.parse(decoded.toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${url} -> Request timeout`)));
    req.on('error', reject);
  });
}

async function fetchJsonRawSafe(url, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (i % 2 === 1) {
        const res = await fetch(url, { headers: NSE_HEADERS });
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return await res.json();
      }
      return await httpsGetIpv4Json(url);
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, i * 900));
      }
    }
  }
  throw lastErr;
}

async function fetchJsonSafe(url, attempts = 4) {
  const data = await fetchJsonRawSafe(url, attempts);
  return Array.isArray(data) ? data : [];
}

function cleanText(val) {
  if (val == null) return '';
  let s = String(val)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
  s = s.replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
  if (!s || s === '-' || s.toLowerCase() === 'null') return '';
  return s;
}

function extractSafeUrl(val) {
  if (!val) return '';
  const raw = String(val).trim();
  const hrefMatch = raw.match(/href\s*=\s*["']?([^"'\s>]+)["']?/i);
  const candidate = (hrefMatch ? hrefMatch[1] : raw).replace(/^"+|"+$/g, '').trim();
  return ALLOWED_DOC_URL_RE.test(candidate) ? candidate : '';
}

function parseNum(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = String(val == null ? '' : val).replace(/,/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseUpperBandPrice(priceStr) {
  const cleaned = String(priceStr == null ? '' : priceStr).replace(/,/g, '');
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length > 0 ? Math.max(...nums) : null;
}

function parseIssuePriceNum(val) {
  const cleaned = String(val == null ? '' : val).replace(/,/g, '').trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLotSize(str) {
  const s = cleanText(str).replace(/,/g, '');
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatIssueSizeShares(val) {
  const n = parseNum(val);
  if (n === null || n <= 0) return '--';
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr Shares`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L Shares`;
  return `${n.toLocaleString('en-IN')} Shares`;
}

function normalizeCurrentOrUpcoming(rows) {
  return (rows || [])
    .filter((r) => r && r.companyName)
    .map((r) => {
      const symbol = r.symbol ? String(r.symbol).trim().toUpperCase() : '';
      const issuePrice = cleanText(r.issuePrice) || '--';
      const issueShares = parseNum(r.issueSize || r.noOfSharesOffered);
      const upperPrice = parseUpperBandPrice(issuePrice);
      const issueSizeCr =
        issueShares && issueShares > 0 && upperPrice && upperPrice > 0
          ? Number(((issueShares * upperPrice) / 1e7).toFixed(2))
          : null;
      const sharesOffered = parseNum(r.noOfSharesOffered || r.issueSize);
      const sharesBid = parseNum(r.noOfsharesBid);
      const rawTimes = parseNum(r.noOfTime);
      const totalSubscriptionTimes = rawTimes !== null ? Number(rawTimes.toFixed(2)) : null;

      return {
        symbol,
        companyName: cleanText(r.companyName),
        series: cleanText(r.series || r.segment || 'Equity') || 'Equity',
        issueStartDate: cleanText(r.issueStartDate) || '--',
        issueEndDate: cleanText(r.issueEndDate) || '--',
        issuePrice,
        issueSizeText: formatIssueSizeShares(r.issueSize),
        status: cleanText(r.status),
        issueShares: issueShares && issueShares > 0 ? issueShares : null,
        upperPrice,
        issueSizeCr,
        sharesOffered: sharesOffered && sharesOffered > 0 ? sharesOffered : null,
        sharesBid: sharesBid !== null && sharesBid >= 0 ? sharesBid : null,
        totalSubscriptionTimes,
        lotSize: null,
        minInvestment: null,
        research: null
      };
    });
}

function parseIssueDetailPayload(detail, item) {
  if (!detail || typeof detail !== 'object') return null;

  const infoList = Array.isArray(detail.issueInfo && detail.issueInfo.dataList)
    ? detail.issueInfo.dataList
    : Array.isArray(detail.issueInfo)
      ? detail.issueInfo
      : [];

  const infoMap = new Map();
  for (const row of infoList) {
    if (!row || !row.title) continue;
    const key = String(row.title).trim().toLowerCase().replace(/\s+/g, ' ');
    if (key && !infoMap.has(key)) {
      infoMap.set(key, row.value);
    }
  }

  const getClean = (k) => cleanText(infoMap.get(k));
  const rawDiscount = getClean('discount');
  const discount =
    rawDiscount && !/^(nil|na|n\/a|none|not applicable|-)$/i.test(rawDiscount)
      ? rawDiscount
      : '';

  const bidLotText = getClean('bid lot') || getClean('minimum order quantity');
  const lotSize = parseLotSize(bidLotText);
  const minInvestment =
    lotSize && item.upperPrice && item.upperPrice > 0
      ? Math.round(lotSize * item.upperPrice)
      : null;

  const rawUpi = getClean('cut-off time for upi mandate confirmation');
  const upiCutoff = rawUpi ? rawUpi.split(/\.\s+/)[0] : '';

  const docMappings = [
    ['red herring prospectus', 'Red Herring Prospectus (RHP)'],
    ['ratios / basis of issue price', 'Ratios / Basis of Issue Price'],
    ['security parameters (pre anchor)', 'Pre-Anchor Parameters'],
    ['security parameters (post anchor)', 'Post-Anchor Parameters'],
    ['sample application forms', 'Sample Application Forms'],
    ['e-form link', 'NSE e-Form Portal']
  ];
  const documents = [];
  for (const [key, label] of docMappings) {
    const safeUrl = extractSafeUrl(infoMap.get(key));
    if (safeUrl) {
      documents.push({ label, url: safeUrl });
    }
  }

  const rawBids = Array.isArray(detail.bidDetails)
    ? detail.bidDetails
    : Array.isArray(detail.activeCat && detail.activeCat.dataList)
      ? detail.activeCat.dataList
      : Array.isArray(detail.activeCat)
        ? detail.activeCat
        : [];

  const subscription = [];
  let parsedTotalTimes = null;
  for (const row of rawBids) {
    if (!row || !row.category) continue;
    const cat = cleanText(row.category);
    const sr = row.srNo == null ? '' : cleanText(row.srNo);
    if (!cat || /^category$/i.test(cat) || /^sr\.?\s*no\.?$/i.test(sr)) continue;

    const offered = parseNum(row.noOfSharesOffered !== undefined ? row.noOfSharesOffered : row.noOfShareOffered);
    const bid = parseNum(row.noOfsharesBid !== undefined ? row.noOfsharesBid : row.noOfSharesBid);
    const rawT = parseNum(row.noOfTime !== undefined ? row.noOfTime : row.noOfTotalMeant);
    const times = rawT !== null ? Number(rawT.toFixed(2)) : null;

    if (/^total$/i.test(cat) && times !== null) {
      parsedTotalTimes = times;
    }

    subscription.push({
      srNo: sr,
      category: cat,
      offeredShares: offered,
      bidShares: bid,
      times
    });
  }

  const research = {
    issueType: getClean('issue type'),
    issueStructure: getClean('issue size'),
    faceValue: getClean('face value'),
    tickSize: getClean('tick size'),
    bidLotText,
    lotSize,
    minInvestment,
    discount,
    maxRetailAmount: getClean('maximum subscription amount for retail investor'),
    maxEmployeeAmount: getClean('maximum subscription amount for eligible employee'),
    maxShareholderAmount: getClean('maximum subscription amount for shareholders'),
    marketTimings: getClean('ipo market timings'),
    upiCutoff,
    leadManagers: getClean('book running lead managers'),
    sponsorBank: getClean('sponsor bank'),
    registrarName: getClean('name of the registrar'),
    registrarAddress: getClean('address of the registrar'),
    registrarContact: getClean('contact person name number and email id'),
    documents,
    subscription
  };

  const hasUsefulDetail = Boolean(
    research.issueType ||
    research.bidLotText ||
    research.leadManagers ||
    research.registrarName ||
    research.documents.length > 0 ||
    research.subscription.length > 0
  );

  if (!hasUsefulDetail) return null;
  return { research, lotSize, minInvestment, parsedTotalTimes };
}

async function enrichWithIpoDetails(items, prevItems) {
  const prevMap = new Map();
  for (const p of prevItems || []) {
    if (p && p.symbol) {
      prevMap.set(String(p.symbol).toUpperCase(), p);
    }
  }

  let enrichedCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.symbol) continue;

    let applied = false;
    try {
      const detail = await fetchJsonRawSafe(
        `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(item.symbol)}`,
        3
      );
      const parsed = parseIssueDetailPayload(detail, item);
      if (parsed) {
        item.lotSize = parsed.lotSize;
        item.minInvestment = parsed.minInvestment;
        item.research = parsed.research;
        if (item.totalSubscriptionTimes === null && parsed.parsedTotalTimes !== null) {
          item.totalSubscriptionTimes = parsed.parsedTotalTimes;
        }
        enrichedCount++;
        applied = true;
      }
    } catch (err) {
      console.warn(`IPO detail fetch notice (${item.symbol}):`, err.message);
    }

    if (!applied && prevMap.has(item.symbol)) {
      const prev = prevMap.get(item.symbol);
      if (prev.research) {
        item.research = prev.research;
        item.lotSize = prev.lotSize != null ? prev.lotSize : prev.research.lotSize || null;
        item.minInvestment = prev.minInvestment != null ? prev.minInvestment : prev.research.minInvestment || null;
      }
      if (item.totalSubscriptionTimes === null && prev.totalSubscriptionTimes != null) {
        item.totalSubscriptionTimes = prev.totalSubscriptionTimes;
      }
    }

    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return enrichedCount;
}

function normalizePast(rows, stockMap) {
  return (rows || [])
    .filter((r) => r && (r.companyName || r.company))
    .map((r) => {
      const sym = String(r.symbol || '').trim().toUpperCase();
      const issuePriceNum = parseIssuePriceNum(r.issuePrice);
      const meta = sym && stockMap.has(sym) ? stockMap.get(sym) : null;
      const cmp = meta && typeof meta.cmp === 'number' ? meta.cmp : null;
      const gainPct =
        issuePriceNum && cmp
          ? Number((((cmp - issuePriceNum) / issuePriceNum) * 100).toFixed(2))
          : null;
      return {
        symbol: sym,
        companyName: cleanText(r.companyName || r.company || sym),
        securityType: cleanText(r.securityType || 'EQ') || 'EQ',
        ipoStartDate: cleanText(r.ipoStartDate) || '--',
        ipoEndDate: cleanText(r.ipoEndDate) || '--',
        listingDate: cleanText(r.listingDate) || '--',
        priceRange: cleanText(r.priceRange) || '--',
        issuePrice: issuePriceNum,
        cmp,
        gainPct,
        marketCapCr: meta && typeof meta.marketCapCr === 'number' ? meta.marketCapCr : null,
        pe: meta && typeof meta.pe === 'number' ? meta.pe : null,
        sector: meta && meta.sector ? meta.sector : ''
      };
    });
}

async function main() {
  if (!fs.existsSync(MARKET_DIR)) {
    fs.mkdirSync(MARKET_DIR, { recursive: true });
  }

  const stockMap = new Map();
  if (fs.existsSync(SCREENER_INDEX_PATH)) {
    const { STOCKS_SCREENER_DATASET } = require(SCREENER_INDEX_PATH);
    for (const s of STOCKS_SCREENER_DATASET || []) {
      if (s && s.symbol) {
        stockMap.set(String(s.symbol).toUpperCase(), {
          cmp: typeof s.cmp === 'number' && s.cmp > 0 ? s.cmp : null,
          marketCapCr: typeof s.marketCapCr === 'number' && s.marketCapCr > 0 ? s.marketCapCr : null,
          pe: typeof s.pe === 'number' && Number.isFinite(s.pe) && s.pe > 0 ? s.pe : null,
          sector: s.sector ? String(s.sector).trim() : ''
        });
      }
    }
  }

  let prev = { openIpos: [], upcomingIpos: [], pastIpos: [] };
  if (fs.existsSync(JSON_OUT)) {
    try {
      prev = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')) || prev;
    } catch (_) {}
  }

  let openIpos = prev.openIpos || [];
  let upcomingIpos = prev.upcomingIpos || [];
  let pastIpos = prev.pastIpos || [];

  try {
    const rawOpen = await fetchJsonSafe('https://www.nseindia.com/api/ipo-current-issue');
    openIpos = normalizeCurrentOrUpcoming(rawOpen);
    const enrichedOpen = await enrichWithIpoDetails(openIpos, prev.openIpos);
    console.log(`✓ Synced Open IPOs: ${openIpos.length} (research enriched: ${enrichedOpen})`);
  } catch (err) {
    console.warn('Open IPOs fetch notice:', err.message);
    if (Array.isArray(openIpos) && openIpos.some((r) => r && r.symbol && !r.research)) {
      const enrichedFallback = await enrichWithIpoDetails(openIpos, prev.openIpos);
      console.log(`✓ Enriched existing Open IPOs: ${enrichedFallback}`);
    }
  }

  try {
    const rawUpcoming = await fetchJsonSafe('https://www.nseindia.com/api/all-upcoming-issues?category=ipo');
    upcomingIpos = normalizeCurrentOrUpcoming(rawUpcoming);
    const enrichedUpcoming = await enrichWithIpoDetails(upcomingIpos, prev.upcomingIpos);
    console.log(`✓ Synced Upcoming IPOs: ${upcomingIpos.length} (research enriched: ${enrichedUpcoming})`);
  } catch (err) {
    console.warn('Upcoming IPOs fetch notice:', err.message);
  }

  try {
    const rawPast = await fetchJsonSafe('https://www.nseindia.com/api/public-past-issues');
    pastIpos = normalizePast(rawPast, stockMap);
    console.log(`✓ Synced Past / Listed IPOs: ${pastIpos.length}`);
  } catch (err) {
    console.warn('Past IPOs fetch notice:', err.message);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'Official NSE Mainboard & SME IPO Disclosures',
    openIpos,
    upcomingIpos,
    pastIpos
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');

  const jsContent = `/**
 * Stocks 360 - Official NSE IPO Tracker Dataset (ipo-data.js)
 * Updated: ${payload.updatedAt}
 */
const STOCKS_IPO_DATA = ${JSON.stringify(payload)};

if (typeof window !== "undefined") {
  window.STOCKS_IPO_DATA = STOCKS_IPO_DATA;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = STOCKS_IPO_DATA;
}
`;
  fs.writeFileSync(JS_OUT, jsContent, 'utf8');
  console.log(`✓ Wrote ${JSON_OUT} and ${JS_OUT}`);
}

main().catch((err) => {
  console.error('IPO Tracker sync error:', err.message);
  process.exit(1);
});
