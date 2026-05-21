const { TIMEOUTS } = require('../config');

let currentPage = null;
let currentSendCurrency = null;

function reset() {
  currentPage = null;
  currentSendCurrency = null;
}

module.exports = {
  name: 'TransferGo',
  reset,

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    if (currentPage !== page) {
      const url = 'https://www.transfergo.com/currency-converter';
      await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });

      // Dismiss cookie/consent banners
      await page.evaluate(() => {
        document.querySelectorAll('[class*="cookie"], [class*="consent"], [class*="cmp"], #cmpwrapper')
          .forEach((el) => {
            if (el && el.parentNode) el.remove();
          });
      });

      await page.locator('input.currency-converter-calculator__currency-amount').first().waitFor({ timeout: 10000 });
      currentPage = page;
      currentSendCurrency = null;
    }

    // Select receive currency first (always needed since we may change pairs)
    await selectCurrency(page, 1, receiveCurrency);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Select send currency only if different from current
    if (sendCurrency !== currentSendCurrency) {
      await selectCurrency(page, 0, sendCurrency);
      currentSendCurrency = sendCurrency;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ── CRITICAL FIX: Fill send amount via JS and trigger events ──
    await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input.currency-converter-calculator__currency-amount');
      if (inputs[0]) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(inputs[0], val);
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        inputs[0].dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }
    }, String(sendAmount));

    // Wait for the receive amount to update
    await page.waitForFunction(
      (expectedAmt) => {
        const inputs = document.querySelectorAll('input.currency-converter-calculator__currency-amount');
        if (inputs.length < 2) return false;
        const sendVal = parseFloat(inputs[0].value.replace(/[\s,]/g, ''));
        const recvVal = parseFloat(inputs[1].value.replace(/[\s,]/g, ''));
        // Send value must match AND receive value must be populated
        return Math.abs(sendVal - expectedAmt) < 0.5 && recvVal > 0;
      },
      sendAmount,
      { timeout: 8000 }
    ).catch(() => {});

    // Extra wait for any async calculation
    await page.waitForTimeout(1500);

    // ── CRITICAL FIX: Read all visible inputs, pick the receive amount ──
    // TransferGo shows: send amount (large), receive amount (large), fee (tiny < 5)
    const amounts = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input.currency-converter-calculator__currency-amount'));
      return inputs
        .filter((i) => i.offsetParent !== null && !i.disabled)
        .map((i) => ({
          value: parseFloat(i.value.replace(/[\s,]/g, '')),
          raw: i.value,
        }))
        .filter((v) => !isNaN(v.value) && v.value > 0);
    });

    if (amounts.length >= 2) {
      const sendVal = amounts[0].value;
      // The receive amount is the largest of the remaining values
      // (fee is typically < 5, receive amount is much larger)
      const remaining = amounts.slice(1).map((a) => a.value);
      const recvAmt = Math.max(...remaining);

      if (recvAmt > 0 && sendVal > 0 && Math.abs(sendVal - sendAmount) < 1) {
        const exchangeRate = recvAmt / sendVal;
        // Sanity check: rate should be reasonable
        if (exchangeRate > 0.001 && exchangeRate < 50000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // Fallback: extract rate from page text
    const bodyText = await page.textContent('body');
    const rateMatch = bodyText.match(
      new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 50000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function selectCurrency(page, buttonIndex, currencyCode) {
  try {
    const allBtns = page.locator('.currency-converter-calculator__currency-button');
    const btn = allBtns.nth(buttonIndex);
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click();

      // Wait for listbox to open
      await page
        .locator('.currency-converter-calculator__currencies-options--open')
        .first()
        .waitFor({ timeout: 5000 });

      // Click the matching option via JS for reliability
      const clicked = await page.evaluate((code) => {
        const openListbox = document.querySelector('.currency-converter-calculator__currencies-options--open');
        if (!openListbox) return 'no_open_listbox';
        const options = Array.from(openListbox.querySelectorAll('.currency-converter-calculator__currencies-option'));
        for (let i = 0; i < options.length; i++) {
          if (options[i].textContent.includes(code)) {
            options[i].click();
            return 'clicked';
          }
        }
        return 'not_found';
      }, currencyCode.toUpperCase());

      if (clicked !== 'clicked') {
        // Fallback: Playwright click
        await page
          .locator('.currency-converter-calculator__currencies-option')
          .filter({ hasText: currencyCode })
          .first()
          .click()
          .catch(() => {});
      }

      // Wait for listbox to close and rate to update
      await page.waitForTimeout(1000);
    }
  } catch {}
}
