# AGENTS.md - Polymarket ETH 15-Min Bot

## Quick Reference

**Location:** `/home/ubuntu/clawd/projects/polymarket-eth15m/`
**Wallet:** `0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447`
**Chain:** Polygon (Polymarket)

## Commands

```bash
# Run the bot
cd ~/clawd/projects/polymarket-eth15m
node src/index.js

# Check positions
curl -s "https://data-api.polymarket.com/positions?user=0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447" | jq '.[] | {title, outcome, size, avgPrice, currentValue, cashPnl}'

# Check balance
curl -s -X POST https://polygon-rpc.com -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174","data":"0x70a08231000000000000000000000000769Bb0B16c551aA103F8aC7642677DDCc9dd8447"},"latest"],"id":1}' \
  | jq -r '.result' | xargs -I {} node -e "console.log('USDC.e:', (Number(BigInt('{}')) / 1e6).toFixed(2))"
```

## Strategy Summary

**Model:** Technical Analysis Confluence
- Price vs VWAP
- VWAP slope/trend
- RSI(14) + momentum
- MACD histogram + expansion
- Failed VWAP reclaim detection

**Edge Formula:** `Model_Prob - Market_Implied_Prob`

**Trade Thresholds:**
- EARLY (10-15 min left): 5% edge
- MID (5-10 min left): 10% edge
- LATE (0-5 min left): 20% edge

## State Files

- `logs/state.json` - Persistent positions, PnL
- `logs/trades.jsonl` - Trade history

## Related Tools

- Redeem positions: `~/clawd/projects/polymarket-tools/polyterminal/redeemall.py`
- Check balance: `~/clawd/projects/polymarket-tools/polyterminal/check_balance.py`
- 4coinsbot (full trading): `~/clawd/projects/polymarket-tools/4coinsbot/`

## History

- **Feb 13, 2026**: Bot created, won +$125 on ETH DOWN position
- Model correctly predicted DOWN on 3:45-4:00 PM market
