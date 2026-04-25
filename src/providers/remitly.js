const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Remitly',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const fromCountry = CURRENCY_COUNTRY_MAP[sendCurrency];
    const toCountry = CURRENCY_COUNTRY_MAP[receiveCurrency];
    if (!fromCountry || !toCountry) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    const countryCode = fromCountry.code.toLowerCase();
    const from = sendCurrency.toLowerCase();
    const to = receiveCurrency.toLowerCase();
    const converterUrl = `https://www.remitly.com/${countryCode}/en/currency-converter/${from}-to-${to}-rate`;

    // Each pair has its own dedicated URL, so navigate every time
    await page.goto(converterUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(1000);

    const html = await page.content();
    const $ = cheerio.load(html);

    // Check for 404 page early
    if ($('h1').text().includes('404') || $('title').text().includes('404') || $('title').text().includes('Not Found')) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    // 1. Get rate from "Special rate" or "Everyday rate" div: "1 USD = 62.03 PHP"
    const rateDiv = $('div').filter((_, el) => {
      const text = $(el).text().trim();
      return (text.includes('Special rate') || text.includes('Everyday rate')) &&
             text.includes(sendCurrency) && text.includes(receiveCurrency);
    }).first().text().trim();

    if (rateDiv) {
      const rateMatch = rateDiv.match(
        new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
      );
      if (rateMatch) {
        const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
        if (exchangeRate > 0) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // 2. Get receive amount from "They receive" or "You receive" section
    const receiveSection = $('div').filter((_, el) => {
      const text = $(el).text().trim();
      return text.includes('They receive') || text.includes('You receive');
    }).first();

    if (receiveSection.length) {
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
