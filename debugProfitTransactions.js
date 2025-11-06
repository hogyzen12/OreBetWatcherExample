#!/usr/bin/env node

/**
 * Debug script to inspect profit wallet transactions
 * This will help us understand the actual structure of the transactions
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

  console.log('📥 Reading first 50 transactions...\n');

  const signatures = [];
  const rawTransactions = [];

  const fileStream = fs.createReadStream(PROFIT_WALLET_NDJSON);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (line.trim() && count < 50) {
      const tx = JSON.parse(line);
      const signature = extractSignature(tx);
      if (signature) {
        signatures.push(signature);
        rawTransactions.push(tx);
        count++;
      }
    }
    if (count >= 50) break;
  }

  console.log(`Loaded ${signatures.length} transactions\n`);
  console.log('🔄 Parsing with Enhanced API...\n');

  const parsed = await parseTransactionBatch(signatures);

  if (!parsed || !Array.isArray(parsed)) {
    console.error('Failed to parse transactions');
    return;
  }

  console.log(`Parsed ${parsed.length} transactions\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let foundUSDC = 0;
  let foundFromBot = 0;

  for (let i = 0; i < parsed.length; i++) {
    const tx = parsed[i];

    if (!tx || tx.error) {
      console.log(`Transaction ${i + 1}: Parse error`);
      continue;
    }

    console.log(`\n📝 Transaction ${i + 1}:`);
    console.log(`   Signature: ${tx.signature?.substring(0, 20)}...`);
    console.log(`   Type: ${tx.type || 'UNKNOWN'}`);
    console.log(`   Description: ${tx.description || 'N/A'}`);
    console.log(`   Source: ${tx.source || 'N/A'}`);

    // Check for native transfers (SOL)
    if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
      console.log(`   Native Transfers (SOL): ${tx.nativeTransfers.length}`);
      for (const transfer of tx.nativeTransfers) {
        console.log(`      From: ${transfer.fromUserAccount?.substring(0, 20)}...`);
        console.log(`      To: ${transfer.toUserAccount?.substring(0, 20)}...`);
        console.log(`      Amount: ${transfer.amount / 1e9} SOL`);
      }
    }

    // Check for token transfers
    if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
      console.log(`   Token Transfers: ${tx.tokenTransfers.length}`);
      for (const transfer of tx.tokenTransfers) {
        const isUSDC = transfer.mint === USDC_MINT;
        const fromBot = transfer.fromUserAccount === TRADING_BOT_WALLET;
        const toProfit = transfer.toUserAccount === PROFIT_WALLET;

        console.log(`      Token: ${transfer.mint?.substring(0, 20)}... ${isUSDC ? '✅ USDC' : ''}`);
        console.log(`      From: ${transfer.fromUserAccount?.substring(0, 20)}... ${fromBot ? '✅ BOT' : ''}`);
        console.log(`      To: ${transfer.toUserAccount?.substring(0, 20)}... ${toProfit ? '✅ PROFIT' : ''}`);
        console.log(`      Amount: ${transfer.tokenAmount}`);

        if (transfer.fromTokenAccount) {
          console.log(`      From Token Acct: ${transfer.fromTokenAccount?.substring(0, 20)}...`);
        }
        if (transfer.toTokenAccount) {
          console.log(`      To Token Acct: ${transfer.toTokenAccount?.substring(0, 20)}...`);
        }

        if (isUSDC) {
          foundUSDC++;
          console.log(`      ⭐ USDC TRANSFER FOUND!`);

          if (fromBot && toProfit) {
            foundFromBot++;
            console.log(`      🎯 THIS IS A PROFIT TRANSFER!`);
          } else {
            console.log(`      ⚠️  But not from bot to profit wallet`);
            if (!fromBot) console.log(`         From user is: ${transfer.fromUserAccount}`);
            if (!toProfit) console.log(`         To user is: ${transfer.toUserAccount}`);
          }
        }
      }
    } else {
      console.log(`   Token Transfers: None`);
    }

    // Check account data
    if (tx.accountData && tx.accountData.length > 0) {
      console.log(`   Account Data: ${tx.accountData.length} accounts`);
      for (const acct of tx.accountData.slice(0, 3)) {
        console.log(`      ${acct.account?.substring(0, 30)}...`);
        if (acct.nativeBalanceChange) {
          console.log(`        Balance change: ${acct.nativeBalanceChange / 1e9} SOL`);
        }
      }
    }

    console.log('   ─────────────────────────────────────────────────');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Summary:\n');
  console.log(`   Transactions examined: ${parsed.length}`);
  console.log(`   USDC transfers found: ${foundUSDC}`);
  console.log(`   From bot to profit: ${foundFromBot}`);
  console.log('');

  if (foundUSDC === 0) {
    console.log('🔍 Let\'s check the raw transaction data...\n');

    // Check first raw transaction
    const firstRaw = rawTransactions[0];
    console.log('First raw transaction structure:');
    console.log(JSON.stringify(firstRaw, null, 2).substring(0, 2000));
    console.log('\n...(truncated)\n');
  }
}

debugTransactions();
