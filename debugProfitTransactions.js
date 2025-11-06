#!/usr/bin/env node

/**
 * Debug script to inspect profit wallet transactions
 * This will help us understand the actual structure of the transactions
 * and find ALL USDC transfers
 */

const fs = require('fs');
const readline = require('readline');

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '93812d12-f56f-4624-97c9-9a4d242db974';
const HELIUS_ENHANCED_API_URL = `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${HELIUS_API_KEY}`;

const TRADING_BOT_WALLET = 'rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i';
const PROFIT_WALLET = 'StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const PROFIT_WALLET_NDJSON = 'tax_year_2024-25_profit_wallet_transactions.ndjson';

console.log('🔍 Debug: Inspecting Profit Wallet Transactions\n');

function extractSignature(tx) {
  if (tx.transaction && tx.transaction.signatures && tx.transaction.signatures.length > 0) {
    return tx.transaction.signatures[0];
  }
  return null;
}

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
    console.error(`Error parsing:`, error.message);
    return null;
  }
}

async function debugTransactions() {
  if (!fs.existsSync(PROFIT_WALLET_NDJSON)) {
    console.error(`❌ ${PROFIT_WALLET_NDJSON} not found`);
    process.exit(1);
  }

  console.log('📥 Reading ALL transactions...\n');

  const signatures = [];
  const rawTransactions = [];

  const fileStream = fs.createReadStream(PROFIT_WALLET_NDJSON);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (line.trim()) {
      const tx = JSON.parse(line);
      const signature = extractSignature(tx);
      if (signature) {
        signatures.push(signature);
        rawTransactions.push(tx);
        count++;
      }
    }
  }

  console.log(`Loaded ${signatures.length} transactions\n`);
  console.log('🔄 Parsing with Enhanced API in batches...\n');

  const BATCH_SIZE = 100;
  const allUSDCTransfers = [];
  let foundUSDC = 0;
  let foundFromBot = 0;
  let processed = 0;

  for (let batchStart = 0; batchStart < signatures.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, signatures.length);
    const batchSigs = signatures.slice(batchStart, batchEnd);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(signatures.length / BATCH_SIZE);

    console.log(`   Batch ${batchNum}/${totalBatches}: Processing ${batchSigs.length} transactions...`);

    const parsed = await parseTransactionBatch(batchSigs);

    if (!parsed || !Array.isArray(parsed)) {
      console.error('Failed to parse batch');
      continue;
    }

    for (let i = 0; i < parsed.length; i++) {
      const tx = parsed[i];
      processed++;

      if (!tx || tx.error) {
        continue;
      }

      // Check for token transfers
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        for (const transfer of tx.tokenTransfers) {
          const isUSDC = transfer.mint === USDC_MINT;

          if (isUSDC) {
            foundUSDC++;
            const fromBot = transfer.fromUserAccount === TRADING_BOT_WALLET;
            const toProfit = transfer.toUserAccount === PROFIT_WALLET;

            const usdcInfo = {
              signature: tx.signature,
              timestamp: tx.timestamp,
              date: new Date((tx.timestamp || 0) * 1000).toISOString(),
              description: tx.description,
              type: tx.type,
              source: tx.source,
              fromUserAccount: transfer.fromUserAccount,
              toUserAccount: transfer.toUserAccount,
              fromTokenAccount: transfer.fromTokenAccount,
              toTokenAccount: transfer.toTokenAccount,
              tokenAmount: transfer.tokenAmount,
              mint: transfer.mint,
              isFromBot: fromBot,
              isToProfit: toProfit,
              isProfitTransfer: fromBot && toProfit
            };

            allUSDCTransfers.push(usdcInfo);

            if (fromBot && toProfit) {
              foundFromBot++;
              console.log(`   🎯 PROFIT TRANSFER! ${transfer.tokenAmount / 1e6} USDC - ${tx.signature.substring(0, 20)}...`);
            }
          }
        }
      }
    }

    // Rate limit delay
    if (batchStart + BATCH_SIZE < signatures.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Summary:\n');
  console.log(`   Transactions processed: ${processed}`);
  console.log(`   USDC transfers found: ${foundUSDC}`);
  console.log(`   From bot to profit: ${foundFromBot}`);
  console.log('');

  if (allUSDCTransfers.length > 0) {
    // Save to file
    fs.writeFileSync('debug_usdc_transfers.json', JSON.stringify(allUSDCTransfers, null, 2));
    console.log(`💾 Saved ${allUSDCTransfers.length} USDC transfers to debug_usdc_transfers.json\n`);

    // Show detailed info
    console.log('📋 All USDC Transfers:\n');
    for (const transfer of allUSDCTransfers) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Signature: ${transfer.signature}`);
      console.log(`Date: ${transfer.date}`);
      console.log(`Amount: ${transfer.tokenAmount / 1e6} USDC`);
      console.log(`From Wallet: ${transfer.fromUserAccount}`);
      console.log(`To Wallet: ${transfer.toUserAccount}`);
      console.log(`From Token Acct: ${transfer.fromTokenAccount}`);
      console.log(`To Token Acct: ${transfer.toTokenAccount}`);
      console.log(`Is From Bot: ${transfer.isFromBot ? '✅ YES' : '❌ NO'}`);
      console.log(`Is To Profit: ${transfer.isToProfit ? '✅ YES' : '❌ NO'}`);
      console.log(`Is Profit Transfer: ${transfer.isProfitTransfer ? '🎯 YES' : '⚠️  NO'}`);
      console.log(`Description: ${transfer.description}`);
      console.log('');
    }
  } else {
    console.log('⚠️  No USDC transfers found in any transactions\n');
    console.log('This could mean:');
    console.log('   - Profits are in a different token');
    console.log('   - USDC transfers are in the trading wallet, not profit wallet');
    console.log('   - Need to check the trading wallet transactions instead\n');
  }
}

debugTransactions();
