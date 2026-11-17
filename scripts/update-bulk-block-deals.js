/**
 * Stocks 360 - Automated Official NSE Bulk & Block Deals Synchronizer
 * Scheduled every weekday at 6:45 PM IST after NSE post-market institutional deal files publish.
 *
 * Sources (100% Official Static NSE Feeds, Cost: Rs 0):
 * - https://nsearchives.nseindia.com/content/equities/bulk.csv
 * - https://nsearchives.nseindia.com/content/equities/block.csv
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BULK_CSV_URL = 'https://nsearchives.nseindia.com/content/equities/bulk.csv';
const BLOCK_CSV_URL = 'https://nsearchives.nseindia.com/content/equities/block.csv';
const OUT_DIR = path.join(__dirname, '..', 'data', 'market');
const OUT_FILE = path.join(OUT_DIR, 'bulk-block-deals.json');

const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

function fetchText(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    if (redirectsLeft <= 0) return resolve({ status: 0, body: '' });
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
        'Referer': 'https://www.nseindia.com/'
      },
      timeout: 20000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchText(nextUrl, redirectsLeft - 1));
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
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

function parseDealDateMs(dateStr) {
  const m = String(dateStr || '').trim().match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (!m) return 0;
  const mon = MONTHS[m[2].toUpperCase()];
  if (mon === undefined) return 0;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
}

function parseDealsCsv(csvText, dealType) {
  const deals = [];
  if (!csvText) return deals;
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return deals;

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    date: headers.findIndex((h) => h.includes('date')),
    symbol: headers.findIndex((h) => h === 'symbol'),
    name: headers.findIndex((h) => h.includes('security')),
    client: headers.findIndex((h) => h.includes('client')),
    side: headers.findIndex((h) => h.includes('buy') || h.includes('sell')),
    qty: headers.findIndex((h) => h.includes('quantity')),
    price: headers.findIndex((h) => h.includes('price'))
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const date = (cols[idx.date] || '').trim().toUpperCase();
    const symbol = (cols[idx.symbol] || '').trim().toUpperCase();
    if (!date || !symbol || /NO\s*RECORDS/i.test(date) || /NO\s*RECORDS/i.test(symbol)) continue;

    const qty = Math.round(Number(String(cols[idx.qty] || '').replace(/,/g, '')) || 0);
    const price = Number(String(cols[idx.price] || '').replace(/,/g, '')) || 0;
    if (qty <= 0 || price <= 0) continue;

    const sideRaw = String(cols[idx.side] || '').trim().toUpperCase();
    const side = sideRaw.startsWith('S') ? 'SELL' : 'BUY';
    const companyName = (cols[idx.name] || symbol).trim();
    const clientName = (cols[idx.client] || 'Institutional Client').trim();
    const valueCr = Number(((qty * price) / 10000000).toFixed(2));

    deals.push({
      date,
      dealType,
      symbol,
      companyName,
      clientName,
      side,
      quantity: qty,
      price: Number(price.toFixed(2)),
      valueCr
    });
  }
  return deals;
}

function dealKey(d) {
  return `${d.date}|${d.dealType}|${d.symbol}|${d.clientName}|${d.side}|${d.quantity}|${d.price}`;
}

function computeStockNetSummaries(deals) {
  const byStock = new Map();
  for (const d of deals) {
    const k = `${d.date}|${d.symbol}`;
    if (!byStock.has(k)) {
      byStock.set(k, {
        date: d.date,
        symbol: d.symbol,
        companyName: d.companyName,
        dealTypes: new Set(),
        buyQty: 0,
        sellQty: 0,
        buyAmt: 0,
        sellAmt: 0,
        buyDeals: 0,
        sellDeals: 0,
        clients: new Map()
      });
    }
    const g = byStock.get(k);
    g.dealTypes.add(d.dealType || 'BULK');
    if (!g.clients.has(d.clientName)) {
      g.clients.set(d.clientName, { clientName: d.clientName, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 });
    }
    const c = g.clients.get(d.clientName);
    const amt = (Number(d.quantity) || 0) * (Number(d.price) || 0);
    if (d.side === 'SELL') {
      g.sellQty += Number(d.quantity) || 0;
      g.sellAmt += amt;
      g.sellDeals++;
      c.sellQty += Number(d.quantity) || 0;
      c.sellAmt += amt;
    } else {
      g.buyQty += Number(d.quantity) || 0;
      g.buyAmt += amt;
      g.buyDeals++;
      c.buyQty += Number(d.quantity) || 0;
      c.buyAmt += amt;
    }
  }

  return Array.from(byStock.values()).map((g) => {
    const netQty = g.buyQty - g.sellQty;
    const buyValueCr = Number((g.buyAmt / 10000000).toFixed(2));
    const sellValueCr = Number((g.sellAmt / 10000000).toFixed(2));
    const netValueCr = Number((buyValueCr - sellValueCr).toFixed(2));
    let pureBuyersCount = 0;
    let pureSellersCount = 0;
    let topNetBuyer = null;
    let topNetSeller = null;

    for (const c of g.clients.values()) {
      const cNetQty = c.buyQty - c.sellQty;
      const cNetValCr = Number(((c.buyAmt - c.sellAmt) / 10000000).toFixed(2));
      if (cNetQty > 0) {
        pureBuyersCount++;
        if (!topNetBuyer || cNetQty > topNetBuyer.netQty) {
          topNetBuyer = { clientName: c.clientName, netQty: cNetQty, netValueCr: cNetValCr };
        }
      } else if (cNetQty < 0) {
        pureSellersCount++;
        if (!topNetSeller || cNetQty < topNetSeller.netQty) {
          topNetSeller = { clientName: c.clientName, netQty: cNetQty, netValueCr: cNetValCr };
        }
      }
    }

    return {
      date: g.date,
      dealType: Array.from(g.dealTypes).join('+'),
      symbol: g.symbol,
      companyName: g.companyName,
      buyQty: g.buyQty,
      sellQty: g.sellQty,
      buyValueCr,
      sellValueCr,
      avgBuyPrice: g.buyQty > 0 ? Number((g.buyAmt / g.buyQty).toFixed(2)) : 0,
      avgSellPrice: g.sellQty > 0 ? Number((g.sellAmt / g.sellQty).toFixed(2)) : 0,
      netQty,
      netValueCr,
      direction: netQty > 0 && netValueCr > 0 ? 'NET_BUYING' : (netQty < 0 && netValueCr < 0 ? 'NET_SELLING' : 'NEUTRAL'),
      pureBuyersCount,
      pureSellersCount,
      topNetBuyer,
      topNetSeller
    };
  });
}

async function run() {
  console.log('Stocks 360: Starting Official NSE Bulk & Block Deals synchronizer...');
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const [bulkRes, blockRes] = await Promise.all([
    fetchText(BULK_CSV_URL),
    fetchText(BLOCK_CSV_URL)
  ]);

  const freshBulk = bulkRes.status === 200 ? parseDealsCsv(bulkRes.body, 'BULK') : [];
  const freshBlock = blockRes.status === 200 ? parseDealsCsv(blockRes.body, 'BLOCK') : [];
  console.log(`✓ Fetched official NSE Bulk Deals: ${freshBulk.length}, Block Deals: ${freshBlock.length}`);

  let existingDeals = [];
  if (fs.existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      if (prev && Array.isArray(prev.deals)) {
        existingDeals = prev.deals;
      }
    } catch (_) {}
  }

  const freshAll = [...freshBulk, ...freshBlock];
  if (freshAll.length === 0 && existingDeals.length === 0) {
    console.warn('Warning: Neither bulk nor block deals CSV returned rows. Skipping write.');
    return;
  }

  // Merge fresh deals with recent history (retaining latest 1,000 deduplicated deals)
  const mergedMap = new Map();
  for (const d of freshAll) {
    mergedMap.set(dealKey(d), d);
  }
  for (const d of existingDeals) {
    const k = dealKey(d);
    if (!mergedMap.has(k)) {
      mergedMap.set(k, d);
    }
  }

  const mergedDeals = Array.from(mergedMap.values());
  mergedDeals.sort((a, b) => {
    const dtDiff = parseDealDateMs(b.date) - parseDealDateMs(a.date);
    if (dtDiff !== 0) return dtDiff;
    return (Number(b.valueCr) || 0) - (Number(a.valueCr) || 0);
  });

  const retainedDeals = mergedDeals.slice(0, 1000);
  const latestTradeDate = retainedDeals[0] ? retainedDeals[0].date : '';
  const latestDeals = retainedDeals.filter((d) => d.date === latestTradeDate);

  let bulkCount = 0;
  let blockCount = 0;
  let buyDealsCount = 0;
  let sellDealsCount = 0;
  let buyValueCr = 0;
  let sellValueCr = 0;

  for (const d of latestDeals) {
    if (d.dealType === 'BLOCK') blockCount++;
    else bulkCount++;
    if (d.side === 'SELL') {
      sellDealsCount++;
      sellValueCr += Number(d.valueCr) || 0;
    } else {
      buyDealsCount++;
      buyValueCr += Number(d.valueCr) || 0;
    }
  }

  const stockNetSummaries = computeStockNetSummaries(retainedDeals);
  const latestNetSummaries = stockNetSummaries.filter((s) => s.date === latestTradeDate);
  const netBuyingStocks = latestNetSummaries.filter((s) => s.direction === 'NET_BUYING');
  const netSellingStocks = latestNetSummaries.filter((s) => s.direction === 'NET_SELLING');
  const netBuyConvictionCr = Number(netBuyingStocks.reduce((acc, s) => acc + s.netValueCr, 0).toFixed(2));
  const netSellConvictionCr = Number(Math.abs(netSellingStocks.reduce((acc, s) => acc + s.netValueCr, 0)).toFixed(2));

  const now = new Date();
  const timeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const lastUpdatedLabel = `Today (${dateString}), ${timeString} IST`;

  const payload = {
    source: 'National Stock Exchange of India (bulk.csv & block.csv)',
    lastUpdated: lastUpdatedLabel,
    latestTradeDate,
    summary: {
      latestDateDeals: latestDeals.length,
      totalStoredDeals: retainedDeals.length,
      bulkCount,
      blockCount,
      buyDealsCount,
      sellDealsCount,
      buyValueCr: Number(buyValueCr.toFixed(2)),
      sellValueCr: Number(sellValueCr.toFixed(2)),
      netBuyingStocksCount: netBuyingStocks.length,
      netSellingStocksCount: netSellingStocks.length,
      netBuyConvictionCr,
      netSellConvictionCr
    },
    stockNetSummaries,
    deals: retainedDeals
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✓ Saved ${retainedDeals.length} official NSE Bulk & Block Deals (latest date: ${latestTradeDate}, ${latestDeals.length} deals) to data/market/bulk-block-deals.json`);
}

run().catch((err) => {
  console.error('Bulk/Block Deals sync error:', err.message);
  process.exit(1);
});
