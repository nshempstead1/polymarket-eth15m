// Price data fetching - CryptoCompare (more reliable, higher limits)

const CRYPTOCOMPARE_API = "https://min-api.cryptocompare.com/data";

// Cache to reduce API calls
let priceCache = { price: null, timestamp: 0 };
let klineCache = { data: [], timestamp: 0 };
const PRICE_CACHE_MS = 10000;  // 10 second cache
const KLINE_CACHE_MS = 60000;  // 1 minute cache

/**
 * Fetch kline/candlestick data from CryptoCompare
 */
export async function fetchKlines({ interval = "1m", limit = 100 } = {}) {
  // Check cache
  if (klineCache.data.length > 0 && Date.now() - klineCache.timestamp < KLINE_CACHE_MS) {
    return klineCache.data;
  }
  
  try {
    // CryptoCompare histominute endpoint
    const res = await fetch(
      `${CRYPTOCOMPARE_API}/v2/histominute?fsym=ETH&tsym=USD&limit=${limit}`
    );
    
    if (!res.ok) throw new Error(`CryptoCompare error: ${res.status}`);
    
    const json = await res.json();
    
    if (json.Response === "Error") {
      throw new Error(json.Message || "CryptoCompare error");
    }
    
    const data = json.Data?.Data || [];
    
    const klines = data.map(k => ({
      openTime: k.time * 1000,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volumefrom,
      closeTime: (k.time + 60) * 1000
    }));
    
    // Update cache
    klineCache = { data: klines, timestamp: Date.now() };
    
    return klines;
  } catch (error) {
    console.error("Error fetching klines:", error.message);
    return klineCache.data; // Return stale cache on error
  }
}

/**
 * Fetch last price from CryptoCompare
 */
export async function fetchLastPrice() {
  // Check cache
  if (priceCache.price && Date.now() - priceCache.timestamp < PRICE_CACHE_MS) {
    return priceCache.price;
  }
  
  try {
    const res = await fetch(
      `${CRYPTOCOMPARE_API}/price?fsym=ETH&tsyms=USD`
    );
    if (!res.ok) throw new Error(`CryptoCompare error: ${res.status}`);
    
    const data = await res.json();
    const price = data.USD || null;
    
    // Update cache
    if (price) {
      priceCache = { price, timestamp: Date.now() };
    }
    
    return price;
  } catch (error) {
    console.error("Error fetching price:", error.message);
    return priceCache.price; // Return stale cache on error
  }
}
