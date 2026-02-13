// Config for Polymarket ETH 15-min trading bot

export const CONFIG = {
  // Binance data
  binance: {
    symbol: "ETHUSDT",
    restUrl: "https://api.binance.com/api/v3"
  },
  
  // Polymarket
  polymarket: {
    gammaApi: "https://gamma-api.polymarket.com",
    clobApi: "https://clob.polymarket.com",
    dataApi: "https://data-api.polymarket.com"
  },
  
  // Technical analysis params
  ta: {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    vwapSlopeLookback: 5
  },
  
  // Trading params (matching previous winning config)
  trading: {
    minEdge: 0.05,           // 5% minimum edge (was winning at this)
    maxPositionUsd: 30,      // Max $30 per position
    maxTotalExposure: 150,   // Max $150 total
    kellyFraction: 0.25      // Quarter Kelly
  },
  
  // Timing
  pollIntervalMs: 5000,      // 5 second refresh
  
  // State persistence
  stateFile: "./logs/state.json",
  tradesFile: "./logs/trades.jsonl"
};
