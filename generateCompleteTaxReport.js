#!/usr/bin/env node

/**
 * Complete Tax Report Generator
 *
 * This master script:
 * 1. Ensures trading wallet transactions are fetched
 * 2. Ensures profit wallet transactions are fetched
 * 3. Parses and tags all transactions
 * 4. Generates comprehensive CSV tax reports
 */

const fs = require('fs');
const readline = require('readline');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '93812d12-f56f-4624-97c9-9a4d242db974';
const HELIUS_ENHANCED_API_URL = `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${HELIUS_API_KEY}`;

const TRADING_ADDRESS = 'rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i';
const PROFIT_WALLET = 'StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC';

// Files
const TRADING_NDJSON = 'tax_year_2024-25_transactions.ndjson';
const PROFIT_NDJSON = 'tax_year_2024-25_profit_wallet_transactions.ndjson';
const COMBINED_PARSED = 'tax_year_2024-25_all_parsed.ndjson';
const TAX_REPORT_CSV = 'tax_year_2024-25_COMPLETE_TAX_REPORT.csv';
const INCOME_REPORT_CSV = 'tax_year_2024-25_INCOME_REPORT.csv';
const TRADES_REPORT_CSV = 'tax_year_2024-25_TRADES_REPORT.csv';

console.log('📊 Complete Tax Report Generator\n');
console.log('This will generate comprehensive tax reports from all wallet activity\n');

/**
 * Check prerequisites
 */
function checkPrerequisites() {
  const issues = [];

  if (!fs.existsSync(TRADING_NDJSON)) {
    issues.push(`❌ Missing: ${TRADING_NDJSON} - Run: node fetchTaxYearTransactions.js`);
  }

  if (!fs.existsSync(PROFIT_NDJSON)) {
    issues.push(`⚠️  Missing: ${PROFIT_NDJSON} - Run: node fetchProfitWalletTransactions.js`);
    issues.push(`   (Optional: Profit wallet data - script can continue without it)`);
  }

  return issues;
}

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
 * Categorize transaction for tax purposes
 */
function categorizeTransaction(parsedTx, rawTx, sourceWallet) {
  const category = {
    sourceWallet,
    signature: parsedTx.signature || 'UNKNOWN',
    timestamp: parsedTx.timestamp || rawTx.blockTime,
    date: parsedTx.timestamp
      ? new Date(parsedTx.timestamp * 1000).toISOString()
      : new Date(rawTx.blockTime * 1000).toISOString(),
    type: parsedTx.type || 'UNKNOWN',
    description: parsedTx.description || 'Unknown transaction',
    source: parsedTx.source || 'UNKNOWN',
    fee: (parsedTx.fee || 0) / 1e9, // Convert to SOL
    feePayer: parsedTx.feePayer || '',

    // Tax-specific categorization
    taxCategory: 'OTHER',
    taxableAmount: 0,
    currency: 'SOL',
    incomingAmount: 0,
    outgoingAmount: 0,
    notes: []
  };

  // Analyze transfers
  if (parsedTx.nativeTransfers && parsedTx.nativeTransfers.length > 0) {
    for (const transfer of parsedTx.nativeTransfers) {
      const amount = transfer.amount / 1e9; // Convert to SOL

      // Check if this is incoming or outgoing from our wallet
      if (transfer.toUserAccount === sourceWallet) {
        category.incomingAmount += amount;
      } else if (transfer.fromUserAccount === sourceWallet) {
        category.outgoingAmount += amount;
      }

      // Check for profit wallet transfers
      if (transfer.toUserAccount === PROFIT_WALLET) {
        category.taxCategory = 'TRADING_INCOME';
        category.taxableAmount = amount;
        category.notes.push('⭐ INCOME: Transfer to profit wallet - Trading Bot Profit');
      } else if (transfer.fromUserAccount === PROFIT_WALLET) {
        category.taxCategory = 'PROFIT_WITHDRAWAL';
        category.taxableAmount = amount;
        category.notes.push('Withdrawal from profit wallet');
      }
    }
  }

  // Categorize by transaction type
  switch (parsedTx.type) {
    case 'SWAP':
      if (category.taxCategory === 'OTHER') {
        category.taxCategory = 'CRYPTO_TRADE';
        category.notes.push('Crypto-to-crypto swap - Taxable trade');
      }
      break;

    case 'TRANSFER':
      if (category.taxCategory === 'OTHER') {
        if (category.incomingAmount > 0) {
          category.taxCategory = 'INCOMING_TRANSFER';
          category.taxableAmount = category.incomingAmount;
        } else if (category.outgoingAmount > 0) {
          category.taxCategory = 'OUTGOING_TRANSFER';
        }
      }
      break;

    case 'NFT_SALE':
      category.taxCategory = 'NFT_SALE';
      category.notes.push('NFT sale - May be taxable');
      break;

    case 'NFT_BID':
    case 'NFT_LISTING':
      category.taxCategory = 'NFT_ACTIVITY';
      break;

    case 'COMPRESSED_NFT_MINT':
    case 'NFT_MINT':
      category.taxCategory = 'NFT_MINT';
      break;
  }

  // Token transfers
  if (parsedTx.tokenTransfers && parsedTx.tokenTransfers.length > 0) {
    category.notes.push(`Token transfers: ${parsedTx.tokenTransfers.length}`);

    for (const tokenTransfer of parsedTx.tokenTransfers) {
      if (tokenTransfer.toUserAccount === sourceWallet) {
        category.notes.push(`Received ${tokenTransfer.tokenAmount || 'unknown'} ${tokenTransfer.mint || 'tokens'}`);
      }
    }
  }

  return category;
}

/**
 * Process and parse transactions from a file
 */
async function processTransactionFile(inputFile, sourceWallet, outputStream) {
  if (!fs.existsSync(inputFile)) {
    console.log(`⚠️  Skipping ${inputFile} (not found)\n`);
    return { processed: 0, success: 0, failed: 0 };
  }

  console.log(`\n📥 Processing: ${inputFile}`);
  console.log(`   Wallet: ${sourceWallet}\n`);

  // Read all signatures
  const signatures = [];
  const rawTransactions = [];

  const fileStream = fs.createReadStream(inputFile);
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

  console.log(`   ✓ Loaded ${signatures.length} signatures`);
  console.log(`   🔄 Parsing with Enhanced API...\n`);

  const BATCH_SIZE = 100;
  let processed = 0;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
    const batchSigs = signatures.slice(i, Math.min(i + BATCH_SIZE, signatures.length));
    const batchRaw = rawTransactions.slice(i, Math.min(i + BATCH_SIZE, signatures.length));

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(signatures.length / BATCH_SIZE);

    console.log(`   Batch ${batchNum}/${totalBatches}: Parsing ${batchSigs.length} txs...`);

    const parsed = await parseTransactionBatch(batchSigs);

    if (parsed && Array.isArray(parsed)) {
      for (let j = 0; j < parsed.length; j++) {
        const parsedTx = parsed[j];
        const rawTx = batchRaw[j];

        if (parsedTx && !parsedTx.error) {
          const categorized = categorizeTransaction(parsedTx, rawTx, sourceWallet);
          outputStream.write(JSON.stringify(categorized) + '\n');
          success++;
        } else {
          // Failed to parse
          outputStream.write(JSON.stringify({
            sourceWallet,
            signature: batchSigs[j],
            timestamp: rawTx.blockTime,
            date: new Date(rawTx.blockTime * 1000).toISOString(),
            type: 'PARSE_FAILED',
            taxCategory: 'NEEDS_MANUAL_REVIEW',
            notes: ['Enhanced API could not parse', 'Manual review required']
          }) + '\n');
          failed++;
        }
        processed++;
      }

      console.log(`   ✓ Processed ${processed}/${signatures.length}`);
    }

    // Rate limit delay
    if (i + BATCH_SIZE < signatures.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n   ✅ Completed: Success=${success}, Failed=${failed}\n`);

  return { processed, success, failed };
}

/**
 * Generate CSV reports
 */
async function generateReports() {
  if (!fs.existsSync(COMBINED_PARSED)) {
    console.error('❌ No parsed data found');
    return;
  }

  console.log('\n📄 Generating CSV Reports...\n');

  // All transactions
  const allLines = ['Date,Source Wallet,Signature,Type,Tax Category,Description,Incoming (SOL),Outgoing (SOL),Fee (SOL),Taxable Amount (SOL),Notes'];

  // Income only
  const incomeLines = ['Date,Signature,Type,Description,Amount (SOL),Fee (SOL),Notes'];

  // Trades only
  const tradeLines = ['Date,Signature,Type,Description,Incoming (SOL),Outgoing (SOL),Fee (SOL),Notes'];

  const fileStream = fs.createReadStream(COMBINED_PARSED);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalTxs = 0;
  let incomeCount = 0;
  let tradeCount = 0;
  let totalIncome = 0;
  let totalFees = 0;

  const categoryStats = {};

  for await (const line of rl) {
    if (line.trim()) {
      const tx = JSON.parse(line);
      totalTxs++;

      // Track stats
      const cat = tx.taxCategory || 'UNKNOWN';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;

      if (tx.taxCategory === 'TRADING_INCOME') {
        totalIncome += tx.taxableAmount || 0;
      }
      totalFees += tx.fee || 0;

      // All transactions CSV
      const allCsv = [
        tx.date || '',
        tx.sourceWallet || '',
        tx.signature || '',
        tx.type || '',
        tx.taxCategory || '',
        (tx.description || '').replace(/,/g, ';'),
        tx.incomingAmount || 0,
        tx.outgoingAmount || 0,
        tx.fee || 0,
        tx.taxableAmount || 0,
        (tx.notes || []).join('; ').replace(/,/g, ';')
      ].join(',');
      allLines.push(allCsv);

      // Income report
      if (tx.taxCategory === 'TRADING_INCOME' || tx.taxCategory === 'INCOMING_TRANSFER') {
        const incomeCsv = [
          tx.date || '',
          tx.signature || '',
          tx.type || '',
          (tx.description || '').replace(/,/g, ';'),
          tx.taxableAmount || tx.incomingAmount || 0,
          tx.fee || 0,
          (tx.notes || []).join('; ').replace(/,/g, ';')
        ].join(',');
        incomeLines.push(incomeCsv);
        incomeCount++;
      }

      // Trades report
      if (tx.taxCategory === 'CRYPTO_TRADE' || tx.type === 'SWAP') {
        const tradeCsv = [
          tx.date || '',
          tx.signature || '',
          tx.type || '',
          (tx.description || '').replace(/,/g, ';'),
          tx.incomingAmount || 0,
          tx.outgoingAmount || 0,
          tx.fee || 0,
          (tx.notes || []).join('; ').replace(/,/g, ';')
        ].join(',');
        tradeLines.push(tradeCsv);
        tradeCount++;
      }
    }
  }

  // Write CSVs
  fs.writeFileSync(TAX_REPORT_CSV, allLines.join('\n'));
  fs.writeFileSync(INCOME_REPORT_CSV, incomeLines.join('\n'));
  fs.writeFileSync(TRADES_REPORT_CSV, tradeLines.join('\n'));

  console.log('✅ Reports Generated!\n');
  console.log('📊 Summary Statistics:\n');
  console.log(`   Total Transactions: ${totalTxs}`);
  console.log(`   Income Transactions: ${incomeCount}`);
  console.log(`   Trade Transactions: ${tradeCount}`);
  console.log(`   Total Income: ${totalIncome.toFixed(4)} SOL`);
  console.log(`   Total Fees: ${totalFees.toFixed(4)} SOL`);

  console.log('\n📋 Category Breakdown:\n');
  const sorted = Object.entries(categoryStats).sort((a, b) => b[1] - a[1]);
  for (const [category, count] of sorted) {
    console.log(`   ${category}: ${count}`);
  }

  console.log('\n📁 Generated Files:\n');
  console.log(`   📄 ${TAX_REPORT_CSV} - All transactions`);
  console.log(`   💰 ${INCOME_REPORT_CSV} - Income only (${incomeCount} transactions)`);
  console.log(`   🔄 ${TRADES_REPORT_CSV} - Trades only (${tradeCount} transactions)`);
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check prerequisites
    const issues = checkPrerequisites();
    if (issues.length > 0) {
      console.log('⚠️  Prerequisites Check:\n');
      for (const issue of issues) {
        console.log(`   ${issue}`);
      }
      console.log('');

      if (!fs.existsSync(TRADING_NDJSON)) {
        console.error('❌ Trading wallet data is required. Exiting.\n');
        process.exit(1);
      }
    }

    // Create combined parsed file
    const outputStream = fs.createWriteStream(COMBINED_PARSED, { flags: 'w' });

    console.log('🚀 Starting transaction processing...\n');

    let totalStats = { processed: 0, success: 0, failed: 0 };

    // Process trading wallet
    const tradingStats = await processTransactionFile(TRADING_NDJSON, TRADING_ADDRESS, outputStream);
    totalStats.processed += tradingStats.processed;
    totalStats.success += tradingStats.success;
    totalStats.failed += tradingStats.failed;

    // Process profit wallet
    const profitStats = await processTransactionFile(PROFIT_NDJSON, PROFIT_WALLET, outputStream);
    totalStats.processed += profitStats.processed;
    totalStats.success += profitStats.success;
    totalStats.failed += profitStats.failed;

    // Close output stream
    await new Promise(resolve => outputStream.end(resolve));

    console.log('\n📊 Overall Parsing Results:\n');
    console.log(`   Total Processed: ${totalStats.processed}`);
    console.log(`   Successfully Parsed: ${totalStats.success}`);
    console.log(`   Failed to Parse: ${totalStats.failed}`);

    // Generate CSV reports
    await generateReports();

    console.log('\n✅ Complete! Tax reports ready for accountant.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
