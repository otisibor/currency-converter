const fs = require('fs');
const path = require('path');

function getSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const providerName = process.argv[2];
if (!providerName) {
  console.error('Usage: node scripts/generate-sql.js "Provider Name"');
  process.exit(1);
}

const slug = getSlug(providerName);
const outDir = path.join(process.cwd(), 'output', slug);

// Try rates.json first, fallback to rates.ndjson
const jsonPath = path.join(outDir, 'rates.json');
const ndjsonPath = path.join(outDir, 'rates.ndjson');

let rates = [];

if (fs.existsSync(jsonPath)) {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (Array.isArray(data) && data.length > 0) {
      rates = data;
      console.log(`📁 Read ${rates.length} records from rates.json`);
    } else {
      console.log(`⚠️ rates.json exists but is empty or not an array`);
    }
  } catch (err) {
    console.log(`⚠️ Failed to parse rates.json: ${err.message}`);
  }
}

// Fallback: read from NDJSON (line-by-line JSON)
if (rates.length === 0 && fs.existsSync(ndjsonPath)) {
  try {
    const lines = fs.readFileSync(ndjsonPath, 'utf8')
      .split('\n')
      .filter(line => line.trim());
    rates = lines.map(line => JSON.parse(line));
    console.log(`📁 Read ${rates.length} records from rates.ndjson`);
  } catch (err) {
    console.log(`⚠️ Failed to parse rates.ndjson: ${err.message}`);
  }
}

if (rates.length === 0) {
  console.log('ℹ️ No rates to insert.');
  process.exit(0);
}

const escape = (str) => str ? `'${String(str).replace(/'/g, "''")}'` : 'NULL';

const values = rates.map(r => {
  const fee = r.fee != null ? r.fee : 'NULL';
  const rate = r.exchangeRate != null ? r.exchangeRate : 'NULL';
  const recv = r.receiveAmount != null ? r.receiveAmount : 'NULL';
  const error = r.error ? escape(r.error) : 'NULL';
  
  return `(${escape(r.provider)}, ${escape(r.sendCurrency)}, ${escape(r.receiveCurrency)}, ${r.sendAmount}, ${rate}, ${recv}, ${fee}, ${escape(r.timestamp)}, ${r.success ? 1 : 0}, ${error})`;
});

const sql = `INSERT INTO exchange_rates 
  (provider, send_currency, receive_currency, send_amount, exchange_rate, receive_amount, fee, timestamp, success, error) 
VALUES 
  ${values.join(',\n  ')};
`;

const outPath = path.join(process.cwd(), 'output', 'insert-rates.sql');
fs.writeFileSync(outPath, sql);

console.log(`✅ Generated SQL with ${rates.length} records → ${outPath}`);
