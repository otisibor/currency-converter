const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

module.exports = {
  name: 'Xoom',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const receiveCountry = CURRENCY_COUNTRY_MAP[receiveCurrency];
    if (!receiveCountry) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    const currency = sendCurrency.toLowerCase();
    const url = `https://www.xoom.com/en-us/${currency}/send-money/transfer?countryCode=${receiveCountry.code}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    if (currentUrl.includes('paypal') || currentUrl.includes('login') || currentUrl.includes('signin')) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Get rate from first "1 USD = X PHP" paragraph (primary rate for bank deposit)
    const ratePara = $('p._18ax91o1._18ax91o0').first().text().trim();
    if (ratePara) {
      const rateMatch = ratePara.match(
        new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
      );
      if (rateMatch) {
        const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // 2. Fallback: scan body text with regex
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
