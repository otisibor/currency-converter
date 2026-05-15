const { TIMEOUTS } = require('../config');

const COUNTRY_MAP = {
  AUD: {
    source: 'aus',
    dest: {
      CNY: 'china',
      TWD: 'taiwan',
      THB: 'thailand',
      HKD: 'hongkong',
      JPY: 'japan',
      INR: 'india',
      MYR: 'malaysia',
      PHP: 'philippines',
      SGD: 'singapore',
      VND: 'vietnam',
      PKR: 'pakistan',
      GHS: 'ghana',
      MXN: 'mexico',
    },
  },
  CAD: {
    source: 'can',
    dest: {
      CNY: 'china',
      INR: 'india',
      PHP: 'philippines',
      SGD: 'singapore',
      VND: 'vietnam',
      MYR: 'malaysia',
      PKR: 'pakistan',
      MXN: 'mexico',
      GHS: 'ghana',
    },
  },
  EUR: {
    source: 'fra',
    dest: {
      CNY: 'china',
      PHP: 'philippines',
      INR: 'india',
      JPY: 'japan',
      VND: 'vietnam',
      GHS: 'ghana',
      MXN: 'mexico',
      PKR: 'pakistan',
    },
  },
  GBP: {
    source: 'gbr',
    dest: {
      CNY: 'china',
      PHP: 'philippines',
      INR: 'india',
      JPY: 'japan',
      PKR: 'pakistan',
      GHS: 'ghana',
      MXN: 'mexico',
    },
  },
  NZD: { source: 'nzl', dest: { CNY: 'china', PHP: 'philippines' } },
  SGD: { source: 'sgp', dest: { CNY: 'china', PHP: 'philippines', INR: 'india' } },
  USD: {
    source: 'usa',
    dest: {
      CNY: 'china',
      PHP: 'philippines',
      TWD: 'taiwan',
      HKD: 'hongkong',
      JPY: 'japan',
      INR: 'india',
      THB: 'thailand',
      VND: 'vietnam',
      SGD: 'singapore',
      MYR: 'malaysia',
      MXN: 'mexico',
      GHS: 'ghana',
      PKR: 'pakistan',
    },
  },
};

module.exports = {
  name: 'Panda Remit',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const pair = COUNTRY_MAP[sendCurrency];
    if (!pair || !pair.dest[receiveCurrency]) {
      // Corridor not supported by Panda Remit — return immediately
      return {
        exchangeRate: null,
        receiveAmount: null,
        fee: null,
        error: 'Unsupported corridor',
      };
    }

    const url = `https://www.pandaremit.com/en/${pair.source}/${pair.dest[receiveCurrency]}/${sendCurrency.toLowerCase()}-${receiveCurrency.toLowerCase()}-converter?amount=${sendAmount}`;

    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });

    await dismissCookieBanner(page);
    await page.waitForTimeout(500);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Detect "not available" / "unsupported" / service unavailable messages
    if (/not available|unsupported|not offered|service unavailable|coming soon|currently unavailable/i.test(bodyText)) {
      return {
        exchangeRate: null,
        receiveAmount: null,
        fee: null,
        error: 'Corridor not offered by Panda Remit',
      };
    }

    // Wait for the converter result to appear
    await page
      .waitForFunction(
        (cur) => document.body.innerText.includes(cur),
        receiveCurrency,
        { timeout: 5000 }
      )
      .catch(() => {});

    // ── PRIMARY: "1,000 USD = 61,411.40 PHP" pattern ──
    // This is the main display on Panda Remit's page
    const rateMatch = bodyText.match(
      new RegExp(
        `${sendAmount.toLocaleString()}\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`,
        'i'
      )
    );
    if (rateMatch) {
      const recvAmt = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (recvAmt > 0) {
        const exchangeRate = recvAmt / sendAmount;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: recvAmt, fee: null };
        }
      }
    }

    // ── SECONDARY: "100 USD 63.2357" pattern (per 100 units in the table) ──
    const per100Match = bodyText.match(
      new RegExp(`100\\s+${sendCurrency}\\s*([\\d.,]+)`, 'i')
    );
    if (per100Match) {
      const exchangeRate = parseFloat(per100Match[1].replace(/,/g, '')) / 100;
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // ── TERTIARY: "63.2357 PHP" rate per 1 USD from table ──
    const unitMatch = bodyText.match(
      new RegExp(`1\\s*${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (unitMatch) {
      const exchangeRate = parseFloat(unitMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // ── QUATERNARY: Look for any receive amount in the page ──
    // The page shows "Amount Received" with the calculated value
    const amtReceivedMatch = bodyText.match(
      new RegExp(`Amount Received\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (amtReceivedMatch) {
      const recvAmt = parseFloat(amtReceivedMatch[1].replace(/,/g, ''));
      if (recvAmt > 0) {
        const exchangeRate = recvAmt / sendAmount;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: recvAmt, fee: null };
        }
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
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}
