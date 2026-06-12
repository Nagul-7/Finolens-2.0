/*
 * Populate stocks.instrument_token from the paper data file.
 * In live mode this would instead pull from Kite getInstruments(); for paper
 * mode the synthetic tokens in nse_paper_data.json are the source of truth.
 *
 * Usage: DATABASE_URL=... node scripts/populateInstrumentTokens.cjs
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const file = path.join(__dirname, '..', 'src', 'data', 'nse_paper_data.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const pool = new Pool({ connectionString: dbUrl });

  let updated = 0;
  try {
    for (const [symbol, info] of Object.entries(data.symbols)) {
      const { rowCount } = await pool.query(
        'UPDATE stocks SET instrument_token = $1 WHERE symbol = $2',
        [info.instrument_token, symbol],
      );
      updated += rowCount;
    }
    console.log(`Updated instrument_token for ${updated} stocks`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
