#!/usr/bin/env node

/**
 * Track Trading Bot Profits
 *
 * This specialized script identifies USDC transfers from the trading bot wallet
 * to the profit wallet. These transfers represent verified trading profits.
 *
 * Trading Bot Wallet: rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i
 * Profit Wallet: StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC
 *
 * This provides the cleanest, most accurate profit tracking for tax purposes.
 */

const fs = require('fs');
const readline = require('readline');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '93812d12-f56f-4624-97c9-9a4d242db974';
const HELIUS_ENHANCED_API_URL = `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${HELIUS_API_KEY}`;

const TRADING_BOT_WALLET = 'rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i';
const PROFIT_WALLET = 'StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC';

// USDC mint address on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Files
const PROFIT_WALLET_NDJSON = 'tax_year_2024-25_profit_wallet_transactions.ndjson';
const PROFITS_REPORT_CSV = 'tax_year_2024-25_VERIFIED_TRADING_PROFITS.csv';
const PROFITS_SUMMARY_JSON = 'tax_year_2024-25_profits_summary.json';

const BATCH_SIZE = 100;

console.log('💰 Trading Bot Profit Tracker\n');
console.log('Tracking USDC transfers from trading bot to profit wallet\n');
console.log(`   Trading Bot: ${TRADING_BOT_WALLET}`);
console.log(`   Profit Wallet: ${PROFIT_WALLET}`);
console.log(`   Token: USDC (${USDC_MINT})\n`);

/**
 * Extract signature from raw transaction
 */
function extractSignature(tx) {
  if (tx.transaction && tx.transaction.signatures && tx.transaction.signatures.length > 0) {
    return tx.transaction.signatures[0];
  }
  return null;
}

/**
 * Parse transaction batch using Enhanced API
 */
async function parseTransactionBatch(signatures) {
  try {
    const response = await fetch(HELIUS_ENHANCED_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: signatures })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`   ✗ Error parsing batch:`, error.message);
    return null;
  }
}

/**
 * Check if transaction is a profit transfer
 */
function isProfitTransfer(parsedTx) {
  // Must have token transfers
  if (!parsedTx.tokenTransfers || parsedTx.tokenTransfers.length === 0) {
    return null;
  }

  // Look for USDC transfer from trading bot to profit wallet
  for (const transfer of parsedTx.tokenTransfers) {
    // Check if it's USDC
    if (transfer.mint === USDC_MINT) {
      // Check if it's from trading bot to profit wallet
      if (
        transfer.fromUserAccount === TRADING_BOT_WALLET &&
        transfer.toUserAccount === PROFIT_WALLET
      ) {
        return {
          amount: transfer.tokenAmount,
          decimals: 6, // USDC has 6 decimals
          mint: transfer.mint,
          fromTokenAccount: transfer.fromTokenAccount,
          toTokenAccount: transfer.toTokenAccount
        };
      }
    }
  }

  return null;
}

/**
 * Process profit wallet transactions and extract profit transfers
 */
async function extractProfitTransfers() {
  // Check if profit wallet data exists
  if (!fs.existsSync(PROFIT_WALLET_NDJSON)) {
    console.error(`❌ Error: ${PROFIT_WALLET_NDJSON} not found`);
    console.error('   Run: node fetchProfitWalletTransactions.js\n');
    process.exit(1);
  }

  console.log(`📥 Reading profit wallet transactions...\n`);

  // Load all signatures
  const signatures = [];
  const rawTransactions = [];

  const fileStream = fs.createReadStream(PROFIT_WALLET_NDJSON);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      const tx = JSON.parse(line);
      const signature = extractSignature(tx);
      if (signature) {
        signatures.push(signature);
        rawTransactions.push(tx);
      }
    }
  }

  console.log(`   ✓ Loaded ${signatures.length} transactions\n`);
  console.log(`🔍 Parsing and filtering for USDC profit transfers...\n`);

  const profitTransfers = [];
  let processedCount = 0;

  // Process in batches
  for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
    const batchSigs = signatures.slice(i, Math.min(i + BATCH_SIZE, signatures.length));
    const batchRaw = rawTransactions.slice(i, Math.min(i + BATCH_SIZE, signatures.length));

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(signatures.length / BATCH_SIZE);

    console.log(`   Batch ${batchNum}/${totalBatches}: Parsing ${batchSigs.length} transactions...`);

    const parsed = await parseTransactionBatch(batchSigs);

    if (parsed && Array.isArray(parsed)) {
      for (let j = 0; j < parsed.length; j++) {
        const parsedTx = parsed[j];
        const rawTx = batchRaw[j];

        if (parsedTx && !parsedTx.error) {
          // Check if this is a profit transfer
          const profitInfo = isProfitTransfer(parsedTx);

          if (profitInfo) {
            const usdcAmount = profitInfo.amount / Math.pow(10, profitInfo.decimals);

            const profitRecord = {
              date: new Date((parsedTx.timestamp || rawTx.blockTime) * 1000).toISOString(),
              timestamp: parsedTx.timestamp || rawTx.blockTime,
              signature: parsedTx.signature,
              usdcAmount: usdcAmount,
              description: parsedTx.description || 'Trading profit transfer',
              fee: (parsedTx.fee || 0) / 1e9, // Convert to SOL
              slot: parsedTx.slot || rawTx.slot,
              type: parsedTx.type,
              source: parsedTx.source
            };

            profitTransfers.push(profitRecord);
            console.log(`   ✓ Found profit: ${usdcAmount.toFixed(6)} USDC`);
          }
        }

        processedCount++;
      }
    }

    // Rate limit delay
    if (i + BATCH_SIZE < signatures.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n   Processed ${processedCount} transactions`);
  console.log(`   Found ${profitTransfers.length} profit transfers\n`);

  return profitTransfers;
}

/**
 * Generate CSV report
 */
function generateCSVReport(profitTransfers) {
  if (profitTransfers.length === 0) {
    console.log('⚠️  No profit transfers found\n');
    return;
  }

  console.log('📄 Generating CSV Report...\n');

  // Sort by date (oldest first)
  profitTransfers.sort((a, b) => a.timestamp - b.timestamp);

  // CSV header
  const csvLines = [
    'Date,USDC Amount,Fee (SOL),Signature,Description,Explorer Link'
  ];

  let totalUSDC = 0;
  let totalFees = 0;

  // Add each profit transfer
  for (const profit of profitTransfers) {
    const explorerLink = `https://solscan.io/tx/${profit.signature}`;

    const csvLine = [
      profit.date,
      profit.usdcAmount.toFixed(6),
      profit.fee.toFixed(9),
      profit.signature,
      (profit.description || '').replace(/,/g, ';'),
      explorerLink
    ].join(',');

    csvLines.push(csvLine);

    totalUSDC += profit.usdcAmount;
    totalFees += profit.fee;
  }

  // Add summary row
  csvLines.push('');
  csvLines.push(`TOTAL,${totalUSDC.toFixed(6)},${totalFees.toFixed(9)},,,`);

  // Write CSV
  fs.writeFileSync(PROFITS_REPORT_CSV, csvLines.join('\n'));

  console.log(`   ✓ Saved to: ${PROFITS_REPORT_CSV}\n`);

  return { totalUSDC, totalFees };
}

/**
 * Generate summary JSON
 */
function generateSummaryJSON(profitTransfers, stats) {
  const summary = {
    metadata: {
      tradingBotWallet: TRADING_BOT_WALLET,
      profitWallet: PROFIT_WALLET,
      token: 'USDC',
      tokenMint: USDC_MINT,
      taxYear: '2024-25',
      generatedAt: new Date().toISOString()
    },
    stats: {
      totalTransfers: profitTransfers.length,
      totalUSDC: parseFloat(stats.totalUSDC.toFixed(6)),
      totalFees: parseFloat(stats.totalFees.toFixed(9)),
      averageTransfer: profitTransfers.length > 0
        ? parseFloat((stats.totalUSDC / profitTransfers.length).toFixed(6))
        : 0
    },
    dateRange: profitTransfers.length > 0 ? {
      first: profitTransfers[0].date,
      last: profitTransfers[profitTransfers.length - 1].date
    } : null,
    monthlyBreakdown: {}
  };

  // Calculate monthly breakdown
  for (const profit of profitTransfers) {
    const date = new Date(profit.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!summary.monthlyBreakdown[monthKey]) {
      summary.monthlyBreakdown[monthKey] = {
        count: 0,
        totalUSDC: 0
      };
    }

    summary.monthlyBreakdown[monthKey].count++;
    summary.monthlyBreakdown[monthKey].totalUSDC += profit.usdcAmount;
  }

  // Round monthly totals
  for (const month in summary.monthlyBreakdown) {
    summary.monthlyBreakdown[month].totalUSDC = parseFloat(
      summary.monthlyBreakdown[month].totalUSDC.toFixed(6)
    );
  }

  fs.writeFileSync(PROFITS_SUMMARY_JSON, JSON.stringify(summary, null, 2));

  console.log(`   ✓ Saved to: ${PROFITS_SUMMARY_JSON}\n`);

  return summary;
}

/**
 * Display summary statistics
 */
function displaySummary(summary) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💰 TRADING PROFIT SUMMARY\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Total Verified Profits:\n');
  console.log(`   💵 ${summary.stats.totalUSDC.toLocaleString()} USDC`);
  console.log(`   📈 ${summary.stats.totalTransfers} profit transfers`);
  console.log(`   📊 ${summary.stats.averageTransfer.toLocaleString()} USDC average per transfer`);
  console.log(`   ⛽ ${summary.stats.totalFees.toFixed(9)} SOL in fees\n`);

  if (summary.dateRange) {
    console.log('📅 Date Range:\n');
    console.log(`   First: ${summary.dateRange.first}`);
    console.log(`   Last:  ${summary.dateRange.last}\n`);
  }

  if (Object.keys(summary.monthlyBreakdown).length > 0) {
    console.log('📅 Monthly Breakdown:\n');
    const sortedMonths = Object.entries(summary.monthlyBreakdown).sort();

    for (const [month, data] of sortedMonths) {
      console.log(`   ${month}: ${data.totalUSDC.toLocaleString()} USDC (${data.count} transfers)`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📁 Files Generated:\n');
  console.log(`   📄 ${PROFITS_REPORT_CSV}`);
  console.log(`   📊 ${PROFITS_SUMMARY_JSON}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('💡 For Tax Purposes:\n');
  console.log(`   ✅ Total Trading Income: ${summary.stats.totalUSDC.toLocaleString()} USDC`);
  console.log('   ✅ All transfers are from verified trading bot wallet');
  console.log('   ✅ Each transfer has blockchain proof (signature)\n');
  console.log('   📝 Convert USDC to GBP/USD using exchange rate on transaction date\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check API key
    if (!HELIUS_API_KEY || HELIUS_API_KEY === 'YOUR_API_KEY_HERE') {
      console.error('❌ Error: Please set your HELIUS_API_KEY environment variable');
      process.exit(1);
    }

    // Extract profit transfers
    const profitTransfers = await extractProfitTransfers();

    if (profitTransfers.length === 0) {
      console.log('⚠️  No USDC profit transfers found from trading bot to profit wallet\n');
      console.log('Possible reasons:');
      console.log('   - Trading bot may use different tokens');
      console.log('   - Profits may be in SOL instead of USDC');
      console.log('   - No profits were transferred during this tax year\n');
      return;
    }

    // Generate CSV report
    const stats = generateCSVReport(profitTransfers);

    // Generate summary JSON
    const summary = generateSummaryJSON(profitTransfers, stats);

    // Display summary
    displaySummary(summary);

    console.log('✅ Complete! Verified trading profits have been catalogued.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
