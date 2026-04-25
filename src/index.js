const path = require('path');
const { loadProviderPairs } = require('./csv-parser');
const { scrape } = require('./scraper');
const { writeResults } = require('./output');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    provider: null,
    pair: null,
    headless: true,
    output: 'rates',
  };

  for (const arg of args) {
    if (arg.startsWith('--provider=')) options.provider = arg.split('=')[1];
    else if (arg.startsWith('--pair=')) options.pair = arg.split('=')[1];
    else if (arg === '--headful') options.headless = false;
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const csvPath = path.join(process.cwd(), 'Provider.csv');

  console.log('Loading Provider.csv...');
  const providerPairs = loadProviderPairs(csvPath);

  const pairCount = Object.values(providerPairs).reduce((sum, p) => sum + p.pairs.length, 0);
  console.log(`Found ${Object.keys(providerPairs).length} providers, ${pairCount} total pairs`);

  if (options.provider) {
    console.log(`Filtering to provider: ${options.provider}`);
  }
  if (options.pair) {
    console.log(`Filtering to pair: ${options.pair}`);
  }

  const startTime = Date.now();
  const results = await scrape(providerPairs, {
    headless: options.headless,
    providerFilter: options.provider,
    pairFilter: options.pair,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  console.log(`\nDone in ${elapsed}s`);
  console.log(`Total: ${results.length} | Success: ${successful} | Failed: ${failed}`);

  if (results.length > 0) {
    writeResults(results);
    console.log(`Results written to output/rates.json and output/rates.csv`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
