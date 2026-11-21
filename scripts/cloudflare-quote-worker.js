/**
 * Stocks 360 - Cloudflare Worker 15-Minute Delayed Quote Proxy
 * Free Tier: 100,000 requests/day at Rs 0/month.
 *
 * Deployment steps (1 minute):
 * 1. Create a free Worker at https://dash.cloudflare.com -> Workers & Pages -> Create
 * 2. Paste this entire file into the Worker editor and click Deploy
 * 3. Copy your Worker URL (e.g. https://stocks360-quotes.<subdomain>.workers.dev)
 *    and set `quoteProxyUrl` in Firebase config / `window.STOCKS360_QUOTE_PROXY_URL`.
 */

const EDGE_CACHE_SECONDS = 900; // Exact 15-minute delay cache

function corsHeaders(origin) {
  const allowed = origin && (origin.includes('stocks360.web.app') || origin.includes('localhost') || origin.includes('127.0.0.1'))
    ? origin
    : 'https://stocks360.web.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

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

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const ticker = exchange === 'BSE'
      ? `${bseCode || rawSym}.BO`
      : `${rawSym}.NS`;

    try {
      const upstreamUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=15m&range=1d`;
      const upstreamRes = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!upstreamRes.ok) {
        return new Response(JSON.stringify({ error: 'Upstream unavailable' }), {
          status: 502,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const data = await upstreamRes.json();
      const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
      const meta = result && result.meta ? result.meta : null;
      if (!meta || typeof meta.regularMarketPrice !== 'number') {
        return new Response(JSON.stringify({ error: 'No quote found' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const cmp = Number(meta.regularMarketPrice.toFixed(2));
      const prevClose = Number((meta.chartPreviousClose || meta.previousClose || cmp).toFixed(2));
      const dayChange = Number((cmp - prevClose).toFixed(2));
      const dayChangePct = prevClose > 0 ? Number(((dayChange / prevClose) * 100).toFixed(2)) : 0;

      const payload = {
        symbol: rawSym || bseCode,
        exchange,
        cmp,
        dayOpen: typeof meta.regularMarketOpen === 'number' ? Number(meta.regularMarketOpen.toFixed(2)) : cmp,
        dayHigh: typeof meta.regularMarketDayHigh === 'number' ? Number(meta.regularMarketDayHigh.toFixed(2)) : cmp,
        dayLow: typeof meta.regularMarketDayLow === 'number' ? Number(meta.regularMarketDayLow.toFixed(2)) : cmp,
        prevClose,
        dayChange,
        dayChangePct,
        isGain: dayChange >= 0,
        delayedMinutes: 15,
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
