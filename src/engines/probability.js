// Probability scoring engine - calculates directional bias from TA indicators
// Adapted from FrondEnt/PolymarketBTC15mAssistant

/**
 * Score directional probability based on technical analysis confluence
 * 
 * Inputs:
 * - price: Current BTC price
 * - vwap: Session VWAP
 * - vwapSlope: VWAP slope (positive = uptrend)
 * - rsi: RSI value (0-100)
 * - rsiSlope: RSI momentum
 * - macd: { macd, signal, hist, histDelta }
 * - heikenColor: "green" or "red"
 * - heikenCount: Consecutive same-color candles
 * - failedVwapReclaim: Price failed to hold above VWAP
 * 
 * Returns: { upScore, downScore, rawUp }
 */
export function scoreDirection(inputs) {
  const {
    price,
    vwap,
    vwapSlope,
    rsi,
    rsiSlope,
    macd,
    heikenColor,
    heikenCount,
    failedVwapReclaim
  } = inputs;

  // Start with base scores
  let up = 1;
  let down = 1;

  // Price vs VWAP (weight: 2)
  if (price !== null && vwap !== null) {
    if (price > vwap) up += 2;
    if (price < vwap) down += 2;
  }

  // VWAP slope/trend (weight: 2)
  if (vwapSlope !== null) {
    if (vwapSlope > 0) up += 2;
    if (vwapSlope < 0) down += 2;
  }

  // RSI + momentum (weight: 2)
  if (rsi !== null && rsiSlope !== null) {
    if (rsi > 55 && rsiSlope > 0) up += 2;  // Bullish RSI with upward momentum
    if (rsi < 45 && rsiSlope < 0) down += 2; // Bearish RSI with downward momentum
  }

  // MACD histogram (weight: 2 for expansion, 1 for direction)
  if (macd?.hist !== null && macd?.histDelta !== null) {
    const expandingGreen = macd.hist > 0 && macd.histDelta > 0;
    const expandingRed = macd.hist < 0 && macd.histDelta < 0;
    if (expandingGreen) up += 2;
    if (expandingRed) down += 2;

    // MACD line direction (smaller weight)
    if (macd.macd > 0) up += 1;
    if (macd.macd < 0) down += 1;
  }

  // Heiken Ashi trend (weight: 1)
  if (heikenColor) {
    if (heikenColor === "green" && heikenCount >= 2) up += 1;
    if (heikenColor === "red" && heikenCount >= 2) down += 1;
  }

  // Failed VWAP reclaim is bearish (weight: 3)
  if (failedVwapReclaim === true) down += 3;

  // Convert to probability
  const rawUp = up / (up + down);
  return { upScore: up, downScore: down, rawUp };
}

/**
 * Apply time decay to probability estimates
 * As time runs out, model confidence decreases (reverts toward 50%)
 */
export function applyTimeAwareness(rawUp, remainingMinutes, windowMinutes) {
  const clamp = (x, min, max) => Math.min(Math.max(x, min), max);
  const timeDecay = clamp(remainingMinutes / windowMinutes, 0, 1);
  const adjustedUp = clamp(0.5 + (rawUp - 0.5) * timeDecay, 0, 1);
  return { 
    timeDecay, 
    adjustedUp, 
    adjustedDown: 1 - adjustedUp 
  };
}
