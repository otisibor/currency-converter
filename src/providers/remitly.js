const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');

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

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Check for 404
    if (bodyText.includes('404') || bodyText.includes('Not Found') || bodyText.includes('Page not found')) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    // ── PRIMARY: Look for explicit rate expression ──
    // This regex was working in the original code — keep it
    const rateRegex = new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i');
    const rateMatch = bodyText.match(rateRegex);

    let exchangeRate = null;

    if (rateMatch) {
      exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
    }

    // ── SECONDARY: Look for "1,000 EUR = 13,280.90 GHS" pattern ──
    // If the page shows rate per 1000, normalize it
    if (!exchangeRate) {
      const bulkRegex = new RegExp(
        `${sendAmount.toLocaleString()}\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`,
        'i'
      );
      const bulkMatch = bodyText.match(bulkRegex);
      if (bulkMatch) {
        const recvAmt = parseFloat(bulkMatch[1].replace(/,/g, ''));
        if (recvAmt > 0) {
          exchangeRate = recvAmt / sendAmount;
        }
      }
    }

    // ── TERTIARY: Look for "100 EUR = 1,328.09 GHS" (per 100) ──
    if (!exchangeRate) {
      const per100Regex = new RegExp(
        `100\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`,
        'i'
      );
      const per100Match = bodyText.match(per100Regex);
      if (per100Match) {
        exchangeRate = parseFloat(per100Match[1].replace(/,/g, '')) / 100;
      }
    }

    // ── SANITY CHECK ──
    // Reject absurd values. Remitly rates for 1 unit should be 0.001 – 50,000.
    if (exchangeRate && exchangeRate > 0.001 && exchangeRate < 50000) {
      return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
    }

    // ❌ REMOVED: The dangerous bodyText.match(/(\d[\d.,]*)/) fallback
    // that caused 130,090 EUR→GHS by matching random numbers on the page.
    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};
