// Auto-redemption for resolved Polymarket positions
import 'dotenv/config';
import { ethers } from 'ethers';
import https from 'https';

const WALLET = process.env.WALLET_ADDRESS || "0x769Bb0B16c551aA103F8aC7642677DDCc9dd8447";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Polymarket CTF Exchange on Polygon
const CTF_EXCHANGE = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";

// Minimal ABI for redemption
const EXCHANGE_ABI = [
  "function redeem(bytes32 conditionId) external"
];

// Polygon public RPC with static network to avoid auto-detection
const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com', {
  chainId: 137,
  name: 'polygon'
}, {
  staticNetwork: true
});
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

async function getRedeemablePositions() {
  return new Promise((resolve, reject) => {
    https.get(`https://data-api.polymarket.com/positions?user=${WALLET}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const positions = JSON.parse(data);
          // Positions with curPrice = 1.0 (won) or 0.0 (lost but may have other side)
          const redeemable = positions.filter(p => 
            p.curPrice === 1.0 && p.size > 0 && p.conditionId
          );
          resolve(redeemable);
        } catch (e) { resolve([]); }
      });
    }).on('error', reject);
  });
}

export async function redeemAll() {
  if (!wallet) {
    console.log('[REDEEM] No private key configured');
    return { redeemed: 0, value: 0 };
  }

  const positions = await getRedeemablePositions();
  if (positions.length === 0) {
    return { redeemed: 0, value: 0 };
  }

  console.log(`[REDEEM] Found ${positions.length} redeemable positions`);
  
  let redeemed = 0;
  let totalValue = 0;

  for (const pos of positions) {
    try {
      // Determine which exchange based on market type
      const exchangeAddr = pos.negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;
      const exchange = new ethers.Contract(exchangeAddr, EXCHANGE_ABI, wallet);
      
      console.log(`[REDEEM] Redeeming ${pos.slug} - ${pos.size.toFixed(0)} contracts...`);
      
      const tx = await exchange.redeem(pos.conditionId, {
        gasLimit: 300000,
        maxFeePerGas: ethers.parseUnits('50', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('30', 'gwei')
      });
      
      console.log(`[REDEEM] TX submitted: ${tx.hash}`);
      await tx.wait();
      
      redeemed++;
      totalValue += pos.size; // Each winning contract = $1
      console.log(`[REDEEM] ✅ Redeemed ${pos.size.toFixed(2)} USDC from ${pos.slug}`);
      
    } catch (err) {
      console.log(`[REDEEM] ❌ Failed ${pos.slug}: ${err.message}`);
    }
  }

  return { redeemed, value: totalValue };
}

// Run if called directly
if (process.argv[1]?.includes('redeemer')) {
  redeemAll().then(result => {
    console.log(`[REDEEM] Complete: ${result.redeemed} positions, $${result.value.toFixed(2)} recovered`);
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
