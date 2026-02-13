// Edge calculation and trade decision engine
// Adapted from FrondEnt/PolymarketBTC15mAssistant

const clamp = (x, min, max) => Math.min(Math.max(x, min), max);

/**
 * Compute edge: model probability - market implied probability
 * 
 * @param {number} modelUp - Model's UP probability (0-1)
 * @param {number} modelDown - Model's DOWN probability (0-1)
 * @param {number} marketYes - Market YES price (cents, 1-99)
 * @param {number} marketNo - Market NO price (cents, 1-99)
 * @returns {Object} { marketUp, marketDown, edgeUp, edgeDown }
 */
export function computeEdge({ modelUp, modelDown, marketYes, marketNo }) {
  if (marketYes === null || marketNo === null) {
    return { marketUp: null, marketDown: null, edgeUp: null, edgeDown: null };
  }

  // Convert market prices to implied probabilities
  const sum = marketYes + marketNo;
  const marketUp = sum > 0 ? marketYes / sum : null;
  const marketDown = sum > 0 ? marketNo / sum : null;

  // Edge = model probability - market implied probability
  const edgeUp = marketUp === null ? null : modelUp - marketUp;
  const edgeDown = marketDown === null ? null : modelDown - marketDown;

  return {
    marketUp: marketUp === null ? null : clamp(marketUp, 0, 1),
    marketDown: marketDown === null ? null : clamp(marketDown, 0, 1),
    edgeUp,
    edgeDown
  };
}

/**
 * Make trade decision based on edge and phase
 * 
 * Phase-aware thresholds:
 * - EARLY (10-15 min left): Lower threshold (5%), more time for mean reversion
 * - MID (5-10 min left): Medium threshold (10%)
 * - LATE (0-5 min left): High threshold (20%), less time = need stronger edge
 * 
 * @returns {Object} { action, side, phase, strength, reason }
 */
export function decide({ remainingMinutes, edgeUp, edgeDown, modelUp = null, modelDown = null }) {
  // Determine phase
  const phase = remainingMinutes > 10 ? "EARLY" : remainingMinutes > 5 ? "MID" : "LATE";

  // Phase-specific thresholds
  const threshold = phase === "EARLY" ? 0.05 : phase === "MID" ? 0.1 : 0.2;
  const minProb = phase === "EARLY" ? 0.55 : phase === "MID" ? 0.6 : 0.65;

  // Need market data
  if (edgeUp === null || edgeDown === null) {
    return { action: "NO_TRADE", side: null, phase, reason: "missing_market_data" };
  }

  // Find best side
  const bestSide = edgeUp > edgeDown ? "UP" : "DOWN";
  const bestEdge = bestSide === "UP" ? edgeUp : edgeDown;
  const bestModel = bestSide === "UP" ? modelUp : modelDown;

  // Check edge threshold
  if (bestEdge < threshold) {
    return { 
      action: "NO_TRADE", 
      side: null, 
      phase, 
      reason: `edge ${(bestEdge * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}% threshold` 
    };
  }

  // Check minimum probability
  if (bestModel !== null && bestModel < minProb) {
    return { 
      action: "NO_TRADE", 
      side: null, 
      phase, 
      reason: `prob ${(bestModel * 100).toFixed(1)}% < ${(minProb * 100).toFixed(0)}% min` 
    };
  }

  // Signal strength
  const strength = bestEdge >= 0.2 ? "STRONG" : bestEdge >= 0.1 ? "GOOD" : "MARGINAL";
  
  return { 
    action: "ENTER", 
    side: bestSide, 
    phase, 
    strength, 
    edge: bestEdge,
    reason: `${(bestEdge * 100).toFixed(1)}% edge on ${bestSide}`
  };
}
