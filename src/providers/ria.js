const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Ria',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const url = 'https://www.riamoneytransfer.com/en-us/rates-conversion/';

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(5000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(2000);

    // Change receive currency by clicking the combobox dropdown
    try {
      const recvCombobox = page.locator('#currency-selector-currencyTo').first();
      if (await recvCombobox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await recvCombobox.click();
        await page.waitForTimeout(1500);

        const option = page.locator('[role="option"]').filter({ hasText: receiveCurrency }).first();
        if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
          await option.click();
          await page.waitForTimeout(2000);
        }
      }
    } catch {}

    // Change send currency if not USD
    if (sendCurrency !== 'USD') {
      try {
        const sendCombobox = page.locator('#currency-selector-currencyFrom').first();
        if (await sendCombobox.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sendCombobox.click();
          await page.waitForTimeout(1500);

          const option = page.locator('[role="option"]').filter({ hasText: sendCurrency }).first();
          if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
            await option.click();
            await page.waitForTimeout(2000);
          }
        }
      } catch {}
    }

    // Fill send amount
    try {
      const amountInput = page.locator('#currencyFrom').first();
      if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await amountInput.click({ clickCount: 3 });
        await amountInput.fill(String(sendAmount));
        await page.waitForTimeout(2000);
      }
    } catch {}

    // Extract from HTML
    const html = await page.content();
    const $ = cheerio.load(html);

    // Extract rate from page text
    const bodyText = $('body').text();
    const rateMatch = bodyText.match(
      new RegExp(`1[.,]?0+\\s+${sendCurrency}\\s*=?\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
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
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  } catch {}
}
