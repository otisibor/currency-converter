const { TIMEOUTS } = require('../config');

let currentPage = null;
let currentOriginCurrency = null;

module.exports = {
  name: 'Taptap Send',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    if (currentPage !== page) {
      await page.goto('https://www.taptapsend.com/', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await dismissCookieBanner(page);
      await page.locator('#origin-amount').waitFor({ timeout: 5000 });
      currentPage = page;
      currentOriginCurrency = null;
    }

    // ── Change origin currency ──
    if (sendCurrency !== currentOriginCurrency) {
      await selectCurrency(page, '#origin-currency', sendCurrency);

      // ✅ CRITICAL FIX: Generic wait for any network activity OR DOM mutation
      // The API endpoint name is unknown, so wait for any XHR/fetch to settle
      await Promise.race([
        page.waitForResponse(() => true, { timeout: 4000 }),
        page.waitForFunction(() => {
          const dest = document.getElementById('destination-amount');
          return dest && dest.value === '';
        }, { timeout: 2000 }),
        page.waitForTimeout(2500)
      ]);

      currentOriginCurrency = sendCurrency;
    }

    // ── Change destination currency ──
    await selectCurrency(page, '#destination-currency', receiveCurrency);
    await page.waitForTimeout(1500);

    // ── Fill amount ──
    await page.evaluate((val) => {
      const input = document.getElementById('origin-amount');
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, String(sendAmount));

    // Wait for destination amount to populate
    await page.waitForFunction(() => {
      const dest = document.getElementById('destination-amount');
      return dest && dest.value && parseFloat(dest.value.replace(/,/g, '')) > 0;
    }, { timeout: 5000 }).catch(() => {});

    // Read live values
    const amounts = await page.evaluate(() => {
      const origin = document.getElementById('origin-amount');
      const dest = document.getElementById('destination-amount');
      return {
        origin: origin?.value,
        dest: dest?.value,
      };
    });

    if (amounts.dest && parseFloat(amounts.dest) > 0) {
      const recvAmt = parseFloat(amounts.dest.replace(/,/g, ''));
      const exchangeRate = recvAmt / sendAmount;
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // Fallback: read rate from #fxRateText
    const rateText = await page.locator('#fxRateText').textContent().catch(() => '');
    const rateMatch = rateText.match(
      new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
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
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}

async function selectCurrency(page, selectId, currencyCode) {
  try {
    const optionValue = await page.evaluate(({ id, code }) => {
      const sel = document.querySelector(id);
      if (!sel) return null;
      const opts = Array.from(sel.options);
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].text.includes(code)) {
          return opts[i].value;
        }
      }
      return null;
    }, { id: selectId, code: currencyCode });

    if (optionValue !== null) {
      await page.selectOption(selectId, optionValue);
    }
  } catch {}
}
