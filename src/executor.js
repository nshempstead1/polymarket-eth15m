// Order executor for Polymarket ETH 15-min trades
// Uses py_clob_client via Python subprocess (reliable execution)

import { spawn } from "child_process";
import { CONFIG } from "./config.js";
import { state } from "./state.js";
import fs from "fs";

const POLY_SHARED = "/home/ubuntu/clawd/projects/poly-shared";

/**
 * Execute a trade on Polymarket
 */
export async function executeTrade({ 
  tokenId, 
  side,  // 'BUY' 
  size,  // in USD
  price, // in cents (0-100)
  slug,
  outcome, // 'UP' or 'DOWN'
  signals = null // Signal snapshot for learning
}) {
  console.log(`\n🎯 EXECUTING: ${side} ${outcome} $${size} @ ${price}¢ on ${slug}`);
  
  // Create Python script for order execution (works on both AWS and Amsterdam)
  const script = `
import os
import sys
from dotenv import load_dotenv

# Load .env from current directory
load_dotenv()

# Ensure API credentials are loaded
api_key = os.getenv('POLYMARKET_API_KEY')
api_secret = os.getenv('POLYMARKET_API_SECRET')  
api_passphrase = os.getenv('POLYMARKET_API_PASSPHRASE')

if not api_key:
    import json
    print(json.dumps({'success': False, 'error': 'Missing POLYMARKET_API_KEY'}))
    sys.exit(1)

from py_clob_client.client import ClobClient
from py_clob_client.clob_types import OrderArgs, OrderType
from py_clob_client.order_builder.constants import BUY
from eth_account import Account
import json

private_key = os.getenv('PRIVATE_KEY')
signature_type = int(os.getenv('SIGNATURE_TYPE', '0'))
funder_address = os.getenv('FUNDER_ADDRESS', '')

if signature_type == 0:
    wallet = Account.from_key(private_key).address
else:
    wallet = funder_address

from py_clob_client.clob_types import ApiCreds

client = ClobClient(
    host='https://clob.polymarket.com',
    chain_id=137,
    key=private_key,
    signature_type=signature_type,
    funder=funder_address if signature_type > 0 else None
)

# Set API credentials
if api_key:
    creds = ApiCreds(
        api_key=api_key,
        api_secret=api_secret,
        api_passphrase=api_passphrase
    )
    client.set_api_creds(creds)
else:
    creds = client.create_or_derive_api_creds()
    client.set_api_creds(creds)

# Calculate order
token_id = '${tokenId}'
price_decimal = ${price / 100}
size_usd = ${size}
contracts = size_usd / price_decimal

try:
    order_args = OrderArgs(
        token_id=token_id,
        price=price_decimal,
        size=contracts,
        side=BUY
    )
    
    signed = client.create_and_post_order(order_args)
    print(json.dumps({
        'success': True,
        'order_id': signed.get('orderID', 'unknown'),
        'size': contracts,
        'price': price_decimal,
        'spent': size_usd
    }))
except Exception as e:
    print(json.dumps({
        'success': False,
        'error': str(e)
    }))
`;

  return new Promise((resolve) => {
    // Detect environment - use different paths for AWS vs Amsterdam
    const isAmsterdam = process.cwd().includes('/root/bots');
    const pythonPath = isAmsterdam 
      ? "/root/bots/venv/bin/python3"
      : "/home/ubuntu/clawd/projects/poly-shared/venv/bin/python3";
    
    const proc = spawn(pythonPath, ["-c", script], {
      env: { 
        ...process.env,
        PYTHONPATH: isAmsterdam ? "" : "/home/ubuntu/clawd/projects/polymarket-tools/4coinsbot/src"
      },
      cwd: process.cwd()
    });
    
    let output = "";
    let error = "";
    
    proc.stdout.on("data", (data) => { output += data.toString(); });
    proc.stderr.on("data", (data) => { error += data.toString(); });
    
    proc.on("close", (code) => {
      try {
        // Find JSON in output
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          
          if (result.success) {
            console.log(`✅ ORDER FILLED: ${result.size.toFixed(2)} contracts @ ${(result.price * 100).toFixed(0)}¢`);
            
            // Record in state
            state.recordEntry(slug, outcome, result.size, price, result.order_id, signals);
            
            resolve({ success: true, ...result });
          } else {
            console.log(`❌ ORDER FAILED: ${result.error}`);
            resolve({ success: false, error: result.error });
          }
        } else {
          console.log(`❌ No JSON response: ${output} ${error}`);
          resolve({ success: false, error: output || error });
        }
      } catch (e) {
        console.log(`❌ Parse error: ${e.message}`);
        resolve({ success: false, error: e.message });
      }
    });
  });
}

/**
 * Get token IDs for a market
 */
export async function getTokenIds(slug) {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    const events = await res.json();
    
    if (events.length > 0 && events[0].markets) {
      const market = events[0].markets[0];
      const tokens = JSON.parse(market.clobTokenIds || '[]');
      return {
        upTokenId: tokens[0],
        downTokenId: tokens[1],
        conditionId: market.conditionId
      };
    }
  } catch (e) {
    console.error(`Failed to get token IDs for ${slug}:`, e.message);
  }
  return null;
}
