const { TIMEOUTS } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Remitly',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const from = sendCurrency.toLowerCase();
    const to = receiveCurrency.toLowerCase();
    const converterUrl = `https://www.remitly.com/us/en/currency-converter/${from}-to-${to}-rate`;

    await page.goto(converterUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(3000);

    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Get rate from "Special rate" div: "1 USD = 62.03 PHP"
    const specialRate = $('div').filter((_, el) => {
      const text = $(el).text().trim();
      return text.includes('Special rate') && text.includes(sendCurrency) && text.includes(receiveCurrency);
    }).first().text().trim();

    if (specialRate) {
      const rateMatch = specialRate.match(
        new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
      );
      if (rateMatch) {
        const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
        if (exchangeRate > 0) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // 2. Get receive amount from "You receive" or "They receive" section
    const receiveSection = $('div').filter((_, el) => {
      const text = $(el).text().trim();
      return text.includes('They receive') || text.includes('You receive');
    }).first();

    if (receiveSection.length) {
      // The total amount follows "They receive" text
      const text = receiveSection.text();
      const match = text.match(new RegExp(`([\\d.,]+)\\s*${receiveCurrency}`, 'i'));
      if (match) {
        const recvAmt = parseFloat(match[1].replace(/,/g, ''));
        if (recvAmt > 0) {
          const exchangeRate = recvAmt / sendAmount;
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // 3. Fallback: scan body text with regex
    const bodyText = $('body').text();
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
