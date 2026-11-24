/**
 * Stocks 360 - Comprehensive Technical Indicators & Moving Averages Engine
 * Computes exact EOD Moving Averages (SMA & EMA for 5, 10, 20, 26, 30, 50, 100, 200),
 * Momentum & Trend Oscillators (RSI, MACD, Bollinger Bands, ADX, ATR, Stochastic, ROC),
 * Fibonacci Retracements, and Classic Pivot Points from daily OHLCV bars.
 */

const MA_PERIODS = [5, 10, 20, 26, 30, 50, 100, 200];

function round2(n) {
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function calcSma(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sum += closes[i];
  }
  return sum / period;
}

function calcEmaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  const out = new Array(values.length).fill(null);
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

function calcEma(closes, period) {
  const series = calcEmaSeries(closes, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

function calcRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMacd(closes, fast = 12, slow = 26, signal = 9) {
  if (!Array.isArray(closes) || closes.length < slow + signal) return null;
  const emaFast = calcEmaSeries(closes, fast);
  const emaSlow = calcEmaSeries(closes, slow);
  const macdSeries = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdSeries.push(emaFast[i] - emaSlow[i]);
    }
  }
  if (macdSeries.length < signal) return null;
  const sigSeries = calcEmaSeries(macdSeries, signal);
  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = sigSeries[sigSeries.length - 1];
  if (macdLine === null || signalLine === null) return null;
  const histogram = macdLine - signalLine;
  const prevHist = macdSeries.length >= 2 && sigSeries[sigSeries.length - 2] !== null
    ? macdSeries[macdSeries.length - 2] - sigSeries[sigSeries.length - 2]
    : null;
  return {
    macd: round2(macdLine),
    signal: round2(signalLine),
    histogram: round2(histogram),
    prevHistogram: round2(prevHist)
  };
}

function calcBollinger(closes, period = 20, mult = 2) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + mult * stdDev;
  const lower = middle - mult * stdDev;
  const cmp = closes[closes.length - 1];
  const widthPct = middle > 0 ? ((upper - lower) / middle) * 100 : null;
  const posPct = upper > lower ? ((cmp - lower) / (upper - lower)) * 100 : 50;
  return {
    upper: round2(upper),
    middle: round2(middle),
    lower: round2(lower),
    widthPct: round2(widthPct),
    posPct: round2(posPct)
  };
}

function calcAtrAndAdx(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length < period + 1) {
    return { atr: null, atrPct: null, adx: null, plusDi: null, minusDi: null };
  }
  const tr = [];
  const plusDm = [];
  const minusDm = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const trVal = Math.max(
      cur.h - cur.l,
      Math.abs(cur.h - prev.c),
      Math.abs(cur.l - prev.c)
    );
    const upMove = cur.h - prev.h;
    const downMove = prev.l - cur.l;
    tr.push(trVal);
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  let smTr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlusDm = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinusDm = minusDm.slice(0, period).reduce((a, b) => a + b, 0);

  const dxList = [];
  let lastPlusDi = null;
  let lastMinusDi = null;

  for (let i = period; i < tr.length; i++) {
    if (i > period) {
      smTr = smTr - smTr / period + tr[i];
      smPlusDm = smPlusDm - smPlusDm / period + plusDm[i];
      smMinusDm = smMinusDm - smMinusDm / period + minusDm[i];
    }
    const pDi = smTr > 0 ? (100 * smPlusDm) / smTr : 0;
    const mDi = smTr > 0 ? (100 * smMinusDm) / smTr : 0;
    lastPlusDi = pDi;
    lastMinusDi = mDi;
    const diSum = pDi + mDi;
    dxList.push(diSum > 0 ? (100 * Math.abs(pDi - mDi)) / diSum : 0);
  }

  // Final Wilder ATR uses full tr length
  let atrVal = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]) / period;
  }
  const latestClose = bars[bars.length - 1].c;
  const atrPct = latestClose > 0 ? (atrVal / latestClose) * 100 : null;

  let adxVal = null;
  if (dxList.length >= period) {
    adxVal = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
      adxVal = (adxVal * (period - 1) + dxList[i]) / period;
    }
  }

  return {
    atr: round2(atrVal),
    atrPct: round2(atrPct),
    adx: round2(adxVal),
    plusDi: round2(lastPlusDi),
    minusDi: round2(lastMinusDi)
  };
}

function calcStochastic(bars, kPeriod = 14, dPeriod = 3) {
  if (!Array.isArray(bars) || bars.length < kPeriod + dPeriod - 1) return null;
  const kSeries = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].h > hi) hi = bars[j].h;
      if (bars[j].l < lo) lo = bars[j].l;
    }
    const k = hi > lo ? ((bars[i].c - lo) / (hi - lo)) * 100 : 50;
    kSeries.push(k);
  }
  const kVal = kSeries[kSeries.length - 1];
  const dVal = kSeries.slice(kSeries.length - dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k: round2(kVal), d: round2(dVal) };
}

function calcRoc(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  const prev = closes[closes.length - 1 - period];
  const cur = closes[closes.length - 1];
  if (!prev || prev <= 0) return null;
  return round2(((cur - prev) / prev) * 100);
}

function calcFibonacci(bars) {
  if (!Array.isArray(bars) || bars.length < 20) return null;
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (const b of bars) {
    if (b.h > swingHigh) swingHigh = b.h;
    if (b.l < swingLow) swingLow = b.l;
  }
  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) return null;
  const diff = swingHigh - swingLow;
  const cmp = bars[bars.length - 1].c;
  const l236 = round2(swingHigh - 0.236 * diff);
  const l382 = round2(swingHigh - 0.382 * diff);
  const l500 = round2(swingHigh - 0.500 * diff);
  const l618 = round2(swingHigh - 0.618 * diff);
  const l786 = round2(swingHigh - 0.786 * diff);

  let zone = 'Below 61.8% (Weak)';
  if (cmp >= l236) zone = 'Above 23.6% (Strong)';
  else if (cmp >= l382) zone = '23.6% – 38.2% (Shallow Pullback)';
  else if (cmp >= l618) zone = '38.2% – 61.8% (Golden Support Zone)';

  return {
    swingHigh: round2(swingHigh),
    swingLow: round2(swingLow),
    r236: l236,
    r382: l382,
    r500: l500,
    r618: l618,
    r786: l786,
    zone
  };
}

function calcPivotPoints(bar) {
  if (!bar) return null;
  const pp = (bar.h + bar.l + bar.c) / 3;
  const range = bar.h - bar.l;
  return {
    pp: round2(pp),
    r1: round2(2 * pp - bar.l),
    s1: round2(2 * pp - bar.h),
    r2: round2(pp + range),
    s2: round2(pp - range),
    r3: round2(bar.h + 2 * (pp - bar.l)),
    s3: round2(bar.l - 2 * (bar.h - pp))
  };
}

function computeComprehensiveTechnicals(rawBars) {
  if (!Array.isArray(rawBars) || rawBars.length === 0) return null;
  // Normalize bars: { d, o, h, l, c, v }
  const bars = rawBars
    .filter((b) => b && Number.isFinite(b.c) && b.c > 0)
    .map((b) => ({
      d: b.d,
      o: Number.isFinite(b.o) && b.o > 0 ? b.o : b.c,
      h: Number.isFinite(b.h) && b.h > 0 ? b.h : b.c,
      l: Number.isFinite(b.l) && b.l > 0 ? b.l : b.c,
      c: b.c,
      v: Number.isFinite(b.v) && b.v >= 0 ? b.v : 0
    }));

  if (bars.length === 0) return null;

  const closes = bars.map((b) => b.c);
  const cmp = closes[closes.length - 1];

  const movingAverages = {};
  let maBullCount = 0;
  let maBearCount = 0;
  let maTotalValid = 0;

  for (const p of MA_PERIODS) {
    const smaVal = round2(calcSma(closes, p));
    const emaVal = round2(calcEma(closes, p));
    const smaVerdict = smaVal === null ? 'Insufficient Data' : (cmp > smaVal ? 'Bullish' : cmp < smaVal ? 'Bearish' : 'Neutral');
    const emaVerdict = emaVal === null ? 'Insufficient Data' : (cmp > emaVal ? 'Bullish' : cmp < emaVal ? 'Bearish' : 'Neutral');

    if (smaVal !== null) {
      maTotalValid++;
      if (smaVerdict === 'Bullish') maBullCount++;
      else if (smaVerdict === 'Bearish') maBearCount++;
    }
    if (emaVal !== null) {
      maTotalValid++;
      if (emaVerdict === 'Bullish') maBullCount++;
      else if (emaVerdict === 'Bearish') maBearCount++;
    }

    movingAverages[String(p)] = {
      period: p,
      sma: smaVal,
      smaVerdict,
      ema: emaVal,
      emaVerdict
    };
  }

  const rsi14 = round2(calcRsi(closes, 14));
  const macd = calcMacd(closes, 12, 26, 9);
  const bollinger = calcBollinger(closes, 20, 2);
  const { atr, atrPct, adx, plusDi, minusDi } = calcAtrAndAdx(bars, 14);
  const stochastic = calcStochastic(bars, 14, 3);
  const roc14 = calcRoc(closes, 14);
  const fibonacci = calcFibonacci(bars);
  const pivots = calcPivotPoints(bars[bars.length - 1]);

  // Overall technical verdict across MAs + key oscillators
  let bullSignals = maBullCount;
  let bearSignals = maBearCount;
  if (rsi14 !== null) {
    if (rsi14 >= 55 && rsi14 < 75) bullSignals += 2;
    else if (rsi14 <= 45 && rsi14 > 25) bearSignals += 2;
  }
  if (macd) {
    if (macd.macd > macd.signal && macd.histogram > 0) bullSignals += 2;
    else if (macd.macd < macd.signal && macd.histogram < 0) bearSignals += 2;
  }
  if (adx !== null && adx >= 20 && plusDi !== null && minusDi !== null) {
    if (plusDi > minusDi) bullSignals += 1;
    else if (minusDi > plusDi) bearSignals += 1;
  }

  const totalSignals = bullSignals + bearSignals;
  const bullRatio = totalSignals > 0 ? bullSignals / totalSignals : 0.5;
  let overallRating = 'Neutral';
  if (bullRatio >= 0.72) overallRating = 'Strong Bullish';
  else if (bullRatio >= 0.56) overallRating = 'Bullish';
  else if (bullRatio <= 0.28) overallRating = 'Strong Bearish';
  else if (bullRatio <= 0.44) overallRating = 'Bearish';

  return {
    barsCount: bars.length,
    asOfDate: bars[bars.length - 1].d,
    cmp: round2(cmp),
    overallRating,
    maBullCount,
    maBearCount,
    maTotalValid,
    movingAverages,
    indicators: {
      rsi14,
      macd,
      bollinger,
      adx14: adx,
      plusDi14: plusDi,
      minusDi14: minusDi,
      atr14: atr,
      atrPct,
      stochastic,
      roc14
    },
    fibonacci,
    pivots
  };
}

module.exports = {
  MA_PERIODS,
  computeComprehensiveTechnicals
};
