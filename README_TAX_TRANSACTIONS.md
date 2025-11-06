# Tax Year Trading Transactions Fetcher

This script fetches all trading transactions for your Solana address during the UK tax year 2024-25 (April 6, 2024 to April 5, 2025) using the Helius API.

## Prerequisites

- Node.js (v18 or higher)
- A Helius API key (Developer plan or higher)

## Getting Your Helius API Key

1. Go to [Helius Dashboard](https://dashboard.helius.dev/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key (requires Developer plan or higher)

## Usage

### 1. Set your API key as an environment variable

```bash
export HELIUS_API_KEY=your_api_key_here
```

### 2. Run the script

```bash
node fetchTaxYearTransactions.js
```

## What It Does

The script will:

1. ✅ Fetch all **successful** transactions for address `rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i`
2. ✅ Filter transactions between April 6, 2024 and April 5, 2025
3. ✅ Retrieve complete transaction details with full metadata
4. ✅ Handle pagination automatically (fetches all pages)
5. ✅ **Stream data to disk incrementally** (memory efficient for 100k+ transactions)
6. ✅ Display a monthly breakdown and summary
7. ✅ Save transactions as NDJSON + summary as JSON

## Output

The script creates **two files**:

### 1. Transaction Data (NDJSON format)
```
tax_year_2024-25_transactions_1699564800000.ndjson
```

This is a **newline-delimited JSON** file where each line is a complete transaction object. This format:
- ✅ Works with datasets of any size (tested with 170k+ transactions)
- ✅ Can be processed line-by-line without loading entire file into memory
- ✅ Easy to process with standard tools like `jq`, `grep`, `awk`

Example (each line is one transaction):
```
{"slot":12345,"transaction":{...},"blockTime":1234567890}
{"slot":12346,"transaction":{...},"blockTime":1234567891}
{"slot":12347,"transaction":{...},"blockTime":1234567892}
```

### 2. Summary File (JSON format)
```
tax_year_2024-25_summary_1699564800000.json
```

Contains metadata and statistics:
```json
{
  "metadata": {
    "address": "rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i",
    "taxYear": "2024-25",
    "totalTransactions": 171390,
    "dataFile": "tax_year_2024-25_transactions_1699564800000.ndjson",
    "dataFormat": "ndjson (newline-delimited JSON - one transaction per line)"
  },
  "monthlyBreakdown": {
    "2024-07": 976,
    "2024-08": 1578,
    ...
  }
}
```

### Working with NDJSON Files

```bash
# Count total transactions
wc -l tax_year_2024-25_transactions_*.ndjson

# View first transaction (pretty-printed)
head -1 tax_year_2024-25_transactions_*.ndjson | jq .

# View last transaction
tail -1 tax_year_2024-25_transactions_*.ndjson | jq .

# Search for specific signature
grep "YOUR_SIGNATURE_HERE" tax_year_2024-25_transactions_*.ndjson | jq .

# Convert first 10 transactions to regular JSON array
head -10 tax_year_2024-25_transactions_*.ndjson | jq -s .

# Extract all signatures
cat tax_year_2024-25_transactions_*.ndjson | jq -r '.transaction.signatures[0]'

# Filter by date range
cat tax_year_2024-25_transactions_*.ndjson | \
  jq 'select(.blockTime >= 1704067200 and .blockTime <= 1706745599)'
```

## Features

- **Memory Efficient**: Streams data to disk incrementally - handles 100k+ transactions without issues
- **Chronological Order**: Transactions are fetched oldest-first for easier analysis
- **Full Details**: Each transaction includes complete data (signatures, instructions, metadata)
- **Success Only**: Filters out failed transactions
- **Progress Tracking**: Shows real-time progress as it fetches
- **Monthly Summary**: Displays transaction count by month
- **NDJSON Format**: Easy to process with standard Unix tools and streaming processors

## Cost

Each request costs 100 Helius credits. With pagination:
- Up to 100 transactions = 100 credits
- 500 transactions ≈ 500 credits (5 pages × 100)
- 1000 transactions ≈ 1000 credits (10 pages × 100)

## Configuration

You can modify these values in the script:

```javascript
// Change the address
const TRADING_ADDRESS = 'your_address_here';

// Adjust date range
const TAX_YEAR_START = Math.floor(new Date('2024-04-06T00:00:00Z').getTime() / 1000);
const TAX_YEAR_END = Math.floor(new Date('2025-04-05T23:59:59Z').getTime() / 1000);

// Change fetch limit per page (max 100 for full details)
limit: 100

// Include failed transactions
status: 'any' // instead of 'succeeded'
```

## Troubleshooting

### "Please set your HELIUS_API_KEY"
Set the environment variable before running:
```bash
export HELIUS_API_KEY=your_key
node fetchTaxYearTransactions.js
```

### Rate Limiting
The script includes a 500ms delay between pages to avoid rate limits. If you still hit limits, increase the delay in the code.

### No Transactions Found
This could mean:
- The address had no activity during the tax year
- The API key doesn't have access to the endpoint (requires Developer plan)
- The date range is incorrect

### Out of Memory Errors
The script uses streaming writes to avoid memory issues. However, if you still encounter problems:
- The script should handle even 500k+ transactions without issues
- Check available disk space (large datasets can be several GB)
- Try reducing the API delay between requests (line 133 in the script)

## Next Steps

After fetching transactions, you can:

1. **Analyze trades** - Parse the transaction instructions to identify buy/sell operations
2. **Calculate gains/losses** - Track token price changes between transactions
3. **Generate reports** - Create CSV exports for tax software
4. **Audit activity** - Review all trading activity chronologically

## Additional Resources

- [Helius Documentation](https://docs.helius.dev/)
- [Solana Explorer](https://explorer.solana.com/)
- [UK Tax Year Information](https://www.gov.uk/self-assessment-tax-returns/deadlines)
