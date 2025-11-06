#!/usr/bin/env node

/**
 * Fetch Profit Wallet Transactions for Tax Year 2024-25
 * Tax Year: April 6, 2024 to April 5, 2025
 * Profit Wallet: StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC
 *
 * This wallet receives trading bot profits
 */

const fs = require('fs');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '93812d12-f56f-4624-97c9-9a4d242db974';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PROFIT_WALLET = 'StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC';

// UK Tax Year 2024-25
const TAX_YEAR_START = Math.floor(new Date('2024-04-06T00:00:00Z').getTime() / 1000);
const TAX_YEAR_END = Math.floor(new Date('2025-04-05T23:59:59Z').getTime() / 1000);

// Output files
const NDJSON_FILENAME = 'tax_year_2024-25_profit_wallet_transactions.ndjson';
const SUMMARY_FILENAME = 'tax_year_2024-25_profit_wallet_summary.json';
const PROGRESS_FILENAME = 'tax_year_2024-25_profit_wallet_progress.json';

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE_REFETCH = args.includes('--force') || args.includes('-f');
const RESUME = args.includes('--resume') || args.includes('-r');

console.log('💰 Fetching Profit Wallet Transactions for UK Tax Year 2024-25');
console.log(`📅 Date Range: April 6, 2024 to April 5, 2025`);
console.log(`📍 Profit Wallet: ${PROFIT_WALLET}`);
console.log(`⏰ Unix Timestamps: ${TAX_YEAR_START} to ${TAX_YEAR_END}\n`);

/**
 * Check if data has already been fetched
 */
function checkExistingData() {
  const ndjsonExists = fs.existsSync(NDJSON_FILENAME);
  const summaryExists = fs.existsSync(SUMMARY_FILENAME);
  const progressExists = fs.existsSync(PROGRESS_FILENAME);

  if (ndjsonExists && summaryExists && !progressExists) {
    try {
      const summary = JSON.parse(fs.readFileSync(SUMMARY_FILENAME, 'utf8'));
      return { exists: true, complete: true, summary };
    } catch (error) {
      return { exists: false, complete: false };
    }
  } else if (ndjsonExists && progressExists) {
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILENAME, 'utf8'));
      const stats = fs.statSync(NDJSON_FILENAME);
      return {
        exists: true,
        complete: false,
        progress,
        fileSizeMB: (stats.size / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      return { exists: false, complete: false };
    }
  }

  return { exists: false, complete: false };
}

/**
 * Save progress
 */
function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILENAME, JSON.stringify(data, null, 2));
}

/**
 * Clean up progress file
 */
function cleanupProgress() {
  if (fs.existsSync(PROGRESS_FILENAME)) {
    fs.unlinkSync(PROGRESS_FILENAME);
  }
}

/**
 * Fetch transactions from Helius API
 */
async function fetchTransactions(paginationToken = null) {
  const params = [
    PROFIT_WALLET,
    {
      transactionDetails: 'full',
      sortOrder: 'asc',
      limit: 100,
      maxSupportedTransactionVersion: 0,
      encoding: 'jsonParsed',
      filters: {
        blockTime: {
          gte: TAX_YEAR_START,
          lte: TAX_YEAR_END
        },
        status: 'succeeded'
      }
    }
  ];

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
 * Fetch and stream all transactions
 */
async function fetchAndStreamTransactions(resumeState = null) {
  let paginationToken = resumeState?.paginationToken || null;
  let pageCount = resumeState?.pageCount || 0;
  let totalTransactions = resumeState?.totalTransactions || 0;
  let monthlyCount = resumeState?.monthlyCount || {};
  let firstTxTime = resumeState?.firstTxTime || null;
  let lastTxTime = resumeState?.lastTxTime || null;

  const writeMode = resumeState ? 'a' : 'w';
  const writeStream = fs.createWriteStream(NDJSON_FILENAME, { flags: writeMode });

  if (resumeState) {
    console.log('📥 Resuming from previous session...\n');
    console.log(`   Already fetched: ${totalTransactions} transactions`);
    console.log(`   Resuming from page: ${pageCount + 1}\n`);
  } else {
    console.log('📥 Starting fresh fetch...\n');
  }

  console.log(`💾 Writing to: ${NDJSON_FILENAME}\n`);

  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  do {
    pageCount++;
    console.log(`   Page ${pageCount}: Fetching...`);

    try {
      const result = await fetchTransactions(paginationToken);

      if (result.data && result.data.length > 0) {
        for (const tx of result.data) {
          writeStream.write(JSON.stringify(tx) + '\n');

          const txTime = tx.blockTime;
          if (!firstTxTime) firstTxTime = txTime;
          lastTxTime = txTime;

          const date = new Date(txTime * 1000);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
        }

        totalTransactions += result.data.length;
        console.log(`   ✓ Wrote ${result.data.length} transactions (Total: ${totalTransactions})`);

        const firstTx = new Date(result.data[0].blockTime * 1000).toISOString();
        const lastTx = new Date(result.data[result.data.length - 1].blockTime * 1000).toISOString();
        console.log(`     Range: ${firstTx} to ${lastTx}`);

        consecutiveErrors = 0;
      } else {
        console.log(`   ✓ No more transactions found`);
      }

      paginationToken = result.paginationToken;

      if (pageCount % 10 === 0 && paginationToken) {
        saveProgress({
          paginationToken,
          pageCount,
          totalTransactions,
          monthlyCount,
          firstTxTime,
          lastTxTime,
          lastUpdated: new Date().toISOString()
        });
      }

      if (paginationToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      consecutiveErrors++;
      console.error(`   ✗ Error fetching page ${pageCount}:`, error.message);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n❌ Too many consecutive errors, stopping...`);
        console.error('💾 Progress saved. Use --resume to continue.\n');

        saveProgress({
          paginationToken,
          pageCount,
          totalTransactions,
          monthlyCount,
          firstTxTime,
          lastTxTime,
          lastUpdated: new Date().toISOString(),
          error: error.message
        });

        await new Promise((resolve) => writeStream.end(resolve));
        process.exit(1);
      }

      if (paginationToken) {
        console.log(`   ⏳ Waiting 5 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } while (paginationToken);

  await new Promise((resolve) => writeStream.end(resolve));

  console.log('\n📊 Transaction Summary\n');
  console.log(`   Total Transactions: ${totalTransactions}`);

  if (totalTransactions > 0) {
    console.log(`   Date Range: ${new Date(firstTxTime * 1000).toISOString()} to ${new Date(lastTxTime * 1000).toISOString()}`);

    console.log('\n   Monthly Breakdown:');
    Object.entries(monthlyCount).sort().forEach(([month, count]) => {
      console.log(`     ${month}: ${count} transactions`);
    });
  }

  const summary = {
    metadata: {
      address: PROFIT_WALLET,
      addressType: 'PROFIT_WALLET',
      taxYear: '2024-25',
      dateRange: {
        start: new Date(TAX_YEAR_START * 1000).toISOString(),
        end: new Date(TAX_YEAR_END * 1000).toISOString(),
        startTimestamp: TAX_YEAR_START,
        endTimestamp: TAX_YEAR_END
      },
      totalTransactions,
      fetchedAt: new Date().toISOString(),
      dataFile: NDJSON_FILENAME,
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

  fs.writeFileSync(SUMMARY_FILENAME, JSON.stringify(summary, null, 2));
  cleanupProgress();

  return { totalTransactions, ndjsonFilename: NDJSON_FILENAME, summaryFilename: SUMMARY_FILENAME };
}

/**
 * Main execution
 */
async function main() {
  try {
    if (!HELIUS_API_KEY || HELIUS_API_KEY === 'YOUR_API_KEY_HERE') {
      console.error('❌ Error: Please set your HELIUS_API_KEY environment variable');
      process.exit(1);
    }

    const existingData = checkExistingData();

    if (existingData.exists && existingData.complete && !FORCE_REFETCH) {
      console.log('✅ Profit wallet data already exists!\n');
      console.log(`📄 Transactions file: ${NDJSON_FILENAME}`);
      console.log(`📊 Summary file: ${SUMMARY_FILENAME}\n`);
      console.log('📊 Summary:');
      console.log(`   Total Transactions: ${existingData.summary.metadata.totalTransactions}`);
      console.log(`   Fetched: ${existingData.summary.metadata.fetchedAt}`);

      if (existingData.summary.monthlyBreakdown) {
        console.log('\n   Monthly Breakdown:');
        Object.entries(existingData.summary.monthlyBreakdown).sort().forEach(([month, count]) => {
          console.log(`     ${month}: ${count} transactions`);
        });
      }

      const fileSizeMB = (fs.statSync(NDJSON_FILENAME).size / 1024 / 1024).toFixed(2);
      console.log(`\n   File size: ${fileSizeMB} MB`);

      console.log('\n💡 To refetch the data, run:');
      console.log('   node fetchProfitWalletTransactions.js --force\n');
      return;
    }

    if (existingData.exists && !existingData.complete && !RESUME && !FORCE_REFETCH) {
      console.log('⚠️  Incomplete fetch detected!\n');
      console.log(`📄 Partial data file: ${NDJSON_FILENAME} (${existingData.fileSizeMB} MB)`);
      console.log(`📊 Progress: ${existingData.progress.totalTransactions} transactions fetched`);
      console.log(`📅 Last updated: ${existingData.progress.lastUpdated}\n`);
      console.log('Choose an option:');
      console.log('   --resume (-r) : Resume from where it left off');
      console.log('   --force  (-f) : Delete existing data and start fresh\n');
      process.exit(0);
    }

    if (FORCE_REFETCH && existingData.exists) {
      console.log('🗑️  Deleting existing data files...\n');
      if (fs.existsSync(NDJSON_FILENAME)) fs.unlinkSync(NDJSON_FILENAME);
      if (fs.existsSync(SUMMARY_FILENAME)) fs.unlinkSync(SUMMARY_FILENAME);
      if (fs.existsSync(PROGRESS_FILENAME)) fs.unlinkSync(PROGRESS_FILENAME);
    }

    let resumeState = null;
    if (RESUME && existingData.exists && !existingData.complete) {
      resumeState = existingData.progress;
    }

    const result = await fetchAndStreamTransactions(resumeState);

    if (result.totalTransactions > 0) {
      const ndjsonSizeMB = (fs.statSync(result.ndjsonFilename).size / 1024 / 1024).toFixed(2);
      const summarySizeKB = (fs.statSync(result.summaryFilename).size / 1024).toFixed(2);

      console.log(`\n💾 Files saved:`);
      console.log(`   📄 Transactions: ${result.ndjsonFilename} (${ndjsonSizeMB} MB)`);
      console.log(`   📊 Summary: ${result.summaryFilename} (${summarySizeKB} KB)`);
    }

    console.log('\n✅ Complete!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
