// VWAP (Volume Weighted Average Price) indicator

/**
 * Compute session VWAP
 * @param {Array} candles - Array of { open, high, low, close, volume }
 * @returns {number|null} Current VWAP
 */
export function computeSessionVwap(candles) {
  if (!candles || candles.length === 0) return null;

  let cumulativeTPV = 0;  // Typical Price * Volume
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }

  if (cumulativeVolume === 0) return null;
  return cumulativeTPV / cumulativeVolume;
}

/**
 * Compute VWAP series (for slope calculation)
 * @param {Array} candles - Array of candles
 * @returns {number[]} Array of VWAP values at each point
 */
export function computeVwapSeries(candles) {
  if (!candles || candles.length === 0) return [];

  const result = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    
    if (cumulativeVolume > 0) {
      result.push(cumulativeTPV / cumulativeVolume);
    } else {
      result.push(null);
    }
  }

  return result;
}

/**
 * Calculate VWAP slope over lookback period
 * @param {number[]} vwapSeries - VWAP values
 * @param {number} lookback - Number of periods to look back
 * @returns {number|null} Slope (positive = uptrend)
 */
export function computeVwapSlope(vwapSeries, lookback = 5) {
  if (!vwapSeries || vwapSeries.length < lookback) return null;
  
  const now = vwapSeries[vwapSeries.length - 1];
  const then = vwapSeries[vwapSeries.length - lookback];
  
  if (now === null || then === null) return null;
  
  return (now - then) / lookback;
}
