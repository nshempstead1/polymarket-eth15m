// Multi-asset Polymarket 15-min market data

import { CONFIG } from "../config.js";

const ASSETS = ['btc', 'eth', 'sol', 'xrp'];

/**
 * Get active 15-minute up/down markets for all assets
 */
export async function getAll15MinMarkets() {
  const allMarkets = {};
  
  for (const asset of ASSETS) {
    allMarkets[asset] = await get15MinMarkets(asset);
  }
  
  return allMarkets;
}

/**
 * Get active 15-minute up/down markets for a specific asset
 */
export async function get15MinMarkets(asset) {
  try {
    const now = Date.now();
    const markets = [];
    
    const currentSlot = Math.floor(now / 1000 / 900) * 900;
    
    for (let i = 0; i < 4; i++) {
      const slot = currentSlot + (i * 900);
      const slug = `${asset}-updown-15m-${slot}`;
      
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
              asset,
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
    
    markets.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    return markets;
  } catch (err) {
    console.error(`[POLY] Failed to fetch ${asset} markets:`, err.message);
    return [];
  }
}

export { ASSETS };
