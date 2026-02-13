# RUNBOOK - Polymarket ETH 15-Min Trading Bot

**READ THIS FIRST WHEN RUNNING THE BOT**

---

## 1. WHERE EVERYTHING IS

| Item | Location |
|------|----------|
| Bot Code | `/home/ubuntu/clawd/projects/polymarket-eth15m/` |
| Credentials | `/home/ubuntu/clawd/projects/poly-shared/.env` |
| GitHub | https://github.com/nshempstead1/polymarket-eth15m |
| Wallet | `0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447` |

## 2. SERVERS

### DigitalOcean Amsterdam (EXECUTION SERVER - USE THIS)
- **IP**: `188.166.105.31`
- **User**: `root` or `botrunner`
- **Location**: Netherlands (EU - NO GEO-BLOCKING)
- **Bot Path**: `/home/root/bots/polymarket-eth15m/`
- **Logs**: `/home/root/bots/polymarket-eth15m/logs/bot.log`

### AWS (THIS SERVER - DEVELOPMENT ONLY)
- **IP**: `13.59.107.152`
- **Problem**: US-based, Polymarket BLOCKS order execution
- **Use for**: Development, monitoring, NOT execution

## 3. HOW TO RUN

### Start Bot on Hetzner (Production)
```bash
ssh root@188.166.105.31 "cd /home/root/bots/polymarket-eth15m && pkill -f 'node src/index' ; nohup node src/index.js > logs/bot.log 2>&1 & echo 'Started PID:' \$!"
```

### Monitor Bot
```bash
ssh root@188.166.105.31 "tail -50 /home/root/bots/polymarket-eth15m/logs/bot.log"
```

### Check if Running
```bash
ssh root@188.166.105.31 "ps aux | grep 'node src/index' | grep -v grep"
```

### Stop Bot
```bash
ssh root@188.166.105.31 "pkill -f 'node src/index'"
```

## 4. HOW TO DEPLOY UPDATES

```bash
# From AWS, push code to Hetzner
rsync -avz --exclude='node_modules' --exclude='logs' \
    /home/ubuntu/clawd/projects/polymarket-eth15m/ \
    root@188.166.105.31:/home/root/bots/polymarket-eth15m/

# Copy credentials
scp /home/ubuntu/clawd/projects/poly-shared/.env \
    root@188.166.105.31:/home/root/bots/polymarket-eth15m/.env

# Restart bot
ssh root@188.166.105.31 "cd /home/root/bots/polymarket-eth15m && npm install && pkill -f 'node src/index' ; nohup node src/index.js > logs/bot.log 2>&1 &"
```

## 5. CREDENTIALS NEEDED

All in `/home/ubuntu/clawd/projects/poly-shared/.env`:

```
PRIVATE_KEY=0x...          # Wallet private key
WALLET_ADDRESS=0x769B...   # Wallet address
POLYMARKET_API_KEY=...     # CLOB API key
POLYMARKET_API_SECRET=...  # CLOB API secret
POLYMARKET_API_PASSPHRASE=... # CLOB passphrase
SIGNATURE_TYPE=0           # 0=EOA, 1/2=Proxy
FUNDER_ADDRESS=            # Only if SIGNATURE_TYPE>0
```

## 6. CHECK POSITIONS & BALANCE

```bash
# Positions
curl -s "https://data-api.polymarket.com/positions?user=0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447" | jq '.[] | {title, outcome, size, currentValue, cashPnl}'

# Balance (USDC.e on Polygon)
curl -s -X POST https://polygon-rpc.com -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174","data":"0x70a08231000000000000000000000000769Bb0B16c551aA103F8aC7642677DDCc9dd8447"},"latest"],"id":1}' \
  | jq -r '.result' | xargs -I {} node -e "console.log('USDC.e:', (Number(BigInt('{}')) / 1e6).toFixed(2))"
```

## 7. REDEEM WINNING POSITIONS

```bash
cd /home/ubuntu/clawd/projects/polymarket-tools/polyterminal
source /home/ubuntu/clawd/projects/poly-shared/venv/bin/activate
export $(grep -v '^#' /home/ubuntu/clawd/projects/poly-shared/.env | xargs)
echo "y" | python3 redeemall.py
```

## 8. TRADING STRATEGY

- **Model**: TA Confluence (VWAP, RSI, MACD, Heiken Ashi)
- **Edge Calculation**: `Model_Prob - Market_Implied_Prob`
- **Trade Thresholds**:
  - EARLY (10-15 min): 5% edge minimum
  - MID (5-10 min): 10% edge minimum
  - LATE (0-5 min): 20% edge minimum
- **Position Size**: 25% Kelly, max $30/trade
- **Markets**: ETH 15-minute up/down on Polymarket

## 9. TROUBLESHOOTING

### "Access restricted" / Geo-blocked
→ Run on Hetzner (188.166.105.31), NOT AWS

### "API Credentials needed"
→ Check `.env` has POLYMARKET_API_KEY, SECRET, PASSPHRASE

### No markets showing
→ Markets use slug format `eth-updown-15m-{unix_timestamp}`
→ Check gamma API: `curl "https://gamma-api.polymarket.com/events?slug=eth-updown-15m-$(date +%s | cut -c1-7)0000"`

### Rate limited (CoinGecko/Binance)
→ Bot uses CryptoCompare with caching, should be fine
→ If issues, check `src/data/binance.js`

### Bot not executing trades
→ Check edge threshold (5% default)
→ Check min probability (55%)
→ Check balance (need >$10)

## 10. FILES

```
polymarket-eth15m/
├── src/
│   ├── index.js          # Main loop
│   ├── config.js         # Settings
│   ├── state.js          # Persistence
│   ├── executor.js       # Order execution
│   ├── data/
│   │   ├── polymarket.js # Market data
│   │   └── binance.js    # Price data (CryptoCompare)
│   ├── indicators/       # RSI, MACD, VWAP, HA
│   └── engines/          # Probability, Edge calc
├── logs/
│   ├── bot.log           # Live output
│   ├── state.json        # Positions
│   └── trades.jsonl      # History
├── RUNBOOK.md            # THIS FILE
├── README.md             # Overview
└── AGENTS.md             # Quick reference
```

---

**REMEMBER**: Always run production on Hetzner (188.166.105.31), never AWS!
