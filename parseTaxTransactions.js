#!/usr/bin/env node

/**
 * Parse and Tag Transactions for Tax Reporting
 *
 * This script:
 * 1. Reads raw transaction data from NDJSON file
 * 2. Parses transactions using Helius Enhanced Transactions API
 * 3. Tags and categorizes transactions for tax purposes
 * 4. Generates CSV reports for accountant/government
 */

const fs = require('fs');
const readline = require('readline');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '93812d12-f56f-4624-97c9-9a4d242db974';
const HELIUS_ENHANCED_API_URL = `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${HELIUS_API_KEY}`;

// Input/Output files
const TRADING_ADDRESS = 'rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i';
const PROFIT_WALLET = 'StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC';

const NDJSON_INPUT = 'tax_year_2024-25_transactions.ndjson';
const PARSED_OUTPUT = 'tax_year_2024-25_parsed.ndjson';
const PROGRESS_FILE = 'tax_year_2024-25_parse_progress.json';
const TAX_REPORT_CSV = 'tax_year_2024-25_tax_report.csv';

// Batch size for API calls (Helius allows multiple transactions per call)
const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES = 1000; // 1 second

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE_REPARSE = args.includes('--force') || args.includes('-f');
const RESUME = args.includes('--resume') || args.includes('-r');

console.log('📊 Transaction Parser & Tax Report Generator\n');

/**
 * Check if parsing has already been done
 */
function checkExistingParsedData() {
  const parsedExists = fs.existsSync(PARSED_OUTPUT);
  const progressExists = fs.existsSync(PROGRESS_FILE);

  if (parsedExists && !progressExists) {
    // Complete parse exists
    const stats = fs.statSync(PARSED_OUTPUT);
    return {
      exists: true,
      complete: true,
      fileSizeMB: (stats.size / 1024 / 1024).toFixed(2)
    };
  } else if (parsedExists && progressExists) {
    // Partial parse exists
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return {
        exists: true,
        complete: false,
        progress
      };
    } catch (error) {
      return { exists: false, complete: false };
    }
  }

  return { exists: false, complete: false };
}

/**
 * Count lines in a file
 */
function countLines(filename) {
  if (!fs.existsSync(filename)) return 0;
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.trim().split('\n');
  return lines.length > 0 && lines[0] !== '' ? lines.length : 0;
}

/**
 * Extract signature from raw transaction
 */
function extractSignature(tx) {
  // Transaction signature is in the transaction.signatures array
  if (tx.transaction && tx.transaction.signatures && tx.transaction.signatures.length > 0) {
    return tx.transaction.signatures[0];
  }
  return null;
}

/**
 * Parse transactions using Helius Enhanced Transactions API
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

    const parsed = await response.json();
    return parsed;
  } catch (error) {
    console.error(`   ✗ Error parsing batch:`, error.message);
    return null;
  }
}

/**
 * Categorize transaction for tax purposes
 */
function categorizeTransaction(parsedTx, rawTx) {
  const category = {
    signature: parsedTx.signature || 'UNKNOWN',
    timestamp: parsedTx.timestamp || rawTx.blockTime,
    date: parsedTx.timestamp
      ? new Date(parsedTx.timestamp * 1000).toISOString()
      : new Date(rawTx.blockTime * 1000).toISOString(),
    type: parsedTx.type || 'UNKNOWN',
    description: parsedTx.description || 'Unknown transaction',
    source: parsedTx.source || 'UNKNOWN',
    fee: parsedTx.fee || 0,
    feePayer: parsedTx.feePayer || '',

    // Transaction details
    nativeTransfers: parsedTx.nativeTransfers || [],
    tokenTransfers: parsedTx.tokenTransfers || [],
    accountData: parsedTx.accountData || [],

    // Tax-specific categorization
    taxCategory: null,
    taxableAmount: 0,
    currency: 'SOL',
    notes: []
  };

  // Categorize for tax purposes
  switch (parsedTx.type) {
    case 'TRANSFER':
      category.taxCategory = 'TRANSFER';
      if (parsedTx.nativeTransfers && parsedTx.nativeTransfers.length > 0) {
        const transfer = parsedTx.nativeTransfers[0];
        if (transfer.fromUserAccount === TRADING_ADDRESS) {
          category.taxCategory = 'OUTGOING_TRANSFER';
          category.taxableAmount = transfer.amount / 1e9; // Convert lamports to SOL
        } else if (transfer.toUserAccount === TRADING_ADDRESS) {
          category.taxCategory = 'INCOMING_TRANSFER';
          category.taxableAmount = transfer.amount / 1e9;
        }
      }
      break;

    case 'SWAP':
      category.taxCategory = 'TRADE_SWAP';
      category.notes.push('Potential taxable event - crypto-to-crypto swap');
      break;

    case 'NFT_SALE':
    case 'NFT_BID':
    case 'NFT_LISTING':
      category.taxCategory = 'NFT_TRANSACTION';
      break;

    case 'COMPRESSED_NFT_MINT':
    case 'NFT_MINT':
      category.taxCategory = 'NFT_MINT';
      break;

    default:
      category.taxCategory = 'OTHER';
      if (parsedTx.type) {
        category.notes.push(`Transaction type: ${parsedTx.type}`);
      }
  }

  // Check for profit wallet transfers
  if (parsedTx.nativeTransfers) {
    for (const transfer of parsedTx.nativeTransfers) {
      if (transfer.toUserAccount === PROFIT_WALLET) {
        category.taxCategory = 'PROFIT_TRANSFER';
        category.taxableAmount = transfer.amount / 1e9;
        category.notes.push('Transfer to profit wallet - likely trading income');
      }
    }
  }

  return category;
}

/**
 * Process raw transactions and parse them
 */
async function parseAndTagTransactions(resumeFrom = 0) {
  // Check if input file exists
  if (!fs.existsSync(NDJSON_INPUT)) {
    console.error(`❌ Error: Input file ${NDJSON_INPUT} not found`);
    console.error('   Run fetchTaxYearTransactions.js first to fetch transactions\n');
    process.exit(1);
  }

  console.log(`📥 Reading transactions from: ${NDJSON_INPUT}\n`);

  // Read all transactions into memory (signatures only for batching)
  const allSignatures = [];
  const rawTransactions = [];

  const fileStream = fs.createReadStream(NDJSON_INPUT);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('   Reading transaction signatures...');
  let lineCount = 0;

  for await (const line of rl) {
    if (line.trim()) {
      const tx = JSON.parse(line);
      const signature = extractSignature(tx);
      if (signature) {
        allSignatures.push(signature);
        rawTransactions.push(tx);
      }
      lineCount++;
      if (lineCount % 10000 === 0) {
        console.log(`   Read ${lineCount} transactions...`);
      }
    }
  }

  console.log(`   ✓ Loaded ${allSignatures.length} transaction signatures\n`);

  // Create write stream for parsed data
  const writeMode = resumeFrom > 0 ? 'a' : 'w';
  const writeStream = fs.createWriteStream(PARSED_OUTPUT, { flags: writeMode });

  console.log('🔄 Parsing transactions using Enhanced Transactions API...\n');

  let processedCount = resumeFrom;
  let successCount = 0;
  let failCount = 0;
  let batchNumber = Math.floor(resumeFrom / BATCH_SIZE);

  const categoryStats = {};

  // Process in batches
  for (let i = resumeFrom; i < allSignatures.length; i += BATCH_SIZE) {
    batchNumber++;
    const batchSignatures = allSignatures.slice(i, Math.min(i + BATCH_SIZE, allSignatures.length));
    const batchRawTxs = rawTransactions.slice(i, Math.min(i + BATCH_SIZE, allSignatures.length));

    console.log(`   Batch ${batchNumber}/${Math.ceil(allSignatures.length / BATCH_SIZE)}: Parsing ${batchSignatures.length} transactions...`);

    const parsedBatch = await parseTransactionBatch(batchSignatures);

    if (parsedBatch && Array.isArray(parsedBatch)) {
      for (let j = 0; j < parsedBatch.length; j++) {
        const parsed = parsedBatch[j];
        const rawTx = batchRawTxs[j];

        if (parsed && !parsed.error) {
          // Categorize and tag
          const categorized = categorizeTransaction(parsed, rawTx);

          // Write to output
          writeStream.write(JSON.stringify(categorized) + '\n');

          // Update stats
          const category = categorized.taxCategory || 'UNKNOWN';
          categoryStats[category] = (categoryStats[category] || 0) + 1;

          successCount++;
        } else {
          // If parsing failed, save raw transaction with error marker
          writeStream.write(JSON.stringify({
            signature: batchSignatures[j],
            timestamp: rawTx.blockTime,
            date: new Date(rawTx.blockTime * 1000).toISOString(),
            type: 'PARSE_FAILED',
            taxCategory: 'PARSE_FAILED',
            notes: ['Enhanced API could not parse this transaction', 'Manual review required'],
            rawError: parsed?.error || 'No parsed data returned'
          }) + '\n');
          failCount++;
        }

        processedCount++;
      }

      console.log(`   ✓ Processed ${processedCount}/${allSignatures.length} (Success: ${successCount}, Failed: ${failCount})`);
    } else {
      console.error(`   ✗ Failed to parse batch ${batchNumber}`);
      failCount += batchSignatures.length;
    }

    // Save progress every 10 batches
    if (batchNumber % 10 === 0) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        processedCount,
        successCount,
        failCount,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    }

    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < allSignatures.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  // Close write stream
  await new Promise(resolve => writeStream.end(resolve));

  // Clean up progress file
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }

  console.log('\n✅ Parsing Complete!\n');
  console.log('📊 Results:');
  console.log(`   Total Processed: ${processedCount}`);
  console.log(`   Successfully Parsed: ${successCount}`);
  console.log(`   Failed to Parse: ${failCount}`);
  console.log('\n📋 Tax Category Breakdown:');

  const sortedCategories = Object.entries(categoryStats).sort((a, b) => b[1] - a[1]);
  for (const [category, count] of sortedCategories) {
    console.log(`   ${category}: ${count} transactions`);
  }

  return { processedCount, successCount, failCount, categoryStats };
}

/**
 * Generate CSV tax report
 */
function generateTaxReport() {
  if (!fs.existsSync(PARSED_OUTPUT)) {
    console.error(`❌ Error: Parsed data file ${PARSED_OUTPUT} not found`);
    console.error('   Run parsing first before generating report\n');
    return;
  }

  console.log('\n📄 Generating CSV Tax Report...\n');

  const csvLines = [
    'Date,Signature,Type,Tax Category,Description,Amount (SOL),Fee (SOL),Notes'
  ];

  const fileStream = fs.createReadStream(PARSED_OUTPUT);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      if (line.trim()) {
        const tx = JSON.parse(line);

        const csvLine = [
          tx.date || '',
          tx.signature || '',
          tx.type || '',
          tx.taxCategory || '',
          (tx.description || '').replace(/,/g, ';'), // Escape commas
          tx.taxableAmount || 0,
          (tx.fee || 0) / 1e9, // Convert lamports to SOL
          (tx.notes || []).join('; ').replace(/,/g, ';')
        ].join(',');

        csvLines.push(csvLine);
        lineCount++;
      }
    });

    rl.on('close', () => {
      fs.writeFileSync(TAX_REPORT_CSV, csvLines.join('\n'));
      console.log(`   ✓ Generated report with ${lineCount} transactions`);
      console.log(`   📄 Saved to: ${TAX_REPORT_CSV}\n`);
      resolve(lineCount);
    });
  });
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

    // Check for existing parsed data
    const existingData = checkExistingParsedData();

    if (existingData.exists && existingData.complete && !FORCE_REPARSE) {
      console.log('✅ Parsed data already exists!\n');
      console.log(`📄 File: ${PARSED_OUTPUT} (${existingData.fileSizeMB} MB)`);
      console.log(`   Transactions: ${countLines(PARSED_OUTPUT)}\n`);
      console.log('💡 Options:');
      console.log('   --force  (-f) : Re-parse all transactions');
      console.log('   --report      : Generate CSV tax report only\n');

      // Check if user wants report only
      if (args.includes('--report')) {
        await generateTaxReport();
      }
      return;
    }

    if (existingData.exists && !existingData.complete && !RESUME && !FORCE_REPARSE) {
      console.log('⚠️  Incomplete parsing detected!\n');
      console.log(`   Processed: ${existingData.progress.processedCount} transactions`);
      console.log('💡 Options:');
      console.log('   --resume (-r) : Resume from where it left off');
      console.log('   --force  (-f) : Delete and re-parse all\n');
      process.exit(0);
    }

    if (FORCE_REPARSE && existingData.exists) {
      console.log('🗑️  Deleting existing parsed data...\n');
      if (fs.existsSync(PARSED_OUTPUT)) fs.unlinkSync(PARSED_OUTPUT);
      if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
      if (fs.existsSync(TAX_REPORT_CSV)) fs.unlinkSync(TAX_REPORT_CSV);
    }

    // Parse transactions
    const resumeFrom = (RESUME && existingData.exists && !existingData.complete)
      ? existingData.progress.processedCount
      : 0;

    await parseAndTagTransactions(resumeFrom);

    // Generate CSV report
    await generateTaxReport();

    console.log('✅ Complete!\n');
    console.log('📁 Output Files:');
    console.log(`   📄 Parsed data: ${PARSED_OUTPUT}`);
    console.log(`   📊 Tax report: ${TAX_REPORT_CSV}\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
