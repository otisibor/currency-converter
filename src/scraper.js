const { chromium } = require('playwright');
const { getProvider } = require('./providers');
const { BROWSER_OPTIONS, CONTEXT_OPTIONS, TIMEOUTS, SEND_AMOUNT } = require('./config');
const { saveErrorScreenshot } = require('./output');

async function scrape(providerPairs, options = {}) {
  const { headless = true, providerFilter = null, pairFilter = null } = options;

  const browserOptions = { ...BROWSER_OPTIONS, headless };
  const browser = await chromium.launch(browserOptions);

  const results = [];
  let shuttingDown = false;

  const shutdown = async () => {
    shuttingDown = true;
    try { await browser.close(); } catch {}
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    const providerNames = Object.keys(providerPairs);

    for (const providerName of providerNames) {
      if (shuttingDown) break;

      const { name, pairs } = providerPairs[providerName];
      const provider = getProvider(name);

      if (!provider) {
        console.warn(`[WARN] Unknown provider "${name}", skipping`);
        continue;
      }

      if (providerFilter && name !== providerFilter) continue;

      const context = await browser.newContext(CONTEXT_OPTIONS);
      const page = await context.newPage();

      try {
        for (let i = 0; i < pairs.length; i++) {
          if (shuttingDown) break;

          const { sendCurrency, receiveCurrency } = pairs[i];

          if (pairFilter) {
            const [pfFrom, pfTo] = pairFilter.toUpperCase().split('/');
            if (sendCurrency !== pfFrom || receiveCurrency !== pfTo) continue;
          }

          const label = `${sendCurrency}→${receiveCurrency}`;
          const pairNum = i + 1;

          let result = {
            provider: name,
            sendCurrency,
            receiveCurrency,
            sendAmount: SEND_AMOUNT,
            exchangeRate: null,
            receiveAmount: null,
            fee: null,
            timestamp: new Date().toISOString(),
            success: false,
            error: null,
          };

          let attempt = 0;
          const maxAttempts = 2;

          while (attempt < maxAttempts) {
            attempt++;
            try {
              const rate = await provider.fetchRate(page, sendCurrency, receiveCurrency, SEND_AMOUNT);

              if (rate && rate.exchangeRate != null) {
                result.exchangeRate = rate.exchangeRate;
                result.receiveAmount = rate.receiveAmount;
                result.fee = rate.fee;
                result.success = true;
                console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: rate=${rate.exchangeRate}`);
                break;
              } else {
                if (attempt === maxAttempts) {
                  result.error = 'Rate not found on page';
                  console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: no rate found`);
                }
              }
            } catch (err) {
              if (attempt < maxAttempts) {
                await page.waitForTimeout(5000);
              } else {
                result.error = err.message;
                saveErrorScreenshot(page, name, sendCurrency, receiveCurrency);
                console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: ${err.message} [screenshot saved]`);
              }
            }
          }

          results.push(result);

          if (i < pairs.length - 1) {
            await page.waitForTimeout(TIMEOUTS.betweenRequests);
          }
        }
      } catch (err) {
        console.error(`[${name}] Provider-level error: ${err.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { scrape };
