const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');

module.exports = {
  name: 'Remitly',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const from = sendCurrency.toLowerCase();
    const to = receiveCurrency.toLowerCase();
    const fromCountry = CURRENCY_COUNTRY_MAP[sendCurrency];
    const toCountry = CURRENCY_COUNTRY_MAP[receiveCurrency];

    // Priority 1: Static currency converter page
    const converterUrl = `https://www.remitly.com/us/en/currency-converter/${from}-to-${to}-rate`;

    try {
      await page.goto(converterUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await page.waitForTimeout(3000);

      const bodyText = await page.textContent('body');
      const rate = extractRate(bodyText, sendCurrency, receiveCurrency, sendAmount);
      if (rate) return rate;
    } catch {
      // Fall through to country URL
    }

    // Priority 2: Country-based pricing page fallback
    if (fromCountry && toCountry) {
      const countryUrl = `https://www.remitly.com/${fromCountry.code.toLowerCase()}/en/${toCountry.slug}`;

      try {
        await page.goto(countryUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
        await page.waitForTimeout(3000);

        const bodyText = await page.textContent('body');
        const rate = extractRate(bodyText, sendCurrency, receiveCurrency, sendAmount);
        if (rate) return rate;
      } catch {
        // Already tried both approaches
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

function extractRate(bodyText, sendCurrency, receiveCurrency, sendAmount) {
  const rateMatch = bodyText.match(
    new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
  );
  if (rateMatch) {
    const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
    if (exchangeRate > 0) {
      return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
    }
  }

  const recvMatch = bodyText.match(
    new RegExp(`([\\d,.]+)\\s*${receiveCurrency}`, 'i')
  );
  if (recvMatch) {
    const recvAmt = parseFloat(recvMatch[1].replace(/,/g, ''));
    if (recvAmt > 0 && recvAmt !== sendAmount) {
      return { exchangeRate: recvAmt / sendAmount, receiveAmount: recvAmt, fee: null };
    }
  }

  return null;
}
