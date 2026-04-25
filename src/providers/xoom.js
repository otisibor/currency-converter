const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');

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
    await page.waitForTimeout(4000);

    // Check if redirected to login (PayPal redirect)
    const currentUrl = page.url();
    if (currentUrl.includes('paypal') || currentUrl.includes('login') || currentUrl.includes('signin')) {
      return { exchangeRate: null, receiveAmount: null, fee: null, error: 'Login required' };
    }

    const bodyText = await page.textContent('body');

    // Xoom may show multiple rates (bank deposit, cash pickup)
    // Grab the first/primary rate
    const rateMatch = bodyText.match(
      new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // Broader pattern
    const recvMatch = bodyText.match(
      new RegExp(`([\\d,.]+)\\s*${receiveCurrency}`, 'i')
    );
    if (recvMatch) {
      const recvAmt = parseFloat(recvMatch[1].replace(/,/g, ''));
      if (recvAmt > 0 && recvAmt !== sendAmount) {
        return { exchangeRate: recvAmt / sendAmount, receiveAmount: recvAmt, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};
