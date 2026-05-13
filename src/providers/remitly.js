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

    await page.goto(converterUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(1500);

    const html = await page.content();
    const $ = cheerio.load(html);

    // Check for 404 page early
    if ($('h1').text().includes('404') || $('title').text().includes('404') || $('title').text().includes('Not Found')) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    let exchangeRate = null;

    // ── Method 1: Dedicated rate div ──
    const rateDiv = $('div').filter((_, el) => {
      const text = $(el).text().trim();
      return (text.includes('Special rate') || text.includes('Everyday rate')) &&
             text.includes(sendCurrency) && text.includes(receiveCurrency);
    }).first().text().trim();

    if (rateDiv) {
      const rateMatch = rateDiv.match(
        new RegExp(`1\s+${sendCurrency}\s*=\s*([\d.,]+)\s*${receiveCurrency}`, 'i')
      );
      if (rateMatch) {
        exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      }
    }

    // ── Method 2: Receive amount section ──
    if (!exchangeRate) {
      const receiveSection = $('div').filter((_, el) => {
        const text = $(el).text().trim();
        return text.includes('They receive') || text.includes('You receive') || text.includes('Recipient gets');
      }).first();

      if (receiveSection.length) {
        const text = receiveSection.text();
        // Be strict: look for the number immediately before the receive currency
        const match = text.match(new RegExp(`([\d.,]+)\s*${receiveCurrency}\b`, 'i'));
        if (match) {
          const recvAmt = parseFloat(match[1].replace(/,/g, ''));
          if (recvAmt > 0) {
            exchangeRate = recvAmt / sendAmount;
          }
        }
      }
    }

    // ── SANITY CHECK ──
    // Remitly rates for 1 unit should almost always be between 0.001 and 50,000
    if (exchangeRate && exchangeRate > 0.001 && exchangeRate < 50000) {
      return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
    }

    // ❌ REMOVED: Dangerous body-text fallback that caused 10,000× errors
    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};
