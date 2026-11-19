/**
 * Stocks 360 - Market Pulse Data (FII/DII Activity & Market Breadth)
 * Source: Official NSE FII/DII Cash Activity & Exchange Bhavcopy
 * Updated: 2026-11-19T11:50:05.191Z
 */
const STOCKS_MARKET_PULSE = {"updatedAt":"2026-11-19T11:50:05.191Z","source":"Official NSE FII/DII Cash Activity & Exchange Bhavcopy","fiiDiiLatest":{"date":"2026-11-18","dateDisplay":"18-Nov-2026","fii":{"buyCr":17913.16,"sellCr":12046.38,"netCr":5866.78},"dii":{"buyCr":14602.25,"sellCr":17762.15,"netCr":-3159.9},"combinedNetCr":2706.88},"fiiDiiHistory":[{"date":"2026-11-18","dateDisplay":"18-Nov-2026","fii":{"buyCr":17913.16,"sellCr":12046.38,"netCr":5866.78},"dii":{"buyCr":14602.25,"sellCr":17762.15,"netCr":-3159.9},"combinedNetCr":2706.88}],"breadth":{"totalStocks":5361,"advances":1988,"declines":3097,"unchanged":276,"adRatio":0.64,"nearHigh52":2732,"nearLow52":2746,"goldenCrossCount":598,"aboveDma200":1150,"sessionLabel":"Today (17 Nov), 4:29 pm IST","topSectors":[{"sector":"Banking & Financial Services","count":49,"avgChangePct":0.29,"advances":30,"declines":19},{"sector":"Diversified Equities","count":1481,"avgChangePct":0.12,"advances":686,"declines":646},{"sector":"Financial Services & NBFC","count":348,"avgChangePct":0.08,"advances":151,"declines":170},{"sector":"Textiles & Apparels","count":211,"avgChangePct":-0.28,"advances":85,"declines":116}],"laggingSectors":[{"sector":"Agri & Fertilizers","count":89,"avgChangePct":-1.85,"advances":16,"declines":70},{"sector":"Capital Goods & Industrial Machinery","count":286,"avgChangePct":-1.4,"advances":69,"declines":212},{"sector":"Automotive & Ancillaries","count":147,"avgChangePct":-1.13,"advances":40,"declines":104},{"sector":"Energy, Oil & Power","count":144,"avgChangePct":-1.08,"advances":40,"declines":103}]}};

if (typeof window !== "undefined") {
  window.STOCKS_MARKET_PULSE = STOCKS_MARKET_PULSE;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = STOCKS_MARKET_PULSE;
}
