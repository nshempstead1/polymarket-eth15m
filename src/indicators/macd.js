// MACD (Moving Average Convergence Divergence) indicator

/**
 * Exponential Moving Average
 */
function ema(values, period) {
  if (!values || values.length < period) return null;
  
  const k = 2 / (period + 1);
  let emaValue = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < values.length; i++) {
    emaValue = values[i] * k + emaValue * (1 - k);
  }
  
  return emaValue;
}

/**
 * Compute full EMA series
 */
function emaSeries(values, period) {
  if (!values || values.length < period) return [];
  
  const k = 2 / (period + 1);
  const result = [];
  
  // Initial SMA
  let emaValue = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(emaValue);
  
  for (let i = period; i < values.length; i++) {
    emaValue = values[i] * k + emaValue * (1 - k);
    result.push(emaValue);
  }
  
  return result;
}

/**
 * Compute MACD
 * @param {number[]} closes - Array of closing prices
 * @param {number} fast - Fast EMA period (default 12)
 * @param {number} slow - Slow EMA period (default 26)
 * @param {number} signal - Signal line period (default 9)
 * @returns {Object|null} { macd, signal, hist, histDelta }
 */
export function computeMacd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (!closes || closes.length < slow + signalPeriod) return null;

  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  
  // Align series (slow EMA starts later)
  const offset = slow - fast;
  const macdLine = [];
  
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  
  if (macdLine.length < signalPeriod) return null;
  
  const signalLine = emaSeries(macdLine, signalPeriod);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const hist = macd - signal;
  
  // Histogram delta (momentum of histogram)
  const prevHist = macdLine.length >= 2 && signalLine.length >= 2
    ? macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2]
    : null;
  const histDelta = prevHist !== null ? hist - prevHist : null;

  return { macd, signal, hist, histDelta };
}
