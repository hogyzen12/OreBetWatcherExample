# Tax Year 2024-25 Transaction Processing & Reporting

Complete workflow for fetching, parsing, and generating tax reports for Solana trading bot activity.

## Overview

This system processes transactions from two wallets:
- **Trading Wallet**: `rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i` (Bot operations)
- **Profit Wallet**: `StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC` (Bot profits)

Tax Year: **April 6, 2024 to April 5, 2025** (UK Tax Year)

## Quick Start

### 🎯 RECOMMENDED: Track Verified Profits Only

The fastest and most accurate way to get your trading profits:

```bash
# 1. Fetch profit wallet transactions
node fetchProfitWalletTransactions.js

# 2. Extract verified USDC profit transfers
node trackTradingProfits.js
```

This gives you a clean report of **verified USDC transfers from trading bot to profit wallet** - the exact profits you need for taxes!

### 📊 Complete Transaction Analysis

For full transaction analysis across all wallets:

```bash
# Set your Helius API key
export HELIUS_API_KEY=your_api_key_here

# Option 1: Generate everything with one command
node generateCompleteTaxReport.js

# Option 2: Step-by-step (see below)
```

## Complete Workflow (Step-by-Step)

### Step 1: Fetch Trading Wallet Transactions

```bash
node fetchTaxYearTransactions.js
```

**What it does:**
- Fetches all transactions for the trading bot wallet
- Covers the full tax year (April 6, 2024 - April 5, 2025)
- Streams data to disk (memory efficient for 171k+ transactions)
- Creates NDJSON file with raw transaction data

**Output:**
- `tax_year_2024-25_transactions.ndjson` (~1.5 GB with 171k transactions)
- `tax_year_2024-25_summary.json` (metadata and stats)

**Smart Features:**
- ✅ Checks if data already exists (won't refetch)
- ✅ Resume capability if interrupted (`--resume`)
- ✅ Force refetch option (`--force`)

### Step 2: Fetch Profit Wallet Transactions

```bash
node fetchProfitWalletTransactions.js
```

**What it does:**
- Fetches all transactions for the profit wallet
- Same date range as trading wallet
- Identifies income transfers

**Output:**
- `tax_year_2024-25_profit_wallet_transactions.ndjson`
- `tax_year_2024-25_profit_wallet_summary.json`

### Step 3: Track Verified Trading Profits (RECOMMENDED) ⭐

```bash
node trackTradingProfits.js
```

**What it does:**
- Identifies USDC transfers from trading bot wallet to profit wallet
- These are **verified, attestable trading profits**
- Most accurate way to track income for tax purposes
- Parses transactions to extract exact USDC amounts

**Output:**
- `tax_year_2024-25_VERIFIED_TRADING_PROFITS.csv` - Clean CSV with profit transfers
- `tax_year_2024-25_profits_summary.json` - Summary statistics

**Example Output:**
```
💰 TRADING PROFIT SUMMARY

📊 Total Verified Profits:
   💵 12,345.67 USDC
   📈 156 profit transfers
   📊 79.14 USDC average per transfer

📅 Monthly Breakdown:
   2024-07: 1,234.56 USDC (12 transfers)
   2024-08: 2,345.67 USDC (18 transfers)
   ...
```

**Why This is Best for Taxes:**
✅ **Attestable** - Each transfer is from the verified trading bot wallet
✅ **Unambiguous** - These are deliberate profit withdrawals, not random transfers
✅ **Clean** - Simple CSV with date, amount, signature, and blockchain proof
✅ **Accurate** - No need to categorize complex trades or swaps

**CSV Format:**
```
Date,USDC Amount,Fee (SOL),Signature,Description,Explorer Link
2024-07-20T10:15:30.000Z,156.789000,0.000005000,5rf...JtP,Trading profit transfer,https://solscan.io/tx/...
```

### Step 4: Generate Complete Tax Report (Alternative)

```bash
node generateCompleteTaxReport.js
```

**What it does:**
- Parses both wallets' transactions using Helius Enhanced API
- Tags and categorizes each transaction for tax purposes
- Generates multiple CSV reports

**Output Files:**

1. **`tax_year_2024-25_COMPLETE_TAX_REPORT.csv`**
   - All transactions with full details
   - Columns: Date, Source Wallet, Signature, Type, Tax Category, Description, Incoming, Outgoing, Fee, Taxable Amount, Notes

2. **`tax_year_2024-25_INCOME_REPORT.csv`**
   - Income transactions only
   - Filters: TRADING_INCOME, INCOMING_TRANSFER
   - Perfect for reporting gross income

3. **`tax_year_2024-25_TRADES_REPORT.csv`**
   - Crypto trades only
   - Filters: SWAP, CRYPTO_TRADE
   - For capital gains calculations

4. **`tax_year_2024-25_all_parsed.ndjson`**
   - Parsed & tagged transactions (NDJSON format)
   - For custom analysis or further processing

## Tax Categories

The system automatically categorizes transactions:

| Category | Description | Tax Implication |
|----------|-------------|-----------------|
| `TRADING_INCOME` | Transfers to profit wallet | **Taxable Income** |
| `CRYPTO_TRADE` | Token swaps | **Taxable Trade** (capital gains) |
| `INCOMING_TRANSFER` | Received SOL/tokens | Potential income |
| `OUTGOING_TRANSFER` | Sent SOL/tokens | Not directly taxable |
| `PROFIT_WITHDRAWAL` | Withdrawals from profit wallet | Already counted as income |
| `NFT_SALE` | NFT sales | Potential capital gains |
| `NFT_MINT` | NFT minting | Creation cost |
| `NEEDS_MANUAL_REVIEW` | Failed to parse | **Requires manual review** |

## Example Output Stats

```
📊 Summary Statistics:

   Total Transactions: 171,390
   Income Transactions: 1,234
   Trade Transactions: 45,678
   Total Income: 123.4567 SOL
   Total Fees: 8.9012 SOL

📋 Category Breakdown:

   CRYPTO_TRADE: 45,678
   INCOMING_TRANSFER: 12,345
   TRADING_INCOME: 1,234
   OUTGOING_TRANSFER: 8,901
   OTHER: 103,232
```

## Command Line Options

### All Scripts Support

```bash
# Check if data exists (won't fetch if already there)
node fetchTaxYearTransactions.js

# Force refetch (delete existing and start fresh)
node fetchTaxYearTransactions.js --force

# Resume interrupted fetch
node fetchTaxYearTransactions.js --resume
```

### Short Flags

```bash
-f  # Force refetch
-r  # Resume
```

## Which Approach Should You Use?

### 🎯 For Simple Income Reporting (RECOMMENDED)

**Use: `trackTradingProfits.js`**

Best if you:
- Only need to report trading income (not capital gains)
- Want a simple, clean report
- Trust that USDC transfers to profit wallet = your profits
- Want blockchain-verified proof of income

**Pros:**
✅ Fast (processes only profit wallet transactions)
✅ Clean output (one line per profit transfer)
✅ Attestable (blockchain proof for each transfer)
✅ Simple for accountant

**Cons:**
❌ Doesn't show individual trades
❌ Doesn't show capital gains/losses
❌ Only tracks USDC (not other tokens)

### 📊 For Complete Tax Analysis

**Use: `generateCompleteTaxReport.js`**

Best if you:
- Need to report capital gains from crypto trades
- Want to see all transaction activity
- Need detailed categorization
- Trade multiple tokens (not just USDC profits)

**Pros:**
✅ Complete transaction history
✅ Identifies swaps and trades
✅ Shows all income sources
✅ Multiple report formats

**Cons:**
❌ Slower (parses 171k+ transactions)
❌ More complex output
❌ May need manual review for some transactions
❌ Higher API costs

## File Structure

```
OreBetWatcherExample/
├── fetchTaxYearTransactions.js          # Fetch trading wallet
├── fetchProfitWalletTransactions.js     # Fetch profit wallet
├── trackTradingProfits.js               # ⭐ Track verified USDC profits
├── generateCompleteTaxReport.js         # Parse & generate complete reports
│
├── tax_year_2024-25_transactions.ndjson              # Raw trading data
├── tax_year_2024-25_profit_wallet_transactions.ndjson # Raw profit data
├── tax_year_2024-25_all_parsed.ndjson                # Parsed & tagged
│
├── tax_year_2024-25_VERIFIED_TRADING_PROFITS.csv     # ⭐ Verified profits only
├── tax_year_2024-25_profits_summary.json             # ⭐ Profit statistics
│
├── tax_year_2024-25_COMPLETE_TAX_REPORT.csv  # All transactions
├── tax_year_2024-25_INCOME_REPORT.csv        # Income only
├── tax_year_2024-25_TRADES_REPORT.csv        # Trades only
│
└── tax_year_2024-25_summary.json              # Metadata
```

## Important Notes

### Helius Enhanced API Limitations

⚠️ **The Helius Enhanced Transactions API has limitations:**
- Only parses NFT, Jupiter, and SPL-related transactions
- **Do not rely on these parsers for all DeFi transactions**
- Some transactions will be marked as `NEEDS_MANUAL_REVIEW`

### Manual Review Required

Check the `NEEDS_MANUAL_REVIEW` category in your reports:

```bash
# Find transactions needing manual review
grep "NEEDS_MANUAL_REVIEW" tax_year_2024-25_COMPLETE_TAX_REPORT.csv
```

### API Costs

- **Fetching**: 100 Helius credits per request
  - ~171k transactions = ~171,500 credits (1,715 pages × 100)
- **Parsing**: 100 credits per batch
  - ~171k transactions = ~171,500 credits (1,715 batches × 100)
- **Total**: ~343,000 credits for complete workflow

### Processing Time

- **Fetch Trading Wallet**: ~15-20 minutes (171k transactions)
- **Fetch Profit Wallet**: Varies (typically 2-10 minutes)
- **Parse & Generate Reports**: ~20-30 minutes

## Tips for Accountants

### Opening CSV Files

The CSV files can be opened in:
- Microsoft Excel
- Google Sheets
- LibreOffice Calc
- Any spreadsheet software

### Key Columns for Tax Filing

**Income Report (`INCOME_REPORT.csv`):**
- `Amount (SOL)` - Total income in SOL
- `Date` - When income was received
- Convert SOL to GBP/USD using exchange rate on transaction date

**Trades Report (`TRADES_REPORT.csv`):**
- `Incoming (SOL)` - What you received
- `Outgoing (SOL)` - What you gave up
- Calculate capital gains based on cost basis

### Exchange Rate Conversion

You'll need to convert SOL to fiat currency (GBP/USD):
1. Find SOL price on transaction date
2. Multiply SOL amount by price
3. Sum all income in fiat currency

Example tools:
- CoinGecko Historical Prices
- CoinMarketCap Historical Data
- Tax-specific crypto tools (CoinTracker, Koinly, etc.)

## Troubleshooting

### "Missing API Key"
```bash
export HELIUS_API_KEY=your_key_here
```

### "File Already Exists"
```bash
# To refetch data
node fetchTaxYearTransactions.js --force

# To continue where you left off
node fetchTaxYearTransactions.js --resume
```

### "Out of Memory"
The scripts use streaming to avoid memory issues, but if you still encounter problems:
- Close other applications
- The scripts should handle 500k+ transactions without issues

### "Incomplete Transaction Set"
If you're missing some transactions:
1. Check the summary files for date ranges
2. Verify tax year dates are correct
3. Re-run with `--force` to refetch

## Advanced Usage

### Custom Date Range

Edit the scripts to change date range:

```javascript
// Change these lines in any fetch script
const TAX_YEAR_START = Math.floor(new Date('2024-04-06T00:00:00Z').getTime() / 1000);
const TAX_YEAR_END = Math.floor(new Date('2025-04-05T23:59:59Z').getTime() / 1000);
```

### Process Specific Signatures

If you need to re-parse specific transactions:

```javascript
// In parseTaxTransactions.js or generateCompleteTaxReport.js
// Modify the batch to include only specific signatures
const signatures = ['your_signature_here'];
```

### Export to Different Formats

The NDJSON files can be converted to other formats:

```bash
# Convert to regular JSON array (first 100 transactions)
head -100 tax_year_2024-25_all_parsed.ndjson | jq -s . > output.json

# Extract specific fields
cat tax_year_2024-25_all_parsed.ndjson | jq '{date, type, taxCategory, taxableAmount}'

# Filter by category
cat tax_year_2024-25_all_parsed.ndjson | jq 'select(.taxCategory == "TRADING_INCOME")'
```

## Support

For issues or questions:
1. Check this README
2. Review console output for error messages
3. Verify API key and network connection
4. Check Helius API status

## License

This is a tax reporting tool. Always verify results with a qualified tax professional.
