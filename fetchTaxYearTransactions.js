#!/usr/bin/env node

/**
 * Fetch Trading Transactions for UK Tax Year 2024-25
 * Tax Year: April 6, 2024 to April 5, 2025
 * Address: rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i
 *
 * MEMORY EFFICIENT VERSION - Streams data to disk as it fetches
 */

const fs = require('fs');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'YOUR_API_KEY_HERE';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const TRADING_ADDRESS = 'rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i';

// UK Tax Year 2024-25: April 6, 2024 to April 5, 2025
const TAX_YEAR_START = Math.floor(new Date('2024-04-06T00:00:00Z').getTime() / 1000);
const TAX_YEAR_END = Math.floor(new Date('2025-04-05T23:59:59Z').getTime() / 1000);

console.log('🔍 Fetching transactions for UK Tax Year 2024-25');
console.log(`📅 Date Range: April 6, 2024 to April 5, 2025`);
console.log(`📍 Address: ${TRADING_ADDRESS}`);
console.log(`⏰ Unix Timestamps: ${TAX_YEAR_START} to ${TAX_YEAR_END}\n`);

/**
 * Fetch transactions from Helius API with pagination
 */
async function fetchTransactions(paginationToken = null) {
  const params = [
    TRADING_ADDRESS,
    {
      transactionDetails: 'full',
      sortOrder: 'asc', // Chronological order (oldest first)
      limit: 100, // Max for full transaction details
      maxSupportedTransactionVersion: 0,
      encoding: 'jsonParsed',
      filters: {
        blockTime: {
          gte: TAX_YEAR_START,
          lte: TAX_YEAR_END
        },
        status: 'succeeded' // Only successful transactions
      }
    }
  ];

  // Add pagination token if provided
  if (paginationToken) {
    params[1].paginationToken = paginationToken;
  }

  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransactionsForAddress',
      params
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`API error: ${data.error.message}`);
  }

  return data.result;
}

/**
 * Fetch all transactions and stream to file (NDJSON format)
 * This avoids memory issues by writing incrementally
 */
async function fetchAndStreamTransactions(ndjsonFilename, summaryFilename) {
  let paginationToken = null;
  let pageCount = 0;
  let totalTransactions = 0;
  let monthlyCount = {};
  let firstTxTime = null;
  let lastTxTime = null;

  // Create write stream for NDJSON (newline-delimited JSON)
  const writeStream = fs.createWriteStream(ndjsonFilename, { flags: 'w' });

  console.log('📥 Fetching and streaming transactions to disk...\n');
  console.log(`💾 Writing to: ${ndjsonFilename}\n`);

  do {
    pageCount++;
    console.log(`   Page ${pageCount}: Fetching...`);

    try {
      const result = await fetchTransactions(paginationToken);

      if (result.data && result.data.length > 0) {
        // Write each transaction as a line in NDJSON format
        for (const tx of result.data) {
          writeStream.write(JSON.stringify(tx) + '\n');

          // Track stats
          const txTime = tx.blockTime;
          if (!firstTxTime) firstTxTime = txTime;
          lastTxTime = txTime;

          const date = new Date(txTime * 1000);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
        }

        totalTransactions += result.data.length;
        console.log(`   ✓ Wrote ${result.data.length} transactions (Total: ${totalTransactions})`);

        // Show time range for this batch
        const firstTx = new Date(result.data[0].blockTime * 1000).toISOString();
        const lastTx = new Date(result.data[result.data.length - 1].blockTime * 1000).toISOString();
        console.log(`     Range: ${firstTx} to ${lastTx}`);
      } else {
        console.log(`   ✓ No more transactions found`);
      }

      paginationToken = result.paginationToken;

      // Small delay to avoid rate limits
      if (paginationToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`   ✗ Error fetching page ${pageCount}:`, error.message);
      break;
    }
  } while (paginationToken);

  // Close the write stream
  await new Promise((resolve) => {
    writeStream.end(resolve);
  });

  console.log('\n📊 Transaction Summary\n');
  console.log(`   Total Transactions: ${totalTransactions}`);

  if (totalTransactions > 0) {
    console.log(`   Date Range: ${new Date(firstTxTime * 1000).toISOString()} to ${new Date(lastTxTime * 1000).toISOString()}`);

    console.log('\n   Monthly Breakdown:');
    Object.entries(monthlyCount).sort().forEach(([month, count]) => {
      console.log(`     ${month}: ${count} transactions`);
    });
  }

  // Save summary to separate JSON file
  const summary = {
    metadata: {
      address: TRADING_ADDRESS,
      taxYear: '2024-25',
      dateRange: {
        start: new Date(TAX_YEAR_START * 1000).toISOString(),
        end: new Date(TAX_YEAR_END * 1000).toISOString(),
        startTimestamp: TAX_YEAR_START,
        endTimestamp: TAX_YEAR_END
      },
      totalTransactions,
      fetchedAt: new Date().toISOString(),
      dataFile: ndjsonFilename,
      dataFormat: 'ndjson (newline-delimited JSON - one transaction per line)'
    },
    actualDateRange: firstTxTime ? {
      start: new Date(firstTxTime * 1000).toISOString(),
      end: new Date(lastTxTime * 1000).toISOString(),
      startTimestamp: firstTxTime,
      endTimestamp: lastTxTime
    } : null,
    monthlyBreakdown: monthlyCount
  };

  fs.writeFileSync(summaryFilename, JSON.stringify(summary, null, 2));

  return { totalTransactions, ndjsonFilename, summaryFilename };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check API key
    if (HELIUS_API_KEY === 'YOUR_API_KEY_HERE') {
      console.error('❌ Error: Please set your HELIUS_API_KEY environment variable');
      console.error('   Example: export HELIUS_API_KEY=your_api_key_here');
      process.exit(1);
    }

    const timestamp = Date.now();
    const ndjsonFilename = `tax_year_2024-25_transactions_${timestamp}.ndjson`;
    const summaryFilename = `tax_year_2024-25_summary_${timestamp}.json`;

    // Fetch and stream to file
    const result = await fetchAndStreamTransactions(ndjsonFilename, summaryFilename);

    if (result.totalTransactions > 0) {
      const ndjsonSizeMB = (fs.statSync(result.ndjsonFilename).size / 1024 / 1024).toFixed(2);
      const summarySizeKB = (fs.statSync(result.summaryFilename).size / 1024).toFixed(2);

      console.log(`\n💾 Files saved:`);
      console.log(`   📄 Transactions: ${result.ndjsonFilename} (${ndjsonSizeMB} MB)`);
      console.log(`   📊 Summary: ${result.summaryFilename} (${summarySizeKB} KB)`);
      console.log(`\n💡 Tip: Use jq to process the NDJSON file:`);
      console.log(`   cat ${result.ndjsonFilename} | head -1 | jq .`);
      console.log(`   cat ${result.ndjsonFilename} | jq -s 'length'`);
    }

    console.log('\n✅ Complete!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
