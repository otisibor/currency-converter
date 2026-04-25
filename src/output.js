const fs = require('fs');
const path = require('path');

const BASE_OUTPUT_DIR = path.join(process.cwd(), 'output');
const ERROR_DIR = path.join(BASE_OUTPUT_DIR, 'errors');

function ensureDirs(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  if (!fs.existsSync(ERROR_DIR)) fs.mkdirSync(ERROR_DIR, { recursive: true });
}

function writeJsonFromNdjson(outputDir = null) {
  const dirPath = outputDir
    ? path.join(process.cwd(), outputDir)
    : BASE_OUTPUT_DIR;

  ensureDirs(dirPath);

  const ndjsonPath = path.join(dirPath, 'rates.ndjson');
  if (!fs.existsSync(ndjsonPath)) return;

  const lines = fs.readFileSync(ndjsonPath, 'utf-8').trim().split('\n');
  const results = lines
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  fs.writeFileSync(
    path.join(dirPath, 'rates.json'),
    JSON.stringify(results, null, 2),
    'utf-8',
  );
}

function writeResults(results, outputDir = null) {
  const dirPath = outputDir
    ? path.join(process.cwd(), outputDir)
    : BASE_OUTPUT_DIR;

  ensureDirs(dirPath);

  const timestamp = new Date().toISOString();

  fs.writeFileSync(
    path.join(dirPath, 'rates.json'),
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
  fs.writeFileSync(path.join(dirPath, 'rates.csv'), csvContent, 'utf-8');
}

function appendResults(results, outputDir = null) {
  const dirPath = outputDir
    ? path.join(process.cwd(), outputDir)
    : BASE_OUTPUT_DIR;

  ensureDirs(dirPath);

  const ndjsonPath = path.join(dirPath, 'rates.ndjson');
  const csvPath = path.join(dirPath, 'rates.csv');

  // Append each result as one JSON line to NDJSON
  const ndjsonLines = results.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(ndjsonPath, ndjsonLines, 'utf-8');

  // CSV: write header if file doesn't exist, then append rows
  const csvHeaders = ['provider', 'sendCurrency', 'receiveCurrency', 'sendAmount', 'exchangeRate', 'receiveAmount', 'fee', 'timestamp', 'success', 'error'];
  const csvRows = results.map(r => [
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
  const csvContent = csvRows.map(r => r.join(',')).join('\n') + '\n';

  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, csvHeaders.join(',') + '\n' + csvContent, 'utf-8');
  } else {
    fs.appendFileSync(csvPath, csvContent, 'utf-8');
  }
}

function saveErrorScreenshot(page, provider, sendCurrency, receiveCurrency) {
  ensureDirs(BASE_OUTPUT_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${provider}_${sendCurrency}_${receiveCurrency}_${timestamp}.png`;
  page.screenshot({ path: path.join(ERROR_DIR, filename) }).catch(() => {});
}

function appendLog(provider, message, outputDir = null) {
  const dirPath = outputDir
    ? path.join(process.cwd(), outputDir)
    : BASE_OUTPUT_DIR;

  ensureDirs(dirPath);

  const slug = typeof provider === 'string'
    ? provider.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : provider;
  const logPath = path.join(dirPath, `${slug}.log`);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf-8');
}

module.exports = { writeResults, appendResults, appendLog, saveErrorScreenshot };
