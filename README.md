# Polymarket ETH 15-Minute Trading Bot

Automated trading bot for Polymarket ETH 15-minute up/down prediction markets.

## Strategy

Uses technical analysis confluence to predict ETH direction:

| Indicator | Weight | Bullish Signal | Bearish Signal |
|-----------|--------|----------------|----------------|
| Price vs VWAP | 2 | Above VWAP | Below VWAP |
| VWAP Slope | 2 | Rising | Falling |
| RSI + Momentum | 2 | RSI>55 + rising | RSI<45 + falling |
| MACD Histogram | 2 | Green + expanding | Red + expanding |
| Failed VWAP Reclaim | 3 | - | Price rejected at VWAP |

### Edge Calculation

```
Edge = Model_Probability - Market_Implied_Probability
```

Trade thresholds vary by time remaining:
- **EARLY** (10-15 min): 5% edge minimum
- **MID** (5-10 min): 10% edge minimum  
- **LATE** (0-5 min): 20% edge minimum

## Setup

```bash
cd ~/clawd/projects/polymarket-eth15m
npm install
```

## Configuration

Edit `src/config.js`:
- `minEdge`: Minimum edge to trade (default 10%)
- `maxPositionUsd`: Max per position (default $50)
- `maxTotalExposure`: Max total exposure (default $200)

## Usage

```bash
# Run dashboard
node src/index.js

# Or via npm
npm start
```

## Files

```
src/
├── index.js          # Main trading loop + dashboard
├── config.js         # Configuration
├── state.js          # Persistent state management
├── data/
│   ├── polymarket.js # Polymarket API
│   ├── binance.js    # Price data (CoinGecko fallback)
│   └── binanceWs.js  # Price polling
├── indicators/
│   ├── rsi.js        # RSI + SMA
│   ├── macd.js       # MACD
│   ├── vwap.js       # VWAP calculations
│   └── heikenAshi.js # Heiken Ashi candles
└── engines/
    ├── probability.js # TA scoring → probability
    └── edge.js        # Edge calc + trade decision

logs/
├── state.json        # Persistent positions/PnL
└── trades.jsonl      # Trade history
```

## Wallet

- Address: `0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447`
- Chain: Polygon
- Credentials: `../poly-shared/.env`

## Performance

Track via Polymarket Data API:
```bash
curl "https://data-api.polymarket.com/positions?user=0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447"
```

## Known Issues

1. Binance API blocked (451) - using CoinGecko fallback
2. CoinGecko rate limits - may need API key for production
3. Order execution not yet implemented - dashboard only

## TODO

- [ ] Add order execution via CLOB API
- [ ] Cron job for persistent running
- [ ] Telegram alerts for trades
- [ ] Better price data source
