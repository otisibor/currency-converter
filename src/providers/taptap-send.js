const { TIMEOUTS } = require('../config');

let currentPage = null;
let currentOriginCurrency = null;

function reset() {
  currentPage = null;
  currentOriginCurrency = null;
}

module.exports = {
  name: 'Taptap Send',
  reset,

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    if (currentPage !== page) {
      await page.goto('https://www.taptapsend.com/', {
        waitUntil: 'networkidle',
        timeout: TIMEOUTS.navigation,
      });
      await dismissCookieBanner(page);
      await page.locator('#origin-amount').waitFor({ timeout: 10000 });
      currentPage = page;
      currentOriginCurrency = null;
    }

    // ── Change origin currency ──
    if (sendCurrency !== currentOriginCurrency) {
      await selectCurrency(page, '#origin-currency', sendCurrency);

      // ── CRITICAL FIX: Wait for rate API response using generic approach ──
      // The API endpoint name varies, so we wait for ANY network response
      // that happens after currency change, OR a DOM mutation
      try {
        await Promise.race([
          page.waitForResponse(() => true, { timeout: 5000 }),
          page.waitForFunction(
            () => {
              const dest = document.getElementById('destination-amount');
              // Destination cleared or updated means a new rate is being fetched
              return dest && (dest.value === '' || dest.dataset.updating);
            },
            { timeout: 3000 }
          ),
        ]);
      } catch {}

      // Always wait a bit for the async rate calculation to complete
      await page.waitForFunction(
        () => {
          const dest = document.getElementById('destination-amount');
          return dest && dest.value && parseFloat(dest.value.replace(/,/g, '')) > 0;
        },
        { timeout: 6000 }
      ).catch(() => {});

      // Extra safety wait
      await page.waitForTimeout(1000);
      currentOriginCurrency = sendCurrency;
    }

    // ── Change destination currency ──
    await selectCurrency(page, '#destination-currency', receiveCurrency);

    // Wait for destination to update after currency change
    try {
      await Promise.race([
        page.waitForResponse(() => true, { timeout: 5000 }),
        page.waitForTimeout(2000),
      ]);
    } catch {}

    await page.waitForTimeout(1000);

    // ── Fill amount ──
    await page.evaluate((val) => {
      const input = document.getElementById('origin-amount');
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, String(sendAmount));

    // Wait for destination amount to update
    await page.waitForFunction(
      () => {
        const dest = document.getElementById('destination-amount');
        return dest && dest.value && parseFloat(dest.value.replace(/,/g, '')) > 0;
      },
      { timeout: 8000 }
    ).catch(() => {});

    // Extra safety wait for React to settle
    await page.waitForTimeout(1500);

    // Read live values from DOM
    const amounts = await page.evaluate(() => {
      const origin = document.getElementById('origin-amount');
      const dest = document.getElementById('destination-amount');
      return {
        origin: origin?.value ? parseFloat(origin.value.replace(/,/g, '')) : null,
        dest: dest?.value ? parseFloat(dest.value.replace(/,/g, '')) : null,
        originRaw: origin?.value,
        destRaw: dest?.value,
      };
    });

    // Validate: the origin field must show our entered amount (not stale value)
    if (amounts.dest && amounts.dest > 0 && amounts.origin && amounts.origin > 0) {
      // Verify the origin field actually contains our sendAmount (within tolerance)
      if (Math.abs(amounts.origin - sendAmount) < 1) {
        const exchangeRate = amounts.dest / amounts.origin;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // Fallback: read rate from #fxRateText (e.g. "Today's rate: USD 1 = 17.100 MXN")
    const rateText = await page.locator('#fxRateText').textContent().catch(() => '');
    const rateMatch = rateText.match(
      new RegExp(`1\\s*${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // Fallback 2: extract from body text
    const bodyText = await page.evaluate(() => document.body.innerText);
    const bodyMatch = bodyText.match(
      new RegExp(`1\\s*${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (bodyMatch) {
      const exchangeRate = parseFloat(bodyMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = ['#onetrust-accept-btn-handler', 'button:has-text("Accept")'];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}

async function selectCurrency(page, selectId, currencyCode) {
  try {
    const optionValue = await page.evaluate(
      ({ id, code }) => {
        const sel = document.querySelector(id);
        if (!sel) return null;
        const opts = Array.from(sel.options);
        for (let i = 0; i < opts.length; i++) {
          // Match by currency code in parentheses, e.g. "France (EUR)"
          if (opts[i].text.includes(`(${code})`) || opts[i].value.toUpperCase() === code) {
            return opts[i].value;
          }
        }
        return null;
      },
      { id: selectId, code: currencyCode }
    );

    if (optionValue !== null) {
      await page.selectOption(selectId, optionValue);
    }
  } catch {}
}
