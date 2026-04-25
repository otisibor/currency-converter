const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const ERROR_DIR = path.join(OUTPUT_DIR, 'errors');

function ensureDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(ERROR_DIR)) fs.mkdirSync(ERROR_DIR, { recursive: true });
}

function writeResults(results) {
  ensureDirs();

  const timestamp = new Date().toISOString();

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'rates.json'),
    JSON.stringify({ timestamp, count: results.length, results }, null, 2),
    'utf-8',
  );

  const headers = ['provider', 'sendCurrency', 'receiveCurrency', 'sendAmount', 'exchangeRate', 'receiveAmount', 'fee', 'timestamp', 'success', 'error'];
  const rows = results.map(r => [
    r.provider,
    r.sendCurrency,
    r.receiveCurrency,
    r.sendAmount,
    r.exchangeRate ?? '',
    r.receiveAmount ?? '',
    r.fee ?? '',
    r.timestamp,
    r.success,
    (r.error || '').replace(/,/g, ';'),
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'rates.csv'), csvContent, 'utf-8');
}

function saveErrorScreenshot(page, provider, sendCurrency, receiveCurrency) {
  ensureDirs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${provider}_${sendCurrency}_${receiveCurrency}_${timestamp}.png`;
  page.screenshot({ path: path.join(ERROR_DIR, filename) }).catch(() => {});
}

module.exports = { writeResults, saveErrorScreenshot };
