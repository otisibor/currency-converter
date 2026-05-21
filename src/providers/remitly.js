const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');

module.exports = {
  name: 'Remitly',

  reset() {},

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

    // Use networkidle so JS-rendered rates are present
    await page.goto(converterUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });

    // Wait for the rate container to appear (the page renders this via JS)
    await page.waitForFunction(
      (sc, rc) => {
        const text = document.body.innerText;
        return text.includes(`1 ${sc}`) && text.includes(rc);
      },
      [sendCurrency, receiveCurrency],
      { timeout: 10000 }
    ).catch(() => {});

    await page.waitForTimeout(500);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Check for 404 / unsupported corridor
    if (/404|Not Found|Page not found|not available|not supported/i.test(bodyText)) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    let exchangeRate = null;

    // ── PRIMARY: "1 USD = 11.3500 GHS" ──
    const rateRegex = new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i');
    const rateMatch = bodyText.match(rateRegex);
    if (rateMatch) {
      exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
    }

    // ── SECONDARY: "1,000 USD = 11,350.00 GHS" ──
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

    // ── TERTIARY: "100 USD = 1,135.00 GHS" ──
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

    // ── QUATERNARY: DOM extraction from the rate element ──
    if (!exchangeRate) {
      const domRate = await page.evaluate((sc, rc) => {
        // Look for elements that contain the pattern directly
        const els = document.querySelectorAll('*');
        for (const el of els) {
          if (el.children.length === 0) { // leaf text nodes only
            const text = el.textContent;
            const m = text.match(new RegExp(`1\\s*${sc}\\s*=\\s*([\\d.,]+)\\s*${rc}`, 'i'));
            if (m) return parseFloat(m[1].replace(/,/g, ''));
          }
        }
        return null;
      }, sendCurrency, receiveCurrency);
      if (domRate) exchangeRate = domRate;
    }

    // ── SANITY CHECK ──
    // Rates for 1 unit should be reasonable (0.001 – 50,000)
    if (exchangeRate && exchangeRate > 0.001 && exchangeRate < 50000) {
      return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};
