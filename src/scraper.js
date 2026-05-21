const path = require('path');
const { chromium } = require('playwright');
const { getProvider } = require('./providers');
const { BROWSER_OPTIONS, CONTEXT_OPTIONS, TIMEOUTS, SEND_AMOUNT } = require('./config');
const { saveErrorScreenshot, appendLog } = require('./output');
const { validateRate, attachValidation } = require('./validator');

async function scrape(providerPairs, options = {}) {
  const { headless = true, providerFilter = null, pairFilter = null, onBatch = null, strict = false } = options;

  const browserOptions = { ...BROWSER_OPTIONS, headless };
  const browser = await chromium.launch(browserOptions);

  const results = [];
  let shuttingDown = false;
  let lastBatchSize = 0;

  const shutdown = async () => {
    shuttingDown = true;
    try { await browser.close(); } catch {}
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    const providerNames = Object.keys(providerPairs);
    // Always run MoneyGram last — it's the slowest and most likely to 403/time out
    const moneygramIndex = providerNames.indexOf('MoneyGram');
    if (moneygramIndex !== -1) {
      providerNames.splice(moneygramIndex, 1);
      providerNames.push('MoneyGram');
    }

    for (const providerName of providerNames) {
      if (shuttingDown) break;

      const { name, pairs } = providerPairs[providerName];
      const provider = getProvider(name);

      if (!provider) {
        console.warn(`[WARN] Unknown provider "${name}", skipping`);
        continue;
      }

      if (providerFilter && name !== providerFilter) continue;

      const providerSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      const context = await browser.newContext(CONTEXT_OPTIONS);
      const page = await context.newPage();

      let supportedPairs = null;

      if (typeof provider.discoverSupportedPairs === 'function') {
        try {
          supportedPairs = await provider.discoverSupportedPairs(page);
          if (supportedPairs) {
            const msg = `Discovered ${supportedPairs.size} supported pair(s) from main page`;
            appendLog(name, msg, path.join('output', providerSlug));
            console.log(`[${name}] ${msg}`);
          }
        } catch (err) {
          const msg = `Failed to discover supported pairs: ${err.message}, falling back to all pairs`;
          appendLog(name, msg, path.join('output', providerSlug));
          console.log(`[${name}] ${msg}`);
        }
      }

      try {
        for (let i = 0; i < pairs.length; i++) {
          if (shuttingDown) break;

          const { sendCurrency, receiveCurrency } = pairs[i];

          if (pairFilter) {
            const [pfFrom, pfTo] = pairFilter.toUpperCase().split('/');
            if (sendCurrency !== pfFrom || receiveCurrency !== pfTo) continue;
          }

          if (supportedPairs && !supportedPairs.has(`${sendCurrency}-${receiveCurrency}`)) {
            console.log(`[${name}] ${i + 1}/${pairs.length} ${sendCurrency}→${receiveCurrency}: not found on site (reported)`);
            appendLog(name, `${sendCurrency}→${receiveCurrency}: not found on site (reported by discoverSupportedPairs)`, path.join('output', providerSlug));
            results.push({
              provider: name,
              sendCurrency,
              receiveCurrency,
              sendAmount: SEND_AMOUNT,
              exchangeRate: null,
              receiveAmount: null,
              fee: null,
              timestamp: new Date().toISOString(),
              success: false,
              error: 'unable to acquire',
            });
            if (onBatch && results.length - lastBatchSize >= 10) {
              lastBatchSize = results.length;
              onBatch([...results]);
            }
            continue;
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
          const maxAttempts = typeof provider.maxAttempts === 'number' ? provider.maxAttempts : 2;

          while (attempt < maxAttempts) {
            attempt++;
            try {
              const rate = await provider.fetchRate(page, sendCurrency, receiveCurrency, SEND_AMOUNT);

              if (rate && rate.exchangeRate != null) {
                result.exchangeRate = rate.exchangeRate;
                result.receiveAmount = rate.receiveAmount;
                result.fee = rate.fee;

                const validation = validateRate(result, { strict });
                attachValidation(result, validation);

                if (validation.status === 'valid') {
                  result.success = true;
                  console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: rate=${rate.exchangeRate} [valid]`);
                  break;
                } else if (validation.status === 'suspect' && attempt < maxAttempts) {
                  console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: rate=${rate.exchangeRate} [suspect, retrying]`);
                  attachValidation(result, { ...validation, retryAttempted: true });
                  if (typeof provider.reset === 'function') provider.reset();
                  await page.waitForTimeout(1000);
                } else {
                  result.success = validation.status !== 'invalid';
                  if (!result.success) {
                    result.exchangeRate = null;
                    result.receiveAmount = null;
                    result.error = `rate rejected: ${validation.reason}`;
                    console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: rate=${rate.exchangeRate} [invalid: ${validation.reason}]`);
                  } else {
                    console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: rate=${rate.exchangeRate} [suspect]`);
                  }
                  attachValidation(result, { ...validation, retryAttempted: true, retrySucceeded: false });
                  break;
                }
              } else {
                if (attempt === maxAttempts) {
                  result.error = 'unable to acquire';
                  const detail = `${label}: rate not found on page after ${maxAttempts} attempts`;
                  appendLog(name, detail, path.join('output', providerSlug));
                  console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: no rate found`);
                }
              }
            } catch (err) {
              if (attempt < maxAttempts) {
                const backoff = name === 'MoneyGram' ? 10000 : 5000;
                await page.waitForTimeout(backoff);
              } else {
                result.error = 'unable to acquire';
                const detail = `${label}: ${err.message}`;
                appendLog(name, detail, path.join('output', providerSlug));
                saveErrorScreenshot(page, name, sendCurrency, receiveCurrency);
                console.log(`[${name}] ${pairNum}/${pairs.length} ${label}: ${err.message} [screenshot saved]`);
              }
            }
          }

          results.push(result);

          if (onBatch && results.length - lastBatchSize >= 10) {
            lastBatchSize = results.length;
            onBatch([...results]);
          }

          if (i < pairs.length - 1) {
            await page.waitForTimeout(TIMEOUTS.betweenRequests);
          }
        }
      } catch (err) {
        const msg = `Provider-level error: ${err.message}`;
        appendLog(name, msg, path.join('output', providerSlug));
        console.error(`[${name}] ${msg}`);
      } finally {
        appendLog(name, `Done. ${pairs.length} pairs processed.`, path.join('output', providerSlug));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { scrape };
