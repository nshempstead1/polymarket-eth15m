// Multi-asset Binance data feeds

const ASSETS = {
  btc: { symbol: 'ETHUSDT', wsSymbol: 'ethusdt' },
  eth: { symbol: 'ETHUSDT', wsSymbol: 'ethusdt' },
  sol: { symbol: 'SOLUSDT', wsSymbol: 'solusdt' },
  xrp: { symbol: 'XRPUSDT', wsSymbol: 'xrpusdt' }
};

export async function fetchKlinesMulti(asset, { interval = '1m', limit = 100 } = {}) {
  const config = ASSETS[asset];
  if (!config) throw new Error(`Unknown asset: ${asset}`);
  
  const url = `https://api.binance.com/api/v3/klines?symbol=${config.symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  
  return data.map(k => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6]
  }));
}

export { ASSETS };
