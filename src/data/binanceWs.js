// Price stream via polling (WebSocket blocked)

import { fetchLastPrice } from "./binance.js";

/**
 * Start price polling (fallback for blocked WebSocket)
 */
export function startBinanceTradeStream() {
  const state = {
    price: null,
    timestamp: null,
    connected: true
  };

  // Poll every 5 seconds
  const poll = async () => {
    try {
      const price = await fetchLastPrice();
      if (price) {
        state.price = price;
        state.timestamp = Date.now();
      }
    } catch (e) {
      // ignore
    }
  };

  // Initial fetch
  poll();
  
  // Start polling
  setInterval(poll, 5000);

  return {
    getLast: () => state.price ? { price: state.price, timestamp: state.timestamp } : null,
    isConnected: () => state.connected
  };
}
