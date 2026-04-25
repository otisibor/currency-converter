const { TIMEOUTS } = require('../config');

module.exports = {
  name: 'Wise',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const from = sendCurrency.toLowerCase();
    const to = receiveCurrency.toLowerCase();

    // Priority 1: Static currency converter page
    try {
      const staticUrl = `https://wise.com/gb/currency-converter/${from}-to-${to}-rate?amount=${sendAmount}`;
      await page.goto(staticUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await page.waitForTimeout(3000);

      await dismissCookieBanner(page);

      const bodyText = await page.textContent('body');
      const rate = extractRate(bodyText, sendCurrency, receiveCurrency, sendAmount);
      if (rate) return rate;
    } catch {
      // Fall through to interactive page
    }

    // Priority 2: Interactive send-money page fallback
    try {
      await page.goto('https://wise.com/gb/send-money/', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await page.waitForTimeout(4000);

      await dismissCookieBanner(page);

      // Try to fill the calculator
      const sendInput = page.getByRole('textbox', { name: /send|you send|amount/i }).first();
      if (await sendInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendInput.fill(String(sendAmount));
      }

      await page.waitForTimeout(2000);

      const bodyText = await page.textContent('body');
      const rate = extractRate(bodyText, sendCurrency, receiveCurrency, sendAmount);
      if (rate) return rate;
    } catch {
      // Already tried both approaches
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = [
      'button:has-text("Accept")',
      'button:has-text("Got it")',
      '#onetrust-accept-btn-handler',
      '[data-testid="cookie-accept"]',
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
  // Try "1 USD = X NGN" pattern
  const rateMatch = bodyText.match(
    new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
  );
  if (rateMatch) {
    const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
    if (exchangeRate > 0) {
      return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
    }
  }

  // Try broader pattern: find amount near receive currency
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
