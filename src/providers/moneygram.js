const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');

module.exports = {
  name: 'MoneyGram',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const fromCountry = CURRENCY_COUNTRY_MAP[sendCurrency];
    const toCountry = CURRENCY_COUNTRY_MAP[receiveCurrency];
    if (!fromCountry || !toCountry) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    await page.goto(`https://www.moneygram.com/mgo/${fromCountry.code.toLowerCase()}/en/`, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(5000);

    await dismissCookieBanner(page);
    await page.waitForTimeout(2000);

    // Step 1: Click receive country selector (second button[aria-label="Country"])
    const recvBtn = page.locator('button[aria-label="Country"]').last();
    if (await recvBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await recvBtn.click();
      await page.waitForTimeout(1500);
    }

    // Step 2: Click the country option from cmdk dropdown
    const countryOption = page.locator('[role="option"]').filter({ hasText: toCountry.name }).first();
    if (await countryOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await countryOption.click({ timeout: 5000 });
      await page.waitForTimeout(3000);
    }

    // Step 3: Click "Send money" button
    const sendMoneyBtn = page.getByRole('button', { name: 'Send money' }).first();
    if (await sendMoneyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const isDisabled = await sendMoneyBtn.isDisabled().catch(() => true);
      if (!isDisabled) {
        await sendMoneyBtn.click();
        try { await page.waitForNavigation({ timeout: 15000 }); } catch {}
        await page.waitForTimeout(3000);
      } else {
        // Try selecting send country first
        const sendBtn = page.locator('button[aria-label="Country"]').first();
        if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          const sendText = await sendBtn.textContent().catch(() => '');
          if (!sendText.includes(fromCountry.name)) {
            await sendBtn.click();
            await page.waitForTimeout(1000);
            const sendOpt = page.locator('[role="option"]').filter({ hasText: fromCountry.name }).first();
            if (await sendOpt.isVisible({ timeout: 5000 }).catch(() => false)) {
              await sendOpt.click({ timeout: 5000 });
              await page.waitForTimeout(3000);
            }
          }
        }
        // Retry send money
        if (await sendMoneyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          const retryDisabled = await sendMoneyBtn.isDisabled().catch(() => true);
          if (!retryDisabled) {
            await sendMoneyBtn.click();
            try { await page.waitForNavigation({ timeout: 15000 }); } catch {}
            await page.waitForTimeout(3000);
          }
        }
      }
    }

    // Handle captcha slider
    try {
      const slider = page.locator('.slider').first();
      if (await slider.isVisible({ timeout: 3000 }).catch(() => false)) {
        const box = await slider.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 10 });
          await page.mouse.up();
          await page.waitForTimeout(3000);
        }
      }
    } catch {}

    // Corridor page calculator: fill send amount, select receive method
    const calcInputs = page.locator('input[type="text"]');
    if (await calcInputs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await calcInputs.first().fill(String(sendAmount));
      await page.waitForTimeout(2000);

      // Select a receive method (Bank account)
      try {
        const bankBtn = page.getByRole('button', { name: 'Bank account' }).first();
        if (await bankBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await bankBtn.click();
          await page.waitForTimeout(3000);
        }
      } catch {}

      // Read receive amount from second input
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="text"]')).map(inp => inp.value);
      });

      if (inputs.length >= 2 && inputs[1] && parseFloat(inputs[1]) > 0) {
        const recvAmt = parseFloat(inputs[1].replace(/,/g, ''));
        const sendVal = parseFloat(inputs[0].replace(/,/g, ''));
        if (recvAmt > 0 && sendVal > 0 && recvAmt !== sendVal) {
          const exchangeRate = recvAmt / sendVal;
          if (exchangeRate > 0.01 && exchangeRate < 100000) {
            return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
          }
        }
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function dismissCookieBanner(page) {
  try {
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accept")',
      'button:has-text("I Accept")',
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
