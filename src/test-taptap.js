const { chromium } = require('playwright');
const { BROWSER_OPTIONS, CONTEXT_OPTIONS, TIMEOUTS } = require('./config');
const provider = require('./providers/taptap-send');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext(CONTEXT_OPTIONS);
  const page = await ctx.newPage();

  const rate = await provider.fetchRate(page, 'USD', 'PHP', 1000);
  console.log('Rate result:', JSON.stringify(rate, null, 2));

  await browser.close();
})();
