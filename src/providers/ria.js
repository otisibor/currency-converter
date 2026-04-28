const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

let currentPage = null;
let currentSendCurrency = null;

module.exports = {
  name: 'Ria',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    // Navigate only once per provider session
    if (currentPage !== page) {
      const url = 'https://www.riamoneytransfer.com/en-us/rates-conversion/';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await dismissCookieBanner(page);
      await page.locator('#currencyFrom').waitFor({ timeout: 5000 });
      currentPage = page;
      currentSendCurrency = null;
    }

    // Change receive currency (always needed)
    const recvCombobox = page.locator('#currency-selector-currencyTo').first();
    await recvCombobox.waitFor({ timeout: 5000 }).catch(() => {});
    if (await recvCombobox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await recvCombobox.click();
      const option = page.locator('[role="option"]').filter({ hasText: receiveCurrency }).first();
      await option.waitFor({ timeout: 5000 });
      await option.click();
    }

    // Change send currency only if different from current
    if (sendCurrency !== currentSendCurrency) {
      const sendCombobox = page.locator('#currency-selector-currencyFrom').first();
      if (await sendCombobox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendCombobox.click();
        const option = page.locator('[role="option"]').filter({ hasText: sendCurrency }).first();
        await option.waitFor({ timeout: 5000 });
        await option.click();
      }
      currentSendCurrency = sendCurrency;
    }

    // Fill send amount
    const amountInput = page.locator('#currencyFrom').first();
    await amountInput.click({ clickCount: 3 });
    await amountInput.fill(String(sendAmount));

    // Wait for rate to appear
    await page.waitForFunction((cur) => {
      return document.body.innerText.includes(cur);
    }, receiveCurrency, { timeout: 5000 }).catch(() => {});

    // Extract rate from HTML
    const html = await page.content();
    const $ = cheerio.load(html);

    // Priority 1: <p class="result"> — "1.00000 USD = 0.85427 EUR"
    const resultText = $('.result').text().trim();
    if (resultText) {
      const m = resultText.match(
        new RegExp(`[\\d.,]+\\s+${sendCurrency}\\s*=?\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
      );
      if (m) {
        const exchangeRate = parseFloat(m[1].replace(/,/g, ''));
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // Priority 2: #currencyTo input value (receive amount for 1 unit)
    const receiveVal = $('#currencyTo').attr('value');
    if (receiveVal) {
      const rate = parseFloat(receiveVal.replace(/,/g, ''));
      if (rate > 0.001 && rate < 1000000) {
        return { exchangeRate: rate, receiveAmount: rate * sendAmount, fee: null };
      }
    }

    // Fallback: body text regex
    const bodyText = $('body').text();
    const rateMatch = bodyText.match(
      new RegExp(`1[.,]0+\\s+${sendCurrency}\\s*=?\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accept")',
    ];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}
