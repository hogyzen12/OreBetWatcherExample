#!/usr/bin/env node

/**
 * Fetch Trading Transactions for UK Tax Year 2024-25
 * Tax Year: April 6, 2024 to April 5, 2025
 * Address: rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i
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
 * Fetch all transactions with pagination
 */
async function fetchAllTransactions() {
  let allTransactions = [];
  let paginationToken = null;
  let pageCount = 0;

  console.log('📥 Fetching transactions...\n');

  do {
    pageCount++;
    console.log(`   Page ${pageCount}: Fetching...`);

    try {
      const result = await fetchTransactions(paginationToken);

      if (result.data && result.data.length > 0) {
        allTransactions.push(...result.data);
        console.log(`   ✓ Fetched ${result.data.length} transactions (Total: ${allTransactions.length})`);

        // Get the first and last transaction times for this batch
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

  return allTransactions;
}

/**
 * Analyze and summarize transactions
 */
function analyzeTransactions(transactions) {
  console.log('\n📊 Transaction Summary\n');
  console.log(`   Total Transactions: ${transactions.length}`);

  if (transactions.length === 0) {
    return;
  }

  // Date range
  const firstDate = new Date(transactions[0].blockTime * 1000);
  const lastDate = new Date(transactions[transactions.length - 1].blockTime * 1000);
  console.log(`   Date Range: ${firstDate.toISOString()} to ${lastDate.toISOString()}`);

  // Count by month
  const monthlyCount = {};
  transactions.forEach(tx => {
    const date = new Date(tx.blockTime * 1000);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
  });

  console.log('\n   Monthly Breakdown:');
  Object.entries(monthlyCount).sort().forEach(([month, count]) => {
    console.log(`     ${month}: ${count} transactions`);
  });
}

/**
 * Save transactions to JSON file
 */
function saveTransactions(transactions) {
  const filename = `tax_year_2024-25_transactions_${Date.now()}.json`;

  const output = {
    metadata: {
      address: TRADING_ADDRESS,
      taxYear: '2024-25',
      dateRange: {
        start: new Date(TAX_YEAR_START * 1000).toISOString(),
        end: new Date(TAX_YEAR_END * 1000).toISOString(),
        startTimestamp: TAX_YEAR_START,
        endTimestamp: TAX_YEAR_END
      },
      totalTransactions: transactions.length,
      fetchedAt: new Date().toISOString()
    },
    transactions
  };

  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved to: ${filename}`);
  console.log(`   File size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`);
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

    // Fetch all transactions
    const transactions = await fetchAllTransactions();

    // Analyze
    analyzeTransactions(transactions);

    // Save to file
    if (transactions.length > 0) {
      saveTransactions(transactions);
    }

    console.log('\n✅ Complete!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
