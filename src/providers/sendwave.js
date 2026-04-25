const { TIMEOUTS } = require('../config');

module.exports = {
  name: 'Sendwave',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    await page.goto('https://www.sendwave.com/en/', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(4000);

    await dismissCookieBanner(page);

    // Try to interact with calculator
    try {
      const inputs = page.locator('input[type="text"], input[type="number"]');
      if (await inputs.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await inputs.first().fill(String(sendAmount));
      }
      await page.waitForTimeout(2000);
    } catch {
      // Calculator may need different interaction
    }

    const bodyText = await page.textContent('body');
    const rate = extractRate(bodyText, sendCurrency, receiveCurrency, sendAmount);
    if (rate) return rate;

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accept")',
    ];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  } catch {}
}

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
