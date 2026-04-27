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
const jsonPath = path.join(outDir, 'rates.json');
const ndjsonPath = path.join(outDir, 'rates.ndjson');

let rates = [];

// PRIMARY: Read from rates.ndjson (line-by-line JSON, most reliable)
if (fs.existsSync(ndjsonPath)) {
  try {
    const content = fs.readFileSync(ndjsonPath, 'utf8').trim();
    if (content) {
      const lines = content.split('\n').filter(line => line.trim());
      rates = lines.map(line => JSON.parse(line));
      console.log(`📁 Read ${rates.length} records from rates.ndjson`);
    }
  } catch (err) {
    console.error(`⚠️ Failed to parse rates.ndjson: ${err.message}`);
  }
}

// FALLBACK: Read from rates.json (object wrapper: { timestamp, count, results })
if (rates.length === 0 && fs.existsSync(jsonPath)) {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (Array.isArray(data) && data.length > 0) {
      rates = data;
      console.log(`📁 Read ${rates.length} records from rates.json (array)`);
    } else if (data && Array.isArray(data.results)) {
      rates = data.results;
      console.log(`📁 Read ${rates.length} records from rates.json (object.results)`);
    } else {
      console.log(`⚠️ rates.json exists but has no usable data`);
    }
  } catch (err) {
    console.error(`⚠️ Failed to parse rates.json: ${err.message}`);
  }
}

if (rates.length === 0) {
  console.error('❌ No rates to insert.');
  process.exit(1);  // Exit with error so bash knows SQL generation failed
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
