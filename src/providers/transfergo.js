const { TIMEOUTS } = require('../config');

module.exports = {
  name: 'TransferGo',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const url = 'https://www.transfergo.com/currency-converter';

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(4000);

    // Remove overlays that intercept clicks
    await page.evaluate(() => {
      const cmp = document.getElementById('cmpwrapper');
      if (cmp) cmp.remove();
      // Also remove any other common overlay elements
      document.querySelectorAll('[class*="overlay"], [class*="cookie"], [class*="consent"]').forEach(el => {
        if (el.offsetParent !== null && el.getBoundingClientRect().width > window.innerWidth * 0.5) {
          el.remove();
        }
      });
    });
    await page.waitForTimeout(1000);

    // Select receive currency FIRST (last button), then send currency (first button)
    await selectCurrency(page, 1, receiveCurrency);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await selectCurrency(page, 0, sendCurrency);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);

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
    await page.waitForTimeout(3000);

    // Read live values via JS (React state, not HTML attributes)
    const amounts = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input.currency-converter-calculator__currency-amount');
      return Array.from(inputs).map(i => i.value.replace(/[\s,]/g, ''));
    });

    if (amounts.length >= 2 && amounts[0] && amounts[1]) {
      const sendVal = parseFloat(amounts[0]);
      const recvAmt = parseFloat(amounts[1]);
      if (recvAmt > 0 && sendVal > 0) {
        const exchangeRate = recvAmt / sendVal;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
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
      if (exchangeRate > 0) {
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
      await page.waitForTimeout(2000);

      // Click the option from the OPEN listbox using native JS click
      // Iterate through all 111 options (no search needed)
      // Use Array.from() + for loop and textContent (e.g. "PHP Philippine Peso")
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

      if (clicked === 'clicked') {
        await page.waitForTimeout(2000);
      }
    }
  } catch {}
}
