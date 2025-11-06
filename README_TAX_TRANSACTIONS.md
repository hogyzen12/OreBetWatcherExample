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
5. ✅ Display a monthly breakdown and summary
6. ✅ Save everything to a timestamped JSON file

## Output

The script will create a file like:
```
tax_year_2024-25_transactions_1699564800000.json
```

### File Structure

```json
{
  "metadata": {
    "address": "rtrAfh7jLW92d5SqsibLQPRFS7DPEs5UraZR7B4Sd5i",
    "taxYear": "2024-25",
    "dateRange": {
      "start": "2024-04-06T00:00:00.000Z",
      "end": "2025-04-05T23:59:59.000Z"
    },
    "totalTransactions": 1234,
    "fetchedAt": "2024-11-06T12:34:56.789Z"
  },
  "transactions": [
    // Array of full transaction objects
  ]
}
```

## Features

- **Chronological Order**: Transactions are fetched oldest-first for easier analysis
- **Full Details**: Each transaction includes complete data (signatures, instructions, metadata)
- **Success Only**: Filters out failed transactions
- **Progress Tracking**: Shows real-time progress as it fetches
- **Monthly Summary**: Displays transaction count by month

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
