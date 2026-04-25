const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

const COUNTRY_MAP = {
  AUD: { source: 'aus', dest: { CNY: 'china', TWD: 'taiwan', THB: 'thailand', HKD: 'hongkong', JPY: 'japan', INR: 'india', MYR: 'malaysia', PHP: 'philippines', SGD: 'singapore', VND: 'vietnam' } },
  CAD: { source: 'can', dest: { CNY: 'china', INR: 'india', PHP: 'philippines', SGD: 'singapore', VND: 'vietnam', MYR: 'malaysia' } },
  EUR: { source: 'fra', dest: { CNY: 'china', PHP: 'philippines', INR: 'india', JPY: 'japan', VND: 'vietnam' } },
  GBP: { source: 'gbr', dest: { CNY: 'china', PHP: 'philippines', INR: 'india', JPY: 'japan', PKR: 'pakistan' } },
  NZD: { source: 'nzl', dest: { CNY: 'china', PHP: 'philippines' } },
  SGD: { source: 'sgp', dest: { CNY: 'china', PHP: 'philippines', INR: 'india' } },
  USD: { source: 'usa', dest: { CNY: 'china', PHP: 'philippines', TWD: 'taiwan', HKD: 'hongkong', JPY: 'japan', INR: 'india', THB: 'thailand', VND: 'vietnam', SGD: 'singapore', MYR: 'malaysia' } },
};

module.exports = {
  name: 'Panda Remit',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const pair = COUNTRY_MAP[sendCurrency];
    if (!pair || !pair.dest[receiveCurrency]) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    const url = `https://www.pandaremit.com/en/${pair.source}/${pair.dest[receiveCurrency]}/${sendCurrency.toLowerCase()}-${receiveCurrency.toLowerCase()}-converter?amount=${sendAmount}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(5000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $ = cheerio.load(html);
    const bodyText = $('body').text();

    // Look for "1,000 USD = 61411.40 PHP" pattern
    const rateMatch = bodyText.match(
      new RegExp(`${sendAmount.toLocaleString()}\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const recvAmt = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (recvAmt > 0) {
        const exchangeRate = recvAmt / sendAmount;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // Fallback: look for "100 USD 61.4114" pattern in amount table
    const fallbackMatch = bodyText.match(
      new RegExp(`100\\s+${sendCurrency}\\s*([\\d.]+)\\s*${receiveCurrency}`, 'i')
    );
    if (fallbackMatch) {
      const exchangeRate = parseFloat(fallbackMatch[1].replace(/,/g, ''));
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
