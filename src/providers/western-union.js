const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Western Union',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const fromCountry = CURRENCY_COUNTRY_MAP[sendCurrency];
    const toCountry = CURRENCY_COUNTRY_MAP[receiveCurrency];
    if (!fromCountry || !toCountry) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    const countrySlug = fromCountry.code.toLowerCase();
    const url = `https://www.westernunion.com/${countrySlug}/en/currency-converter.html`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(5000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(1000);

    // Fill the send amount
    try {
      const amountInput = page.locator(`input[id="wu-input-${sendCurrency}"]`).first();
      if (!await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const fallback = page.locator('input[name="wu-input"][inputmode="numeric"]').first();
        if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
          await fallback.click({ clickCount: 3 });
          await fallback.fill(String(sendAmount));
        }
      } else {
        await amountInput.click({ clickCount: 3 });
        await amountInput.fill(String(sendAmount));
      }
      await page.waitForTimeout(1500);
    } catch {}

    // Change receive currency - items have role="presentation", not role="option"
    try {
      const receiveBtn = page.locator('#receiverCurrencyDrop').first();
      if (await receiveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receiveBtn.click();
        await page.waitForTimeout(1500);

        // Use .b-flag-select__item selector with currency code filter
        const currencyOption = page.locator('.b-flag-select__item')
          .filter({ hasText: `${receiveCurrency} –` })
          .first();
        if (await currencyOption.isVisible({ timeout: 5000 }).catch(() => false)) {
          await currencyOption.click({ timeout: 5000 });
          await page.waitForTimeout(3000);
        }
      }
    } catch {}

    await page.waitForTimeout(2000);

    // Get HTML, parse with cheerio
    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Look for .fx-to span (contains "59.9429 PHP")
    const fxTo = $('.fx-to');
    for (let i = 0; i < fxTo.length; i++) {
      const text = $(fxTo[i]).text().trim();
      const match = text.match(new RegExp(`([\\d,]+\\.?\\d*)\\s*${receiveCurrency}`, 'i'));
      if (match) {
        const exchangeRate = parseFloat(match[1].replace(/,/g, ''));
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // 2. Fallback: scan body text
    const bodyText = $('body').text();
    const rateMatch = bodyText.match(
      new RegExp(`1[.,]?0*\\s+${sendCurrency}\\s*[–=:]\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
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
      '#accept-recommended-btn-handler',
      '#onetrust-accept-btn-handler',
      'button:has-text("Allow All")',
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
