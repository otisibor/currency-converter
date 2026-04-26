const fs = require('fs');
const path = require('path');

const ratesPath = path.join(process.cwd(), 'output', 'rates.json');

if (!fs.existsSync(ratesPath)) {
  console.error('❌ output/rates.json not found. Did the scraper run?');
  process.exit(1);
}

const rates = JSON.parse(fs.readFileSync(ratesPath, 'utf8'));

if (!rates.length) {
  console.log('ℹ️ No rates to insert.');
  process.exit(0);
}

const escape = (str) => str ? `'${String(str).replace(/'/g, "''")}'` : 'NULL';

const values = rates.map(r => {
  const fee = r.fee !== null && r.fee !== undefined ? r.fee : 'NULL';
  const rate = r.exchangeRate !== null && r.exchangeRate !== undefined ? r.exchangeRate : 'NULL';
  const recv = r.receiveAmount !== null && r.receiveAmount !== undefined ? r.receiveAmount : 'NULL';
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
