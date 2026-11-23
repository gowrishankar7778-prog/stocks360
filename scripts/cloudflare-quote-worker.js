/**
 * Stocks 360 - Cloudflare Worker 15-Minute Delayed Quote Proxy
 * Free Tier: 100,000 requests/day at Rs 0/month.
 *
 * Deployment steps (1 minute):
 * 1. Open https://dash.cloudflare.com -> Workers & Pages -> stocks360-quotes -> Edit code
 * 2. Paste this entire file into the Worker editor and click Deploy
 * 3. Configured in js/stock-search.js (`getQuoteProxyUrl`) or `FIREBASE_CONFIG.quoteProxyUrl`.
 */

const EDGE_CACHE_SECONDS = 900; // Exact 15-minute delay cache

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function buildTickerCandidates(rawSym, exchange, bseCode) {
  const candidates = [];
  const pushUnique = (ticker) => {
    if (ticker && !candidates.includes(ticker)) {
      candidates.push(ticker);
    }
  };

  if (exchange === 'BSE') {
    if (/[A-Z]/.test(rawSym)) {
      pushUnique(`${rawSym}.BO`);
      if (bseCode) pushUnique(`${bseCode}.BO`);
    } else {
      pushUnique(`${bseCode || rawSym}.BO`);
      if (rawSym) pushUnique(`${rawSym}.BO`);
    }
  } else {
    pushUnique(`${rawSym}.NS`);
  }

  return candidates;
}

function extractDayOpen(result, meta, cmp) {
  const opens = result && result.indicators && Array.isArray(result.indicators.quote) && result.indicators.quote[0]
    ? result.indicators.quote[0].open
    : null;
  if (Array.isArray(opens)) {
    for (let i = 0; i < opens.length; i++) {
      if (typeof opens[i] === 'number' && Number.isFinite(opens[i]) && opens[i] > 0) {
        return Number(opens[i].toFixed(2));
      }
    }
  }
  if (meta && typeof meta.regularMarketOpen === 'number' && Number.isFinite(meta.regularMarketOpen) && meta.regularMarketOpen > 0) {
    return Number(meta.regularMarketOpen.toFixed(2));
  }
  return cmp;
}

async function fetchYahooChart(ticker) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let sawOkWithoutQuote = false;

  for (let i = 0; i < hosts.length; i++) {
    const upstreamUrl = `https://${hosts[i]}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=15m&range=1d`;
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!upstreamRes || !upstreamRes.ok) {
        continue;
      }
      const data = await upstreamRes.json();
      const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
      const meta = result && result.meta ? result.meta : null;
      if (meta && typeof meta.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)) {
        return { ok: true, result, meta };
      }
      sawOkWithoutQuote = true;
    } catch (_) {
      // Fall through to secondary Yahoo Finance host
    }
  }

  return { ok: false, sawOkWithoutQuote };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = corsHeaders();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== '/quote' && url.pathname !== '/') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const rawSym = (url.searchParams.get('symbol') || '').trim().toUpperCase().replace(/[^A-Z0-9&-]/g, '');
    const exchange = (url.searchParams.get('exchange') || 'NSE').trim().toUpperCase() === 'BSE' ? 'BSE' : 'NSE';
    const bseCode = (url.searchParams.get('bseCode') || '').trim().replace(/[^0-9]/g, '');

    if (!rawSym && !bseCode) {
      return new Response(JSON.stringify({ error: 'Missing symbol' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const normalizedUrl = new URL(url.origin + '/quote');
    normalizedUrl.searchParams.set('symbol', rawSym);
    normalizedUrl.searchParams.set('exchange', exchange);
    if (bseCode) normalizedUrl.searchParams.set('bseCode', bseCode);
    const cacheKey = new Request(normalizedUrl.toString(), { method: 'GET' });

    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const candidates = buildTickerCandidates(rawSym, exchange, bseCode);

    try {
      let matched = null;
      let anyNoQuote = false;

      for (let i = 0; i < candidates.length; i++) {
        const res = await fetchYahooChart(candidates[i]);
        if (res.ok) {
          matched = res;
          break;
        }
        if (res.sawOkWithoutQuote) {
          anyNoQuote = true;
        }
      }

      if (!matched) {
        const status = anyNoQuote ? 404 : 502;
        const message = anyNoQuote ? 'No quote found' : 'Upstream unavailable';
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const { result, meta } = matched;
      const cmp = Number(meta.regularMarketPrice.toFixed(2));
      const dayOpen = extractDayOpen(result, meta, cmp);
      const dayHigh = typeof meta.regularMarketDayHigh === 'number' ? Number(meta.regularMarketDayHigh.toFixed(2)) : cmp;
      const dayLow = typeof meta.regularMarketDayLow === 'number' ? Number(meta.regularMarketDayLow.toFixed(2)) : cmp;
      const prevClose = Number((meta.chartPreviousClose || meta.previousClose || cmp).toFixed(2));
      const dayChange = Number((cmp - prevClose).toFixed(2));
      const dayChangePct = prevClose > 0 ? Number(((dayChange / prevClose) * 100).toFixed(2)) : 0;

      const payload = {
        symbol: rawSym || bseCode,
        exchange,
        cmp,
        dayOpen,
        dayHigh,
        dayLow,
        prevClose,
        dayChange,
        dayChangePct,
        isGain: dayChange >= 0,
        delayedMinutes: 15,
        marketTime: meta.regularMarketTime || null,
        timestamp: Date.now()
      };

      const response = new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${EDGE_CACHE_SECONDS}`
        }
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Quote proxy error' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  }
};
