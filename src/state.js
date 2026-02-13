// Persistent state management - survives restarts

import fs from "fs";
import { CONFIG } from "./config.js";

class StateManager {
  constructor() {
    this.state = {
      positions: {},      // slug -> {side, size, avgPrice, entryTime}
      closedTrades: [],   // Historical trades
      totalPnl: 0,
      startTime: null,
      lastUpdate: null
    };
    this.load();
  }
  
  load() {
    try {
      if (fs.existsSync(CONFIG.stateFile)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.stateFile, "utf8"));
        this.state = { ...this.state, ...data };
        console.log(`[STATE] Loaded: ${Object.keys(this.state.positions).length} positions, $${this.state.totalPnl.toFixed(2)} PnL`);
      }
    } catch (err) {
      console.error("[STATE] Load failed:", err.message);
    }
  }
  
  save() {
    try {
      this.state.lastUpdate = new Date().toISOString();
      fs.writeFileSync(CONFIG.stateFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("[STATE] Save failed:", err.message);
    }
  }
  
  recordEntry(slug, side, size, price, txHash = null, signals = null) {
    if (!this.state.startTime) {
      this.state.startTime = new Date().toISOString();
    }
    
    this.state.positions[slug] = {
      side,
      size,
      avgPrice: price,
      entryTime: new Date().toISOString(),
      txHash,
      signals  // Store signals for outcome analysis
    };
    
    // Log to trades file with full signal data for ML training
    const trade = {
      type: "ENTRY",
      timestamp: new Date().toISOString(),
      slug,
      side,
      size,
      price,
      txHash,
      // Signal snapshot for learning
      signals: signals ? {
        btcPrice: signals.price,
        vwap: signals.vwap,
        vwapSlope: signals.vwapSlope,
        rsi: signals.rsi,
        rsiSlope: signals.rsiSlope,
        macdHist: signals.macd?.hist,
        macdHistDelta: signals.macd?.histDelta,
        modelProb: signals.modelProb,
        edge: signals.edge,
        timeRemaining: signals.timeRemaining
      } : null
    };
    fs.appendFileSync(CONFIG.tradesFile, JSON.stringify(trade) + "\n");
    
    this.save();
    console.log(`[STATE] Recorded entry: ${side} ${size} @ ${price}¢ on ${slug}`);
  }
  
  recordExit(slug, exitPrice, pnl, outcome) {
    const position = this.state.positions[slug];
    if (!position) return;
    
    // Log trade
    const trade = {
      type: "EXIT",
      timestamp: new Date().toISOString(),
      slug,
      side: position.side,
      entryPrice: position.avgPrice,
      exitPrice,
      size: position.size,
      pnl,
      outcome
    };
    fs.appendFileSync(CONFIG.tradesFile, JSON.stringify(trade) + "\n");
    
    // Update state
    this.state.totalPnl += pnl;
    this.state.closedTrades.push(trade);
    delete this.state.positions[slug];
    
    this.save();
    console.log(`[STATE] Recorded exit: ${outcome} on ${slug}, PnL: $${pnl.toFixed(2)}`);
  }
  
  hasPosition(slug) {
    return !!this.state.positions[slug];
  }
  
  getPosition(slug) {
    return this.state.positions[slug];
  }
  
  getAllPositions() {
    return this.state.positions;
  }
  
  getTotalExposure() {
    return Object.values(this.state.positions)
      .reduce((sum, p) => sum + (p.size * p.avgPrice / 100), 0);
  }
  
  getStats() {
    const trades = this.state.closedTrades;
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl <= 0).length;
    
    return {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? (wins / trades.length * 100).toFixed(1) + "%" : "N/A",
      totalPnl: this.state.totalPnl,
      openPositions: Object.keys(this.state.positions).length
    };
  }
}

export const state = new StateManager();
