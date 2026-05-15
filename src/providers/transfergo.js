const { TIMEOUTS } = require('../config');

let currentPage = null;
let currentSendCurrency = null;

module.exports = {
  name: 'TransferGo',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    if (currentPage !== page) {
      const url = 'https://www.transfergo.com/currency-converter';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await page.evaluate(() => {
        const cmp = document.getElementById('cmpwrapper');
        if (cmp) cmp.remove();
        document.querySelectorAll('[class*="overlay"], [class*="cookie"], [class*="consent"]').forEach(el => {
          if (el.offsetParent !== null && el.getBoundingClientRect().width > window.innerWidth * 0.5) {
            el.remove();
          }
        });
      });
      await page.locator('input.currency-converter-calculator__currency-amount').first().waitFor({ timeout: 5000 });
      currentPage = page;
      currentSendCurrency = null;
    }

    // Select receive currency first (always needed)
    await selectCurrency(page, 1, receiveCurrency);
    await page.keyboard.press('Escape');

    // Select send currency only if different from current
    if (sendCurrency !== currentSendCurrency) {
      await selectCurrency(page, 0, sendCurrency);
      currentSendCurrency = sendCurrency;
    }
    await page.keyboard.press('Escape');

    // Fill send amount via JS to trigger React events
    await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input.currency-converter-calculator__currency-amount');
      if (inputs[0]) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(inputs[0], val);
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, String(sendAmount));

    // Wait for receive amount to populate
    await page.waitForFunction(() => {
      const inputs = document.querySelectorAll('input.currency-converter-calculator__currency-amount');
      return inputs.length >= 2 && inputs[1].value && parseFloat(inputs[1].value.replace(/[\s,]/g, '')) > 0;
    }, { timeout: 5000 }).catch(() => {});

    // ✅ CRITICAL FIX: Read ALL visible inputs and find the one with the largest value (receive amount)
    // TransferGo sometimes shows 3 inputs: send, receive, fee. Fee is usually small (< 5).
    const amounts = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input.currency-converter-calculator__currency-amount'));
      return inputs
        .filter(i => i.offsetParent !== null && !i.disabled)
        .map(i => parseFloat(i.value.replace(/[\s,]/g, '')))
        .filter(v => !isNaN(v) && v > 0);
    });

    if (amounts.length >= 2) {
      const sendVal = amounts[0];
      // The receive amount should be the LARGEST value (fee is tiny)
      const recvAmt = Math.max(...amounts.slice(1));
      if (recvAmt > 0 && sendVal > 0 && Math.abs(sendVal - sendAmount) < 1) {
        const exchangeRate = recvAmt / sendVal;
        // Sanity check
        if (exchangeRate > 0.01 && exchangeRate < 50000) {
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
      if (exchangeRate > 0.01 && exchangeRate < 50000) {
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
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      // Wait for listbox to open
      await page.locator('.currency-converter-calculator__currencies-options--open').first().waitFor({ timeout: 3000 });

      const clicked = await page.evaluate((code) => {
        const openListbox = document.querySelector('.currency-converter-calculator__currencies-options--open');
        if (!openListbox) return 'no_open_listbox';
        const options = Array.from(openListbox.querySelectorAll('.currency-converter-calculator__currencies-option'));
        for (let i = 0; i < options.length; i++) {
          if (options[i].textContent.indexOf(code) >= 0) {
            options[i].click();
            return 'clicked';
          }
        }
        return 'not_found';
      }, currencyCode.toUpperCase());

      if (clicked !== 'clicked') {
        // Fallback: native click on filtered option
        await page.locator('.currency-converter-calculator__currencies-option')
          .filter({ hasText: currencyCode })
          .first()
          .click()
          .catch(() => {});
      }
    }
  } catch {}
}
