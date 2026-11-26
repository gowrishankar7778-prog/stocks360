/**
 * Stocks 360 - Cloudflare Worker
 * 1. 15-Minute Delayed Quote Proxy (/quote)
 * 2. Secure AI Screener Query Parser (/api/parse-screen)
 *
 * Free Tier: 100,000 requests/day at Rs 0/month.
 *
 * Deployment steps:
 * 1. Open https://dash.cloudflare.com -> Workers & Pages -> stocks360-quotes -> Edit code
 * 2. Paste this entire file into the Worker editor and click Deploy
 * 3. Store `GEMINI_API_KEY` under Settings -> Variables and Secrets -> Secrets
 */

const EDGE_CACHE_SECONDS = 900; // 15-minute delay cache

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function buildTickerCandidates(rawSym, exchange, bseCode) {
  const candidates = [];
  const pushUnique = (ticker) => {
    if (ticker && !candidates.includes(ticker)) {
      candidates.push(ticker);
    }
  };

  if (rawSym.startsWith('^') || exchange === 'INDEX') {
    pushUnique(rawSym.startsWith('^') ? rawSym : `^${rawSym}`);
    return candidates;
  }

  if (rawSym.includes('=') || exchange === 'COMMODITY' || exchange === 'FX' || exchange === 'GLOBAL') {
    pushUnique(rawSym);
    return candidates;
  }

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
  return typeof meta.regularMarketDayOpen === 'number' ? Number(meta.regularMarketDayOpen.toFixed(2)) : cmp;
}

async function tryFetchYahooChart(ticker) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let sawOkWithoutQuote = false;

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
      const upstreamRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
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

    // -------------------------------------------------------------
    // SECURE AI SCREENER QUERY PARSER (ZERO CLIENT-SIDE EXPOSURE)
    // -------------------------------------------------------------
    if (url.pathname === '/api/parse-screen') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST required' }), {
          status: 405,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const apiKey = env && env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : null;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured in Cloudflare Worker' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      let reqBody;
      try {
        reqBody = await request.json();
      } catch (_) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const userPrompt = String(reqBody.prompt || '').trim();
      if (!userPrompt) {
        return new Response(JSON.stringify({ error: 'Prompt is required' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const systemInstruction =
        "You are Stocks 360 AI, an expert quantitative stock screener parser for Indian Equities (NSE/BSE). " +
        "Translate user plain-English screening words into strict JSON filter criteria matching our screener database fields. " +
        "Fields available: " +
        "- 'cmp' (Current Market Price in INR) " +
        "- 'marketCapCr' (Market Cap in INR Crores: Large Cap > 20000, Mid Cap 5000 to 20000, Small Cap < 5000) " +
        "- 'pe' (P/E Ratio) " +
        "- 'roePct' (Return on Equity %) " +
        "- 'rocePct' (Return on Capital Employed %) " +
        "- 'debtToEquity' (Debt to Equity Ratio: Low Debt <= 0.5, Zero Debt <= 0.05) " +
        "- 'dma50' (50-Day Moving Average in INR) " +
        "- 'dma200' (200-Day Moving Average in INR) " +
        "- 'goldenCross' (Boolean: true if 50 DMA > 200 DMA) " +
        "- 'rsi14' (14-day Relative Strength Index: Oversold <= 35, Bullish 50 to 70, Overbought >= 75) " +
        "- 'volume' (Day's Trading Volume) " +
        "- 'volumeSurge' (Volume Surge Ratio vs 10D avg, e.g. >= 1.25) " +
        "- 'deliveryPct' (Demat Delivery Percentage, e.g. >= 50 for high accumulation) " +
        "- 'sma20', 'ema20', 'ema50', 'ema200' (Moving Averages in INR) " +
        "- 'cmp_vs_dma50', 'cmp_vs_dma200', 'cmp_vs_ema20', 'cmp_vs_ema50', 'cmp_vs_ema200' (Operator '>' or '<', value: 0) " +
        "- 'ema50_vs_ema200' (Operator '>', value: 0 for Bullish EMA trend) " +
        "- 'macdHist' (MACD Histogram: > 0 for bullish crossover) " +
        "- 'adx14' (ADX Trend Strength: >= 25 for strong trend) " +
        "- 'maBullCount' (Number of Bullish MAs out of 16, e.g. >= 10) " +
        "- 'sector' (Exact sector string e.g. 'Information Technology', 'Financial Services', 'Automobile', 'Healthcare & Pharma', 'Capital Goods', 'Consumer Goods', 'Oil & Gas', 'Metals & Mining', 'Telecommunication') " +
        "CRITICAL OUTPUT FORMAT: Return ONLY valid JSON with keys: " +
        "'interpretation' (A warm, friendly 1-sentence plain-English explanation of what you understood), " +
        "'suggestedName' (A concise 3-5 word title for this screen), " +
        "'suggestedDescription' (A brief 1-sentence educational description), " +
        "'requestedColumns' (Array of relevant field names to display), " +
        "'filters' (Array of filter objects: { field, operator, value, label }). " +
        "Valid operators: '>', '>=', '<', '<=', '=='.";

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;
      const geminiPayload = {
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nUSER SCREENER REQUEST: ${userPrompt}` }] }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload)
        });

        const geminiData = await geminiRes.json();
        if (geminiData.error) {
          // If 3.5-flash-lite returns error, attempt fallback to gemini-3.8-flash
          const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
          const fallbackRes = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
          });
          const fallbackData = await fallbackRes.json();
          if (fallbackData.error) {
            return new Response(JSON.stringify({ error: fallbackData.error.message }), {
              status: 502,
              headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          const text = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text;
          return new Response(text || JSON.stringify({ error: 'Empty AI response' }), {
            status: 200,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        return new Response(text || JSON.stringify({ error: 'Empty AI response' }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to contact Gemini API', details: err.message }), {
          status: 502,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // -------------------------------------------------------------
    // SECURE CONVERSATIONAL AI CHAT PROXY (ZERO CLIENT-SIDE EXPOSURE)
    // -------------------------------------------------------------
    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST required' }), {
          status: 405,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const apiKey = env && env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : null;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured in Cloudflare Worker' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      let reqBody;
      try {
        reqBody = await request.json();
      } catch (_) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const systemInstruction = String(reqBody.systemInstruction || 'You are Stocks 360 AI, an educational stock market assistant.').trim();
      const prompt = String(reqBody.prompt || '').trim();
      const contents = Array.isArray(reqBody.contents) && reqBody.contents.length > 0
        ? reqBody.contents
        : [{ role: 'user', parts: [{ text: prompt }] }];

      const temperature = typeof reqBody.temperature === 'number' ? reqBody.temperature : 0.55;
      const maxOutputTokens = typeof reqBody.maxOutputTokens === 'number' ? reqBody.maxOutputTokens : 850;

      const payloadWithSearch = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: contents,
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxOutputTokens
        }
      };

      const payloadNoSearch = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: contents,
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxOutputTokens
        }
      };

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

      try {
        // 1. Try with Google Search Grounding for live web & breaking news
        let geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadWithSearch)
        });

        let geminiData = await geminiRes.json();

        // 2. If search tool is restricted (e.g. 429 quota on free-tier keys without billing), fallback to standard generation
        if (geminiData.error) {
          geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadNoSearch)
          });
          geminiData = await geminiRes.json();
        }

        // 3. If 3.5-flash-lite still has an issue, fallback to gemini-3.8-flash
        if (geminiData.error) {
          const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
          const fallbackRes = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadNoSearch)
          });
          const fallbackData = await fallbackRes.json();
          if (fallbackData.error) {
            return new Response(JSON.stringify({ error: fallbackData.error.message }), {
              status: 502,
              headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          const text = fallbackData.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(' ').trim() || '';
          return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const text = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(' ').trim() || '';
        return new Response(JSON.stringify({ text }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to contact Gemini API', details: err.message }), {
          status: 502,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // -------------------------------------------------------------
    // 15-MINUTE DELAYED QUOTE PROXY (/quote)
    // -------------------------------------------------------------
    if (url.pathname !== '/quote' && url.pathname !== '/') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const rawSym = (url.searchParams.get('symbol') || '').trim().toUpperCase();
    const exchange = (url.searchParams.get('exchange') || 'NSE').trim().toUpperCase();
    const bseCode = (url.searchParams.get('bseCode') || '').trim();

    if (!rawSym && !bseCode) {
      return new Response(JSON.stringify({ error: 'Missing symbol or bseCode parameter' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const tickerCandidates = buildTickerCandidates(rawSym, exchange, bseCode);

    try {
      let matched = null;
      let saw404Equivalent = false;

      for (const ticker of tickerCandidates) {
        const attempt = await tryFetchYahooChart(ticker);
        if (attempt.ok) {
          matched = attempt;
          break;
        }
        if (attempt.sawOkWithoutQuote) {
          saw404Equivalent = true;
        }
      }

      if (!matched) {
        return new Response(JSON.stringify({
          error: 'Symbol not found on upstream provider',
          symbol: rawSym || bseCode,
          exchange,
          saw404: saw404Equivalent
        }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const { result, meta } = matched;
      const cmp = Number(meta.regularMarketPrice.toFixed(2));
      const dayOpen = extractDayOpen(result, meta, cmp);
      const dayHigh = typeof meta.regularMarketDayHigh === 'number' ? Number(meta.regularMarketDayHigh.toFixed(2)) : cmp;
      const dayLow = typeof meta.regularMarketDayLow === 'number' ? Number(meta.regularMarketDayLow.toFixed(2)) : cmp;
      const prevClose = Number((meta.chartPreviousClose || meta.previousClose || cmp).toFixed(2));
      const high52 = typeof meta.fiftyTwoWeekHigh === 'number' && Number.isFinite(meta.fiftyTwoWeekHigh)
        ? Number(meta.fiftyTwoWeekHigh.toFixed(2))
        : null;
      const low52 = typeof meta.fiftyTwoWeekLow === 'number' && Number.isFinite(meta.fiftyTwoWeekLow)
        ? Number(meta.fiftyTwoWeekLow.toFixed(2))
        : null;
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
        high52,
        low52,
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
