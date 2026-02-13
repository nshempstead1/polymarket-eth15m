// Heiken Ashi candles - smoother trend visualization

/**
 * Convert regular candles to Heiken Ashi
 * @param {Array} candles - Array of { open, high, low, close }
 * @returns {Array} Heiken Ashi candles
 */
export function computeHeikenAshi(candles) {
  if (!candles || candles.length === 0) return [];

  const ha = [];
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    
    // HA Close = (Open + High + Low + Close) / 4
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    
    // HA Open = (prev HA Open + prev HA Close) / 2
    let haOpen;
    if (i === 0) {
      haOpen = (c.open + c.close) / 2;
    } else {
      haOpen = (ha[i - 1].open + ha[i - 1].close) / 2;
    }
    
    // HA High = max(High, HA Open, HA Close)
    const haHigh = Math.max(c.high, haOpen, haClose);
    
    // HA Low = min(Low, HA Open, HA Close)
    const haLow = Math.min(c.low, haOpen, haClose);
    
    // Color: green if close > open, red otherwise
    const color = haClose >= haOpen ? "green" : "red";
    
    ha.push({
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      color
    });
  }

  return ha;
}

/**
 * Count consecutive same-color candles
 * @param {Array} haCandles - Heiken Ashi candles
 * @returns {Object} { color, count }
 */
export function countConsecutive(haCandles) {
  if (!haCandles || haCandles.length === 0) {
    return { color: null, count: 0 };
  }

  const lastColor = haCandles[haCandles.length - 1].color;
  let count = 0;
  
  for (let i = haCandles.length - 1; i >= 0; i--) {
    if (haCandles[i].color === lastColor) {
      count++;
    } else {
      break;
    }
  }

  return { color: lastColor, count };
}
