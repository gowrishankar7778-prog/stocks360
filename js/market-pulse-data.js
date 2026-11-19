/**
 * Stocks 360 - Market Pulse Data (FII/DII Activity & Market Breadth)
 * Source: Official NSE FII/DII Cash Activity & Exchange Bhavcopy
 * Updated: 2026-11-19T14:24:54.468Z
 */
const STOCKS_MARKET_PULSE = {"updatedAt":"2026-11-19T14:24:54.468Z","source":"Official NSE FII/DII Cash Activity & Exchange Bhavcopy","fiiDiiLatest":{"date":"2026-11-19","dateDisplay":"19-Nov-2026","fii":{"buyCr":20706.95,"sellCr":13295.54,"netCr":7411.41},"dii":{"buyCr":17651.5,"sellCr":19008.07,"netCr":-1356.57},"combinedNetCr":6054.84},"fiiDiiHistory":[{"date":"2026-11-19","dateDisplay":"19-Nov-2026","fii":{"buyCr":20706.95,"sellCr":13295.54,"netCr":7411.41},"dii":{"buyCr":17651.5,"sellCr":19008.07,"netCr":-1356.57},"combinedNetCr":6054.84},{"date":"2026-11-18","dateDisplay":"18-Nov-2026","fii":{"buyCr":17913.16,"sellCr":12046.38,"netCr":5866.78},"dii":{"buyCr":14602.25,"sellCr":17762.15,"netCr":-3159.9},"combinedNetCr":2706.88}],"breadth":{"totalStocks":5761,"advances":2822,"declines":2581,"unchanged":358,"adRatio":1.09,"nearHigh52":989,"nearLow52":1519,"goldenCrossCount":1251,"aboveDma200":1922,"sessionLabel":"Today (19 Nov), 5:40 pm IST","topSectors":[{"sector":"Banking & Financial Services","count":49,"avgChangePct":1.22,"advances":39,"declines":10},{"sector":"Automotive & Ancillaries","count":148,"avgChangePct":0.9,"advances":92,"declines":53},{"sector":"Consumer & FMCG","count":240,"avgChangePct":0.67,"advances":142,"declines":92},{"sector":"Energy, Oil & Power","count":147,"avgChangePct":0.55,"advances":87,"declines":57}],"laggingSectors":[{"sector":"Retail & Lifestyle","count":233,"avgChangePct":-0.29,"advances":85,"declines":139},{"sector":"Financial Services & NBFC","count":368,"avgChangePct":-0.11,"advances":163,"declines":175},{"sector":"Chemicals & Materials","count":354,"avgChangePct":-0.04,"advances":159,"declines":179},{"sector":"Agri & Fertilizers","count":89,"avgChangePct":0.04,"advances":45,"declines":43}]}};

if (typeof window !== "undefined") {
  window.STOCKS_MARKET_PULSE = STOCKS_MARKET_PULSE;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = STOCKS_MARKET_PULSE;
}
