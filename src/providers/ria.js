const { TIMEOUTS } = require('../config');

module.exports = {
  name: 'Ria',

  reset() {},

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    // Ria supports URL parameters directly - much more reliable than dropdown interaction
    const url = `https://www.riamoneytransfer.com/en-us/rates-conversion/?From=${sendCurrency}&To=${receiveCurrency}&Amount=${sendAmount}`;

    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });
    await dismissCookieBanner(page);

    // Wait for the conversion result to render
    await page.waitForFunction(
      (sc, rc) => {
        const text = document.body.innerText;
        return text.includes(sc) && text.includes(rc) && /\d/.test(text);
      },
      [sendCurrency, receiveCurrency],
      { timeout: 10000 }
    ).catch(() => {});

    await page.waitForTimeout(500);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Check for unsupported corridor
    if (/not available|not supported|invalid currency/i.test(bodyText)) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    // ── PRIMARY: Extract from "1.00000 USD = 11.32661 GHS" pattern ──
    // This is the main rate display on the page
    const rateMatch = bodyText.match(
      new RegExp(`[\\d.]+\\s*${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );

    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        // The match gives us the rate for 1 unit of send currency
        // Verify: for USD→GHS it should be ~11-15, not 11,000
        if (exchangeRate < 50000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // ── SECONDARY: Extract from "1000 USD = 11,326.61374 GHS" in conversion table ──
    const bulkMatch = bodyText.match(
      new RegExp(
        `${sendAmount.toLocaleString()}\\s*${sendCurrency}\\s*([\\d.,]+)\\s*${receiveCurrency}`,
        'i'
      )
    );
    if (bulkMatch) {
      const recvAmt = parseFloat(bulkMatch[1].replace(/,/g, ''));
      if (recvAmt > 0) {
        const exchangeRate = recvAmt / sendAmount;
        if (exchangeRate > 0.001 && exchangeRate < 50000) {
          return { exchangeRate, receiveAmount: recvAmt, fee: null };
        }
      }
    }

    // ── TERTIARY: Read from #currencyTo input (the "Converted to" field) ──
    const currencyToVal = await page.locator('#currencyTo').inputValue().catch(() => null);
    if (currencyToVal) {
      const val = parseFloat(currencyToVal.replace(/,/g, ''));
      // This input shows the total receive amount for the entered send amount
      if (val > 0 && val < 10000000) {
        // Sanity: this should be the total receive amount, not a per-unit rate
        const exchangeRate = val / sendAmount;
        if (exchangeRate > 0.001 && exchangeRate < 50000) {
          return { exchangeRate, receiveAmount: val, fee: null };
        }
      }
    }

    // ── QUATERNARY: Extract from conversion table row ──
    // Look for "1 USD / 11.32661 GHS" in the table
    const tableMatch = bodyText.match(
      new RegExp(`1\\s*${sendCurrency}[/=\\s]+([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (tableMatch) {
      const exchangeRate = parseFloat(tableMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 50000) {
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
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}
