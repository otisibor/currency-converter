const fs = require('fs');
const path = require('path');
const { loadProviderPairs } = require('./csv-parser');
const { scrape } = require('./scraper');
const { writeResults, writeJsonFromNdjson, appendResults } = require('./output');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    fast: false,
    slow: false,
    providers: [],
    pair: null,
    headless: true,
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg === '--fast') options.fast = true;
    else if (arg === '--slow') options.slow = true;
    else if (arg.startsWith('--provider=')) options.providers.push(arg.split('=')[1]);
    else if (arg.startsWith('--providers=')) options.providers.push(...arg.split('=').slice(1).join('=').split(','));
    else if (arg.startsWith('--pair=')) options.pair = arg.split('=').slice(1).join('=');
    else if (arg === '--headful') options.headless = false;
  }

  return options;
}

function filterProviderPairs(allPairs, options) {
  if (options.all) return allPairs;

  if (options.fast) {
    const SLOW_PROVIDERS = ['Western Union', 'MoneyGram'];
    const filtered = {};
    for (const [name, data] of Object.entries(allPairs)) {
      if (!SLOW_PROVIDERS.includes(name)) filtered[name] = data;
    }
    return filtered;
  }

  if (options.slow) {
    const SLOW_PROVIDERS = ['Western Union', 'MoneyGram'];
    const filtered = {};
    for (const name of SLOW_PROVIDERS) {
      if (allPairs[name]) filtered[name] = allPairs[name];
    }
    return filtered;
  }

  if (options.providers.length > 0) {
    const filtered = {};
    for (const providerName of options.providers) {
      // Try exact match first, then case-insensitive, then partial match
      if (allPairs[providerName]) {
        filtered[providerName] = allPairs[providerName];
      } else {
        const match = Object.keys(allPairs).find(
          k => k.toLowerCase() === providerName.toLowerCase() ||
               k.toLowerCase().includes(providerName.toLowerCase())
        );
        if (match) {
          filtered[match] = allPairs[match];
        } else {
          console.warn(`[WARN] Unknown provider "${providerName}", skipping`);
        }
      }
    }
    return filtered;
  }

  return allPairs;
}

function isSingleRun(options) {
  return options.providers.length === 1 && !options.all && !options.fast && !options.slow;
}

function isMultiRootRun(options) {
  return options.all || options.fast || options.slow;
}

function getProviderSlug(providerName) {
  return providerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function main() {
  const options = parseArgs();
  const csvPath = path.join(process.cwd(), 'Provider.csv');

  console.log('Loading Provider.csv...');
  const allPairs = loadProviderPairs(csvPath);

  const providerPairs = filterProviderPairs(allPairs, options);
  const pairCount = Object.values(providerPairs).reduce((sum, p) => sum + p.pairs.length, 0);
  console.log(`Running ${Object.keys(providerPairs).length} provider(s), ${pairCount} total pairs`);

  // Clean old output files before starting
  const outputDirs = [];
  if (isMultiRootRun(options)) {
    outputDirs.push(path.join(process.cwd(), 'output'));
  } else if (isSingleRun(options)) {
    const slug = getProviderSlug(Object.keys(providerPairs)[0]);
    outputDirs.push(path.join(process.cwd(), 'output', slug));
  } else {
    for (const providerName of Object.keys(providerPairs)) {
      const slug = getProviderSlug(providerName);
      outputDirs.push(path.join(process.cwd(), 'output', slug));
    }
  }
  for (const dir of outputDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const ext of ['rates.ndjson', 'rates.csv']) {
      const fp = path.join(dir, ext);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        console.log(`Cleaned ${fp}`);
      }
    }
    // Also clean old provider log files
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.log'))) {
      const fp = path.join(dir, file);
      fs.unlinkSync(fp);
      console.log(`Cleaned ${fp}`);
    }
  }

  if (options.pair) {
    console.log(`Filtering to pair: ${options.pair}`);
  }

  const startTime = Date.now();
  let totalCount = 0;
  const results = await scrape(providerPairs, {
    headless: options.headless,
    providerFilter: null,
    pairFilter: options.pair,
    onBatch: (currentResults) => {
      // currentResults is the full accumulated list from scraper; only append new ones
      const newCount = currentResults.length - totalCount;
      if (newCount <= 0) return;
      const newResults = currentResults.slice(totalCount);
      totalCount = currentResults.length;

      if (isMultiRootRun(options)) {
        appendResults(newResults, null);
        console.log(`[batch] +${newResults.length} results (total ${totalCount}) → output/rates.ndjson, output/rates.csv`);
      } else if (isSingleRun(options)) {
        const providerName = Object.keys(providerPairs)[0];
        const slug = getProviderSlug(providerName);
        appendResults(newResults, path.join('output', slug));
        console.log(`[batch] ${providerName}: +${newResults.length} (total ${totalCount}) → output/${slug}/rates.ndjson, output/${slug}/rates.csv`);
      } else {
        // Multiple providers: append each provider's new results to its own dir
        const grouped = {};
        for (const r of newResults) {
          if (!grouped[r.provider]) grouped[r.provider] = [];
          grouped[r.provider].push(r);
        }
        for (const [providerName, providerResults] of Object.entries(grouped)) {
          const slug = getProviderSlug(providerName);
          appendResults(providerResults, path.join('output', slug));
        }
        const paths = Object.keys(grouped).map(p => `output/${getProviderSlug(p)}/rates.ndjson`).join(', ');
        console.log(`[batch] +${newResults.length} results (total ${totalCount}) → ${paths}`);
      }
    },
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  console.log(`\nDone in ${elapsed}s`);
  console.log(`Total: ${results.length} | Success: ${successful} | Failed: ${failed}`);

  if (results.length > 0) {
    // Determine output path based on run type
    if (options.all) {
      writeJsonFromNdjson(null);
      console.log(`\nOutput:`);
      console.log(`  output/rates.ndjson  (incremental results)`);
      console.log(`  output/rates.json    (final summary)`);
      console.log(`  output/rates.csv     (flat file)`);
      console.log(`  output/<provider>.log  (per-provider diagnostics)`);
      console.log(`  output/errors/       (failure screenshots)`);
    } else if (isSingleRun(options)) {
      const providerName = Object.keys(providerPairs)[0];
      const slug = getProviderSlug(providerName);
      writeResults(results, path.join('output', slug));
      console.log(`\nOutput:`);
      console.log(`  output/${slug}/rates.ndjson  (incremental results)`);
      console.log(`  output/${slug}/rates.json    (final summary)`);
      console.log(`  output/${slug}/rates.csv     (flat file)`);
      console.log(`  output/${slug}/${slug}.log     (provider diagnostics)`);
      console.log(`  output/errors/               (failure screenshots)`);
    } else {
      // Multiple but not all: split by provider
      const grouped = {};
      for (const r of results) {
        if (!grouped[r.provider]) grouped[r.provider] = [];
        grouped[r.provider].push(r);
      }
      for (const [providerName, providerResults] of Object.entries(grouped)) {
        const slug = getProviderSlug(providerName);
        writeResults(providerResults, path.join('output', slug));
      }
      console.log(`\nOutput:`);
      for (const [providerName] of Object.entries(grouped)) {
        const slug = getProviderSlug(providerName);
        console.log(`  output/${slug}/`);
      }
      console.log(`  output/errors/  (failure screenshots)`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
