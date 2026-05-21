const fs = require('fs');
const path = require('path');

/**
 * Read the last successful + failed results from a provider's output directory.
 * Returns { results, hasOutput } where results is the array of existing entries.
 */
function readProviderResults(outputDir) {
  const ndjsonPath = path.join(outputDir, 'rates.ndjson');
  const jsonPath = path.join(outputDir, 'rates.json');

  if (fs.existsSync(ndjsonPath)) {
    try {
      const content = fs.readFileSync(ndjsonPath, 'utf8').trim();
      if (content) {
        const lines = content.split('\n').filter(line => line.trim());
        return { results: lines.map(line => JSON.parse(line)), hasOutput: true };
      }
    } catch {}
  }

  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (Array.isArray(data)) {
        return { results: data, hasOutput: true };
      }
      if (data && Array.isArray(data.results)) {
        return { results: data.results, hasOutput: true };
      }
    } catch {}
  }

  return { results: [], hasOutput: false };
}

/**
 * Identify failed/rejected/null pairs from existing results.
 * Returns a Set of "SEND-RECV" strings.
 */
function findFailedPairs(results) {
  const failed = new Set();

  for (const r of results) {
    if (!r.success || !r.sendCurrency || !r.receiveCurrency) continue;
    const key = `${r.sendCurrency}-${r.receiveCurrency}`;

    // Explicit failure
    if (!r.success) {
      failed.add(key);
      continue;
    }

    // Null rate
    if (r.exchangeRate == null || r.exchangeRate <= 0) {
      failed.add(key);
      continue;
    }

    // Validation rejection
    const v = r.validation;
    if (v && v.status === 'invalid') {
      failed.add(key);
    }
  }

  return failed;
}

/**
 * Build a providerPairs object suitable for the scraper,
 * containing only the failed pairs from existing output.
 * Returns { providerPairs, failedCounts } where failedCounts maps provider -> count of failed pairs.
 */
function buildRetryPairs(allPairs, outputRoot) {
  const retryPairs = {};
  const failedCounts = {};

  for (const providerName of Object.keys(allPairs)) {
    const slug = providerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const outputDir = path.join(outputRoot, slug);

    const { results, hasOutput } = readProviderResults(outputDir);
    if (!hasOutput) continue;

    const failed = findFailedPairs(results);
    if (failed.size === 0) continue;

    // Filter this provider's pairs to only the failed ones
    const filtered = allPairs[providerName].pairs.filter(
      p => failed.has(`${p.sendCurrency}-${p.receiveCurrency}`)
    );

    if (filtered.length > 0) {
      retryPairs[providerName] = {
        ...allPairs[providerName],
        pairs: filtered,
      };
      failedCounts[providerName] = filtered.length;
    }
  }

  return { retryPairs, failedCounts };
}

/**
 * Merge new results into existing NDJSON/CSV/JSON files.
 * For each entry in newResults, replace the matching existing entry
 * (same provider+sendCurrency+receiveCurrency). Keep all other entries.
 */
function updateResults(newResults, outputDir) {
  if (newResults.length === 0) return;

  const dirPath = outputDir || path.join(process.cwd(), 'output');
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

  const ndjsonPath = path.join(dirPath, 'rates.ndjson');
  const jsonPath = path.join(dirPath, 'rates.json');
  const csvPath = path.join(dirPath, 'rates.csv');

  // Key for matching: provider|sendCurrency|receiveCurrency
  const resultKey = (r) => `${r.provider}|${r.sendCurrency}|${r.receiveCurrency}`;
  const newMap = new Map();
  for (const r of newResults) {
    newMap.set(resultKey(r), r);
  }

  // ── Update NDJSON ──
  if (fs.existsSync(ndjsonPath)) {
    const content = fs.readFileSync(ndjsonPath, 'utf8').trim();
    const existing = content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

    const merged = existing.map(entry => {
      const key = resultKey(entry);
      return newMap.has(key) ? newMap.get(key) : entry;
    });

    // Append any new keys that weren't in existing
    for (const [key, result] of newMap) {
      if (!existing.some(e => resultKey(e) === key)) {
        merged.push(result);
      }
    }

    fs.writeFileSync(ndjsonPath, merged.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  } else {
    // No existing NDJSON, just write new results
    fs.writeFileSync(ndjsonPath, newResults.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  }

  // ── Update CSV ──
  const csvHeaders = ['provider', 'sendCurrency', 'receiveCurrency', 'sendAmount', 'exchangeRate', 'receiveAmount', 'fee', 'timestamp', 'success', 'error', 'validationStatus', 'deviationFromMid', 'boundsMin', 'boundsMax'];

  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    // Skip header, parse existing rows
    const existingRows = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 3) {
        const key = `${cols[0]}|${cols[1]}|${cols[2]}`;
        existingRows[key] = cols;
      }
    }

    // Replace matching rows with new results
    for (const [key, result] of newMap) {
      const row = [
        result.provider,
        result.sendCurrency,
        result.receiveCurrency,
        result.sendAmount,
        result.exchangeRate ?? '',
        result.receiveAmount ?? '',
        result.fee ?? '',
        result.timestamp,
        result.success,
        (result.error || '').replace(/,/g, ';'),
        result.validation?.status ?? '',
        result.validation?.deviationFromMid ?? '',
        result.validation?.boundsMin ?? '',
        result.validation?.boundsMax ?? '',
      ];
      existingRows[key] = row;
    }

    const csvRows = Object.values(existingRows).map(r => r.join(','));
    fs.writeFileSync(csvPath, csvHeaders.join(',') + '\n' + csvRows.join('\n') + '\n', 'utf8');
  }

  // ── Update JSON ──
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let existing;
    if (Array.isArray(data)) {
      existing = data;
    } else if (data && Array.isArray(data.results)) {
      existing = data.results;
    } else {
      existing = [];
    }

    const merged = existing.map(entry => {
      const key = resultKey(entry);
      return newMap.has(key) ? newMap.get(key) : entry;
    });

    for (const [key, result] of newMap) {
      if (!existing.some(e => resultKey(e) === key)) {
        merged.push(result);
      }
    }

    if (Array.isArray(data)) {
      fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), 'utf8');
    } else {
      data.results = merged;
      data.count = merged.length;
      data.timestamp = new Date().toISOString();
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    }
  } else {
    const timestamp = new Date().toISOString();
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ timestamp, count: newResults.length, results: newResults }, null, 2),
      'utf8'
    );
  }
}

module.exports = { readProviderResults, findFailedPairs, buildRetryPairs, updateResults };
