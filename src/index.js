const path = require('path');
const { loadProviderPairs } = require('./csv-parser');
const { scrape } = require('./scraper');
const { writeResults } = require('./output');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    providers: [],
    pair: null,
    headless: true,
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg.startsWith('--provider=')) options.providers.push(arg.split('=')[1]);
    else if (arg.startsWith('--providers=')) options.providers.push(...arg.split('=').slice(1).join('=').split(','));
    else if (arg.startsWith('--pair=')) options.pair = arg.split('=').slice(1).join('=');
    else if (arg === '--headful') options.headless = false;
  }

  return options;
}

function filterProviderPairs(allPairs, options) {
  if (options.all) return allPairs;

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
  return options.providers.length === 1 && !options.all;
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

  if (options.pair) {
    console.log(`Filtering to pair: ${options.pair}`);
  }

  const startTime = Date.now();
  const results = await scrape(providerPairs, {
    headless: options.headless,
    providerFilter: null,
    pairFilter: options.pair,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  console.log(`\nDone in ${elapsed}s`);
  console.log(`Total: ${results.length} | Success: ${successful} | Failed: ${failed}`);

  if (results.length > 0) {
    // Determine output path based on run type
    if (options.all) {
      writeResults(results, null);
      console.log('Results written to output/rates.json and output/rates.csv');
    } else if (isSingleRun(options)) {
      const providerName = Object.keys(providerPairs)[0];
      const slug = getProviderSlug(providerName);
      writeResults(results, path.join('output', slug));
      console.log(`Results written to output/${slug}/rates.json and output/${slug}/rates.csv`);
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
        console.log(`Results written to output/${slug}/rates.json and output/${slug}/rates.csv`);
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
