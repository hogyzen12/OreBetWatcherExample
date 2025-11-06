#!/usr/bin/env node

/**
 * Fetch Trading Transactions for UK Tax Year 2024-25
 * Tax Year: April 6, 2024 to April 5, 2025
 * Address: rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i
 *
 * MEMORY EFFICIENT VERSION - Streams data to disk as it fetches
 * SMART CACHING - Checks for existing data and resumes if interrupted
 */

const fs = require('fs');
const path = require('path');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '93812d12-f56f-4624-97c9-9a4d242db974';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const TRADING_ADDRESS = 'rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i';

// UK Tax Year 2024-25: April 6, 2024 to April 5, 2025
const TAX_YEAR_START = Math.floor(new Date('2024-04-06T00:00:00Z').getTime() / 1000);
const TAX_YEAR_END = Math.floor(new Date('2025-04-05T23:59:59Z').getTime() / 1000);

// Fixed filenames for easy detection of existing data
const NDJSON_FILENAME = 'tax_year_2024-25_transactions.ndjson';
const SUMMARY_FILENAME = 'tax_year_2024-25_summary.json';
const PROGRESS_FILENAME = 'tax_year_2024-25_progress.json';

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE_REFETCH = args.includes('--force') || args.includes('-f');
const RESUME = args.includes('--resume') || args.includes('-r');

console.log('🔍 Fetching transactions for UK Tax Year 2024-25');
console.log(`📅 Date Range: April 6, 2024 to April 5, 2025`);
console.log(`📍 Address: ${TRADING_ADDRESS}`);
console.log(`⏰ Unix Timestamps: ${TAX_YEAR_START} to ${TAX_YEAR_END}\n`);

/**
 * Check if data has already been fetched
 */
function checkExistingData() {
  const ndjsonExists = fs.existsSync(NDJSON_FILENAME);
  const summaryExists = fs.existsSync(SUMMARY_FILENAME);
  const progressExists = fs.existsSync(PROGRESS_FILENAME);

  if (ndjsonExists && summaryExists && !progressExists) {
    // Complete fetch exists
    try {
      const summary = JSON.parse(fs.readFileSync(SUMMARY_FILENAME, 'utf8'));
      return {
        exists: true,
        complete: true,
        summary,
        progressExists: false
      };
    } catch (error) {
      console.log('⚠️  Existing summary file is corrupted, will refetch');
      return { exists: false, complete: false };
    }
  } else if (ndjsonExists && progressExists) {
    // Partial fetch exists
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILENAME, 'utf8'));
      const stats = fs.statSync(NDJSON_FILENAME);
      return {
        exists: true,
        complete: false,
        progress,
        progressExists: true,
        fileSizeMB: (stats.size / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      console.log('⚠️  Existing progress file is corrupted, will start fresh');
      return { exists: false, complete: false };
    }
  }

  return { exists: false, complete: false };
}

/**
 * Save progress to file for resume capability
 */
function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILENAME, JSON.stringify(data, null, 2));
}

/**
 * Delete progress file when fetch is complete
 */
function cleanupProgress() {
  if (fs.existsSync(PROGRESS_FILENAME)) {
    fs.unlinkSync(PROGRESS_FILENAME);
  }
}

/**
 * Count lines in NDJSON file
 */
function countTransactionsInFile(filename) {
  if (!fs.existsSync(filename)) return 0;

  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.trim().split('\n');
  return lines.length > 0 && lines[0] !== '' ? lines.length : 0;
}

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
async function fetchAndStreamTransactions(resumeState = null) {
  let paginationToken = resumeState?.paginationToken || null;
  let pageCount = resumeState?.pageCount || 0;
  let totalTransactions = resumeState?.totalTransactions || 0;
  let monthlyCount = resumeState?.monthlyCount || {};
  let firstTxTime = resumeState?.firstTxTime || null;
  let lastTxTime = resumeState?.lastTxTime || null;

  // Create write stream for NDJSON (append if resuming, write if new)
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

        // Reset error counter on success
        consecutiveErrors = 0;
      } else {
        console.log(`   ✓ No more transactions found`);
      }

      paginationToken = result.paginationToken;

      // Save progress every 10 pages
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

      // Small delay to avoid rate limits
      if (paginationToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      consecutiveErrors++;
      console.error(`   ✗ Error fetching page ${pageCount}:`, error.message);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n❌ Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}), stopping...`);
        console.error('💾 Progress has been saved. Use --resume to continue later.\n');

        // Save final progress before exiting
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

        // Close write stream before exit
        await new Promise((resolve) => {
          writeStream.end(resolve);
        });

        process.exit(1);
      }

      // Wait longer before retrying after error
      if (paginationToken) {
        console.log(`   ⏳ Waiting 5 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
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

  // Clean up progress file since we're done
  cleanupProgress();

  return { totalTransactions, ndjsonFilename: NDJSON_FILENAME, summaryFilename: SUMMARY_FILENAME };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check API key
    if (!HELIUS_API_KEY || HELIUS_API_KEY === 'YOUR_API_KEY_HERE') {
      console.error('❌ Error: Please set your HELIUS_API_KEY environment variable');
      console.error('   Example: export HELIUS_API_KEY=your_api_key_here');
      process.exit(1);
    }

    // Check for existing data
    const existingData = checkExistingData();

    if (existingData.exists && existingData.complete && !FORCE_REFETCH) {
      console.log('✅ Data already exists!\n');
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
      console.log('   node fetchTaxYearTransactions.js --force\n');
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

    // Fetch and stream to file
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
