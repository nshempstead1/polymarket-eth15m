// Polymarket ETH 15-min market data

import { CONFIG } from "../config.js";

/**
 * Get active ETH 15-minute up/down markets
 */
export async function getBtc15MinMarkets() {
  try {
    // Get upcoming ETH 15-min markets from series
    const now = Date.now();
    const markets = [];
    
    // Generate next few market slugs based on 15-min intervals
    // Markets are named eth-updown-15m-{timestamp} where timestamp is Unix seconds
    const currentSlot = Math.floor(now / 1000 / 900) * 900; // Round to 15 min
    
    for (let i = 0; i < 4; i++) {
      const slot = currentSlot + (i * 900);
      const slug = `eth-updown-15m-${slot}`;
      
      try {
        const res = await fetch(`${CONFIG.polymarket.gammaApi}/events?slug=${slug}`);
        if (!res.ok) continue;
        
        const events = await res.json();
        if (events.length > 0) {
          const event = events[0];
          if (event.markets && event.markets.length > 0) {
            const market = event.markets[0];
            const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]');
            const tokens = JSON.parse(market.clobTokenIds || '[]');
            
            markets.push({
              slug: event.slug,
              title: event.title,
              question: market.question,
              conditionId: market.conditionId,
              endDate: market.endDate,
              upPrice: parseFloat(prices[0]) * 100,
              downPrice: parseFloat(prices[1]) * 100,
              upTokenId: tokens[0],
              downTokenId: tokens[1],
              negRisk: market.negRisk || false
            });
          }
        }
      } catch (e) {
        // Skip failed fetches
      }
    }
    
    // Sort by end time
    markets.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    
    return markets;
  } catch (err) {
    console.error("[POLY] Failed to fetch markets:", err.message);
    return [];
  }
}

/**
 * Get active ETH 15-minute up/down markets (legacy method)
 */
export async function getBtc15MinMarketsLegacy() {
  try {
    // Search for ETH 15-min markets
    const res = await fetch(
      `${CONFIG.polymarket.gammaApi}/events?tag=crypto&limit=50&active=true`
    );
    if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
    
    const events = await res.json();
    
    // Filter for ETH 15-minute markets
    const btcMarkets = events.filter(e => 
      e.slug?.includes("eth-updown-15m") || 
      e.title?.toLowerCase().includes("bitcoin") && e.title?.includes("15")
    );
    
    // Get market details with prices
    const markets = [];
    for (const event of btcMarkets.slice(0, 5)) {
      if (!event.markets) continue;
      
      for (const market of event.markets) {
        const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]');
        const tokens = JSON.parse(market.clobTokenIds || '[]');
        
        markets.push({
          slug: event.slug,
          title: event.title,
          question: market.question,
          conditionId: market.conditionId,
          endDate: market.endDate,
          upPrice: parseFloat(prices[0]) * 100,  // Convert to cents
          downPrice: parseFloat(prices[1]) * 100,
          upTokenId: tokens[0],
          downTokenId: tokens[1],
          negRisk: market.negRisk || false
        });
      }
    }
    
    // Sort by end time (soonest first)
    markets.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    
    return markets;
  } catch (err) {
    console.error("[POLY] Failed to fetch markets:", err.message);
    return [];
  }
}

/**
 * Get orderbook for a specific token
 */
export async function getOrderbook(tokenId) {
  try {
    const res = await fetch(`${CONFIG.polymarket.clobApi}/book?token_id=${tokenId}`);
    if (!res.ok) return null;
    
    const book = await res.json();
    return {
      bids: book.bids || [],
      asks: book.asks || []
    };
  } catch (err) {
    return null;
  }
}

/**
 * Get wallet positions from Data API
 */
export async function getPositions(walletAddress) {
  try {
    const res = await fetch(
      `${CONFIG.polymarket.dataApi}/positions?user=${walletAddress}`
    );
    if (!res.ok) return [];
    
    return await res.json();
  } catch (err) {
    console.error("[POLY] Failed to fetch positions:", err.message);
    return [];
  }
}

/**
 * Get wallet USDC balance
 */
export async function getBalance(walletAddress) {
  try {
    const res = await fetch(
      `https://polygon-rpc.com`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{
            to: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            data: `0x70a08231000000000000000000000000${walletAddress.slice(2)}`
          }, "latest"],
          id: 1
        })
      }
    );
    
    const data = await res.json();
    return Number(BigInt(data.result)) / 1e6;
  } catch (err) {
    return 0;
  }
}

/**
 * Calculate time remaining until market closes
 */
export function getTimeRemaining(endDate) {
  const end = new Date(endDate);
  const now = new Date();
  const diffMs = end - now;
  const diffMins = diffMs / 60000;
  
  return {
    remainingMinutes: Math.max(0, diffMins),
    remainingMs: Math.max(0, diffMs),
    expired: diffMs <= 0
  };
}
