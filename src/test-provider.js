const { chromium } = require('playwright');
const { getProvider } = require('./providers');
const { BROWSER_OPTIONS, CONTEXT_OPTIONS, SEND_AMOUNT } = require('./config');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node src/test-provider.js <ProviderName> <FROM> <TO>');
    console.log('Example: node src/test-provider.js Wise USD NGN');
    process.exit(1);
  }

  const [name, sendCurrency, receiveCurrency] = args;
  const amount = parseInt(args[3]) || SEND_AMOUNT;

  const provider = getProvider(name);
  if (!provider) {
    console.error(`Unknown provider: ${name}`);
    console.error(`Available: ${Object.keys(require('./providers').PROVIDERS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Testing: ${provider.name} ${sendCurrency}→${receiveCurrency} (amount: ${amount})`);

  const browser = await chromium.launch({ ...BROWSER_OPTIONS });
  const context = await browser.newContext(CONTEXT_OPTIONS);
  const page = await context.newPage();

  try {
    const rate = await provider.fetchRate(page, sendCurrency, receiveCurrency, amount);
    console.log('\nResult:', JSON.stringify(rate, null, 2));
  } catch (err) {
    console.error(`\nError: ${err.message}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
