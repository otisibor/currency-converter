const { TIMEOUTS } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Wise',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const from = sendCurrency.toLowerCase();
    const to = receiveCurrency.toLowerCase();
    const staticUrl = `https://wise.com/gb/currency-converter/${from}-to-${to}-rate?amount=${sendAmount}`;

    await page.goto(staticUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(4000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(1000);

    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Get the exchange rate per unit from the rate-info span
    const rateText = $('span.rate-info').text().trim() || $('div.tw-rate-graph').text().trim();
    const rateMatch = rateText.match(
      new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // 2. Get the actual receive amount from the comparison table
    // td.cc_amount_* contains the receive amount for sendAmount
    const ccAmount = $('td[class*="cc_amount_"]').first().text().trim();
    if (ccAmount) {
      const recvAmt = parseFloat(ccAmount.replace(/,/g, ''));
      if (recvAmt > 0) {
        const exchangeRate = recvAmt / sendAmount;
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // 3. Get the receive amount from the cc comparison hero row
    const ccHeroRow = $('div.cc_comparison-hero-v2__row__amount_3878789923').first().text().trim()
      || $('span.np-text-title-subsection.cc_send-amount_3878789923').first().text().trim();
    if (ccHeroRow) {
      const match = ccHeroRow.match(/([\d.,]+)/);
      if (match) {
        const recvAmt = parseFloat(match[1].replace(/,/g, ''));
        if (recvAmt > 0) {
          const exchangeRate = recvAmt / sendAmount;
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = [
      'button:has-text("Accept")',
      'button:has-text("Got it")',
      '#onetrust-accept-btn-handler',
      '[data-testid="cookie-accept"]',
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
