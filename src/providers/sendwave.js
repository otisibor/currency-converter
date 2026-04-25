const { TIMEOUTS } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Sendwave',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    await page.goto('https://www.sendwave.com/en/', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(4000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(1000);

    // Fill the send amount input
    await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input[type="decimal"]');
      if (inputs[0]) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inputs[0], val);
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, String(sendAmount));
    await page.waitForTimeout(3000);

    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Get receive amount from the decimal input (second one)
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="decimal"]')).map(i => i.value);
    });

    if (inputs.length >= 2 && inputs[1] && parseFloat(inputs[1]) > 0) {
      const recvAmt = parseFloat(inputs[1]);
      const exchangeRate = recvAmt / sendAmount;
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // 2. Get rate from "Exchange Rate" div: "1 USD = 60.96 PHP"
    const rateText = $('h6[class*="css-"]').first().text().trim();
    if (rateText) {
      const rateMatch = rateText.match(
        new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
      );
      if (rateMatch) {
        const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
        if (exchangeRate > 0) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // 3. Fallback: scan body text with regex
    const bodyText = $('body').text();
    const bodyRateMatch = bodyText.match(
      new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (bodyRateMatch) {
      const exchangeRate = parseFloat(bodyRateMatch[1].replace(/,/g, ''));
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
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  } catch {}
}
