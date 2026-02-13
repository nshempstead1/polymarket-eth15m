#!/usr/bin/env node
// Polymarket Multi-Asset 15-min Trading Bot
// Trades BTC, ETH, SOL, XRP using the same TA model

import "dotenv/config";
import { CONFIG } from "./config.js";
import { fetchKlinesMulti, ASSETS } from "./data/binance-multi.js";
import { getAll15MinMarkets, get15MinMarkets } from "./data/polymarket-multi.js";
import { getPositions, getBalance } from "./data/polymarket.js";
import { computeRsi, slopeLast } from "./indicators/rsi.js";
import { computeMacd } from "./indicators/macd.js";
import { scoreDirection, applyTimeAwareness } from "./engines/probability.js";
import { computeEdge, decide } from "./engines/edge.js";
import { state } from "./state.js";
import { executeTrade } from "./executor.js";
import { redeemAll } from "./redeemer.js";

const WALLET = process.env.WALLET_ADDRESS || "0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447";
const AUTO_TRADE = process.env.AUTO_TRADE !== "false";
const REDEEM_INTERVAL = 60;
let loopCount = 0;

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
};

const ASSET_COLORS = { btc: '\x1b[33m', eth: '\x1b[34m', sol: '\x1b[35m', xrp: '\x1b[36m' };

function fmt(n, d = 2) { return n === null || n === undefined ? "-" : Number(n).toFixed(d); }
function fmtTime(mins) {
  const m = Math.floor(Math.max(0, mins));
  const s = Math.floor((Math.max(0, mins) - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function computeSignals(klines) {
  const closes = klines.map(c => c.close);
  
  let vwapNum = 0, vwapDen = 0;
  for (const k of klines) {
    const typical = (k.high + k.low + k.close) / 3;
    vwapNum += typical * k.volume;
    vwapDen += k.volume;
  }
  const vwap = vwapDen > 0 ? vwapNum / vwapDen : closes[closes.length - 1];
  
  const vwapSeries = [];
  let runNum = 0, runDen = 0;
  for (const k of klines) {
    const typical = (k.high + k.low + k.close) / 3;
    runNum += typical * k.volume;
    runDen += k.volume;
    if (runDen > 0) vwapSeries.push(runNum / runDen);
  }
  const vwapSlope = slopeLast(vwapSeries, 5);
  
  const rsi = computeRsi(closes, 14);
  const rsiSeries = [];
  for (let i = 15; i < closes.length; i++) {
    const r = computeRsi(closes.slice(0, i + 1), 14);
    if (r !== null) rsiSeries.push(r);
  }
  const rsiSlope = slopeLast(rsiSeries, 3);
  
  const macd = computeMacd(closes, 12, 26, 9);
  
  return { vwap, vwapSlope, rsi, rsiSlope, macd, price: closes[closes.length - 1] };
}

async function main() {
  console.log(`${C.bold}🎯 POLYMARKET MULTI-ASSET 15-MIN BOT${C.reset}`);
  console.log(`Assets: BTC | ETH | SOL | XRP`);
  console.log(`Wallet: ${WALLET}`);
  console.log(`Min Edge: ${CONFIG.trading.minEdge * 100}%`);
  console.log("");
  
  while (true) {
    try {
      console.clear();
      console.log(`${C.bold}🎯 MULTI-ASSET 15-MIN BOT${C.reset}`);
      
      const [balance, positions] = await Promise.all([
        getBalance(WALLET),
        getPositions(WALLET)
      ]);
      
      console.log(`Balance: $${fmt(balance)} USDC.e`);
      console.log("");
      
      // Process each asset
      for (const asset of Object.keys(ASSETS)) {
        const assetColor = ASSET_COLORS[asset];
        console.log(`${C.bold}${assetColor}━━━ ${asset.toUpperCase()} ━━━${C.reset}`);
        
        try {
          const [klines, markets] = await Promise.all([
            fetchKlinesMulti(asset, { interval: "1m", limit: 100 }),
            get15MinMarkets(asset)
          ]);
          
          if (klines.length === 0 || markets.length === 0) {
            console.log(`  ${C.gray}No data available${C.reset}`);
            continue;
          }
          
          const signals = await computeSignals(klines);
          const scored = scoreDirection({
            price: signals.price,
            vwap: signals.vwap,
            vwapSlope: signals.vwapSlope,
            rsi: signals.rsi,
            rsiSlope: signals.rsiSlope,
            macd: signals.macd || { macd: 0, signal: 0, hist: 0, histDelta: 0 },
            heikenColor: null,
            heikenCount: 0,
            failedVwapReclaim: false
          });
          
          console.log(`  Price: $${fmt(signals.price)} | VWAP: $${fmt(signals.vwap)} | RSI: ${fmt(signals.rsi, 1)}`);
          console.log(`  Model: ${scored.rawUp > 0.5 ? C.green : C.red}UP ${(scored.rawUp * 100).toFixed(1)}%${C.reset} / DOWN ${((1 - scored.rawUp) * 100).toFixed(1)}%`);
          
          for (const market of markets) {
            const endTime = new Date(market.endDate).getTime();
            const now = Date.now();
            const timeLeft = (endTime - now) / 60000;
            
            if (timeLeft <= 0) continue;
            
            const timeAware = applyTimeAwareness(scored.rawUp, timeLeft, 15);
            const edge = computeEdge({
              modelUp: timeAware.adjustedUp,
              modelDown: timeAware.adjustedDown,
              marketYes: market.upPrice,
              marketNo: market.downPrice
            });
            
            const decision = decide({
              remainingMinutes: timeLeft,
              edgeUp: edge.edgeUp,
              edgeDown: edge.edgeDown,
              modelUp: timeAware.adjustedUp,
              modelDown: timeAware.adjustedDown
            });
            
            const hasPos = state.hasPosition(market.slug);
            const timeColor = timeLeft < 5 ? C.yellow : C.green;
            
            console.log(`  ${C.gray}${fmtTime(timeLeft)}${C.reset} UP: ${market.upPrice.toFixed(0)}¢ DOWN: ${market.downPrice.toFixed(0)}¢ | Edge: ${(Math.max(edge.edgeUp, edge.edgeDown) * 100).toFixed(1)}%`);
            
            if (decision.action === "ENTER" && !hasPos && AUTO_TRADE && balance > 10) {
              const tradeSize = Math.min(
                CONFIG.trading.maxPositionUsd / 4, // Split across 4 assets
                balance * CONFIG.trading.kellyFraction * decision.edge * 10
              );
              
              if (tradeSize >= 5) {
                const tokenId = decision.side === "UP" ? market.upTokenId : market.downTokenId;
                const price = decision.side === "UP" ? market.upPrice : market.downPrice;
                
                console.log(`    ${C.bold}>>> ${decision.side === "UP" ? C.green : C.red}TRADE ${decision.side}${C.reset}`);
                
                if (tokenId) {
                  executeTrade({
                    tokenId, side: "BUY", size: tradeSize, price,
                    slug: market.slug, outcome: decision.side,
                    signals: { ...signals, modelProb: decision.side === "UP" ? timeAware.adjustedUp : timeAware.adjustedDown, edge: decision.edge, timeRemaining: timeLeft }
                  }).catch(err => console.error("Trade error:", err.message));
                }
              }
            }
          }
        } catch (e) {
          console.log(`  ${C.red}Error: ${e.message}${C.reset}`);
        }
        console.log("");
      }
      
      // Auto-redeem
      loopCount++;
      if (loopCount >= REDEEM_INTERVAL) {
        loopCount = 0;
        try {
          const redeemResult = await redeemAll();
          if (redeemResult.redeemed > 0) {
            console.log(`${C.green}💰 Redeemed ${redeemResult.redeemed} positions, +$${redeemResult.value.toFixed(2)}${C.reset}`);
          }
        } catch (err) {}
      }
      
      const stats = state.getStats();
      console.log(`${C.bold}📊 STATS${C.reset} Trades: ${stats.totalTrades} | PnL: $${fmt(stats.totalPnl)}`);
      console.log(`${C.gray}Updated: ${new Date().toISOString()}${C.reset}`);
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.pollIntervalMs));
  }
}

main().catch(console.error);
