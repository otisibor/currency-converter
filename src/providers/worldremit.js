const { TIMEOUTS } = require('../config');

module.exports = {
  name: 'WorldRemit',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    await page.goto('https://www.worldremit.com/en/currency-converter', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(4000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(1000);

    // Select send currency
    const sendBtn = page.locator('[data-testid="calculator-v2-send-country-select"]').first();
    if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sendBtn.click();
      await page.waitForTimeout(800);
      const sendInput = page.locator('#calculator-v2-send-country-search-input');
      if (await sendInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await sendInput.fill(sendCurrency);
        await page.waitForTimeout(800);
        const sendLb = page.locator('#calculator-v2-send-country-search-input-listbox');
        if (await sendLb.isVisible({ timeout: 5000 }).catch(() => false)) {
          await sendLb.locator('li').first().click({ timeout: 5000 });
          await page.waitForTimeout(3000);
        }
      }
    }

    // Select receive currency
    const recvBtn = page.locator('[data-testid="calculator-v2-receive-country-select"]').first();
    if (await recvBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await recvBtn.click();
      await page.waitForTimeout(800);
      const recvInput = page.locator('#calculator-v2-receive-country-search-input');
      if (await recvInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await recvInput.fill(receiveCurrency);
        await page.waitForTimeout(800);
        const recvLb = page.locator('#calculator-v2-receive-country-search-input-listbox');
        if (await recvLb.isVisible({ timeout: 5000 }).catch(() => false)) {
          await recvLb.locator('li').first().click({ timeout: 5000 });
          await page.waitForTimeout(3000);
        }
      }
    }

    // Set send amount
    const calcInputs = page.locator('input[aria-label="pricing-calculator-input-label"]');
    if (await calcInputs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await calcInputs.first().fill(String(sendAmount));
      await page.waitForTimeout(3000);
    }

    // Read values from calculator inputs
    const inputs = await page.evaluate(() => {
      const els = document.querySelectorAll('input[aria-label="pricing-calculator-input-label"]');
      return Array.from(els).map(e => e.value);
    });

    if (inputs.length >= 2 && inputs[1] && parseFloat(inputs[1]) > 0) {
      const recvAmt = parseFloat(inputs[1]);
      const sendVal = parseFloat(inputs[0]);
      if (recvAmt > 0 && sendVal > 0 && recvAmt !== sendVal) {
        const exchangeRate = recvAmt / sendVal;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = ['#onetrust-accept-btn-handler', 'button:has-text("Accept")', 'button:has-text("Got it")'];
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
