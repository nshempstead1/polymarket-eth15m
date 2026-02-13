#!/usr/bin/env node
// Polymarket ETH 15-min Trading Bot
// Real-time TA model with persistent state

import "dotenv/config";
import { CONFIG } from "./config.js";
import { fetchKlines } from "./data/binance.js";
import { startBinanceTradeStream } from "./data/binanceWs.js";
import { getBtc15MinMarkets, getPositions, getBalance, getTimeRemaining } from "./data/polymarket.js";
import { computeRsi, slopeLast } from "./indicators/rsi.js";
import { computeMacd } from "./indicators/macd.js";
import { scoreDirection, applyTimeAwareness } from "./engines/probability.js";
import { computeEdge, decide } from "./engines/edge.js";
import { state } from "./state.js";
import { executeTrade, getTokenIds } from "./executor.js";
import { redeemAll } from "./redeemer.js";

const WALLET = process.env.WALLET_ADDRESS || "0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447";
const AUTO_TRADE = process.env.AUTO_TRADE !== "false"; // Enable by default
const REDEEM_INTERVAL = 60; // Check for redemptions every 60 loops (~5 min)
let loopCount = 0;

// ANSI colors
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m"
};

function fmt(n, d = 2) {
  return n === null || n === undefined ? "-" : Number(n).toFixed(d);
}

function fmtTime(mins) {
  const m = Math.floor(Math.max(0, mins));
  const s = Math.floor((Math.max(0, mins) - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function computeSignals(klines) {
  const closes = klines.map(c => c.close);
  
  // Compute VWAP
  let vwapNum = 0, vwapDen = 0;
  for (const k of klines) {
    const typical = (k.high + k.low + k.close) / 3;
    vwapNum += typical * k.volume;
    vwapDen += k.volume;
  }
  const vwap = vwapDen > 0 ? vwapNum / vwapDen : closes[closes.length - 1];
  
  // VWAP slope
  const vwapSeries = [];
  let runNum = 0, runDen = 0;
  for (const k of klines) {
    const typical = (k.high + k.low + k.close) / 3;
    runNum += typical * k.volume;
    runDen += k.volume;
    if (runDen > 0) vwapSeries.push(runNum / runDen);
  }
  const vwapSlope = slopeLast(vwapSeries, 5);
  
  // RSI
  const rsi = computeRsi(closes, 14);
  const rsiSeries = [];
  for (let i = 15; i < closes.length; i++) {
    const r = computeRsi(closes.slice(0, i + 1), 14);
    if (r !== null) rsiSeries.push(r);
  }
  const rsiSlope = slopeLast(rsiSeries, 3);
  
  // MACD
  const macd = computeMacd(closes, 12, 26, 9);
  
  return { vwap, vwapSlope, rsi, rsiSlope, macd, price: closes[closes.length - 1] };
}

async function main() {
  console.log(`${C.bold}🎯 POLYMARKET ETH 15-MIN BOT${C.reset}`);
  console.log(`Wallet: ${WALLET}`);
  console.log(`Min Edge: ${CONFIG.trading.minEdge * 100}%`);
  console.log("");
  
  // Start price stream
  const binance = startBinanceTradeStream();
  await new Promise(r => setTimeout(r, 2000));
  
  // Main loop
  while (true) {
    try {
      // Fetch data
      const [klines, markets, balance, positions] = await Promise.all([
        fetchKlines({ interval: "1m", limit: 100 }),
        getBtc15MinMarkets(),
        getBalance(WALLET),
        getPositions(WALLET)
      ]);
      
      // Get real-time price
      const tick = binance.getLast();
      const price = tick?.price || klines[klines.length - 1]?.close || 0;
      
      // Compute TA signals
      const signals = await computeSignals(klines);
      
      // Score direction (with null safety)
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
      
      // Display header
      console.clear();
      console.log(`${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
      console.log(`${C.bold}  🎯 POLYMARKET ETH 15-MIN BOT                              ${C.reset}`);
      console.log(`${C.bold}════════════════════════════════════════════════════════════${C.reset}`);
      console.log(`  ETH: $${fmt(price, 0)} | VWAP: $${fmt(signals.vwap, 0)} | RSI: ${fmt(signals.rsi, 1)}`);
      console.log(`  Model: ${C.green}UP ${(scored.rawUp * 100).toFixed(1)}%${C.reset} / ${C.red}DOWN ${((1 - scored.rawUp) * 100).toFixed(1)}%${C.reset}`);
      console.log(`  Balance: $${fmt(balance, 2)} USDC.e`);
      console.log("");
      
      // Process each market
      console.log(`${C.bold}💹 ACTIVE MARKETS${C.reset}`);
      
      for (const market of markets.slice(0, 4)) {
        const timing = getTimeRemaining(market.endDate);
        if (timing.expired) continue;
        
        const timeLeft = timing.remainingMinutes;
        const timeColor = timeLeft > 10 ? C.green : timeLeft > 5 ? C.yellow : C.red;
        
        // Apply time awareness
        const timeAware = applyTimeAwareness(scored.rawUp, timeLeft, 15);
        
        // Calculate edge
        const edge = computeEdge({
          modelUp: timeAware.adjustedUp,
          modelDown: timeAware.adjustedDown,
          marketYes: market.upPrice,
          marketNo: market.downPrice
        });
        
        // Decision
        const decision = decide({
          remainingMinutes: timeLeft,
          edgeUp: edge.edgeUp,
          edgeDown: edge.edgeDown,
          modelUp: timeAware.adjustedUp,
          modelDown: timeAware.adjustedDown
        });
        
        // Check if we have position
        const hasPos = state.hasPosition(market.slug);
        const posInfo = positions.find(p => p.slug === market.slug);
        
        console.log("");
        console.log(`  ${C.bold}${market.slug}${C.reset}`);
        console.log(`  Time: ${timeColor}${fmtTime(timeLeft)}${C.reset} | UP: ${market.upPrice.toFixed(0)}¢ | DOWN: ${market.downPrice.toFixed(0)}¢`);
        console.log(`  Edge: ${edge.edgeUp > 0 ? C.green : C.red}${(edge.edgeUp * 100).toFixed(1)}% UP${C.reset} / ${edge.edgeDown > 0 ? C.green : C.red}${(edge.edgeDown * 100).toFixed(1)}% DOWN${C.reset}`);
        
        if (posInfo) {
          const pnlColor = posInfo.cashPnl >= 0 ? C.green : C.red;
          console.log(`  ${C.bold}POSITION:${C.reset} ${posInfo.outcome} ${posInfo.size.toFixed(0)} @ ${(posInfo.avgPrice * 100).toFixed(0)}¢ | ${pnlColor}$${posInfo.cashPnl.toFixed(2)}${C.reset}`);
        } else if (decision.action === "ENTER" && !state.hasPosition(market.slug)) {
          const decColor = decision.side === "UP" ? C.green : C.red;
          console.log(`  ${C.bold}>>> ${decColor}🎯 TRADE ${decision.side}${C.reset} (${decision.strength}, ${(decision.edge * 100).toFixed(1)}% edge)`);
          
          // Auto-execute trade
          if (AUTO_TRADE && balance > 10) {
            const tradeSize = Math.min(
              CONFIG.trading.maxPositionUsd,
              balance * CONFIG.trading.kellyFraction * decision.edge * 10
            );
            
            if (tradeSize >= 5) { // Min $5 trade
              const tokenId = decision.side === "UP" ? market.upTokenId : market.downTokenId;
              const price = decision.side === "UP" ? market.upPrice : market.downPrice;
              
              if (tokenId) {
                executeTrade({
                  tokenId,
                  side: "BUY",
                  size: tradeSize,
                  price,
                  slug: market.slug,
                  outcome: decision.side,
                  // Signal snapshot for learning/backtesting
                  signals: {
                    price: signals.price,
                    vwap: signals.vwap,
                    vwapSlope: signals.vwapSlope,
                    rsi: signals.rsi,
                    rsiSlope: signals.rsiSlope,
                    macd: signals.macd,
                    modelProb: decision.side === "UP" ? timeAware.adjustedUp : timeAware.adjustedDown,
                    edge: decision.edge,
                    timeRemaining: timeLeft
                  }
                }).catch(err => console.error("Trade error:", err.message));
              }
            }
          }
        } else {
          console.log(`  ${C.gray}>>> NO TRADE (${decision.reason})${C.reset}`);
        }
      }
      
      // Auto-redeem resolved positions every ~5 minutes
      loopCount++;
      if (loopCount >= REDEEM_INTERVAL) {
        loopCount = 0;
        try {
          const redeemResult = await redeemAll();
          if (redeemResult.redeemed > 0) {
            console.log(`${C.green}💰 Redeemed ${redeemResult.redeemed} positions, +$${redeemResult.value.toFixed(2)}${C.reset}`);
          }
        } catch (err) {
          console.error(`[REDEEM] Error: ${err.message}`);
        }
      }
      
      // Stats
      const stats = state.getStats();
      console.log("");
      console.log(`${C.bold}📊 SESSION STATS${C.reset}`);
      console.log(`  Trades: ${stats.totalTrades} | Win Rate: ${stats.winRate} | PnL: $${fmt(stats.totalPnl, 2)}`);
      console.log("");
      console.log(`${C.gray}Updated: ${new Date().toISOString()} | Refresh: ${CONFIG.pollIntervalMs/1000}s${C.reset}`);
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.pollIntervalMs));
  }
}

main().catch(console.error);
