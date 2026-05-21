const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');

// ✅ CRITICAL FIX: Factory function so isRestricted is per-instance, not global
function createMoneyGramScraper() {
  let isRestricted = false;

  return {
    name: 'MoneyGram',
    maxAttempts: 3,

    reset() {
      isRestricted = false;
    },

    async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
      if (isRestricted) {
        // Don't throw — return null so other corridors still get a chance
        return { exchangeRate: null, receiveAmount: null, fee: null, error: 'DataDome restriction active' };
      }

      const fromCountry = CURRENCY_COUNTRY_MAP[sendCurrency];
      const toCountry = CURRENCY_COUNTRY_MAP[receiveCurrency];
      if (!fromCountry || !toCountry) {
        return { exchangeRate: null, receiveAmount: null, fee: null };
      }

      try {
        await page.goto(
          `https://www.moneygram.com/mgo/${fromCountry.code.toLowerCase()}/en/`,
          { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation }
        );
      } catch {
        return { exchangeRate: null, receiveAmount: null, fee: null };
      }

      // Check for DataDome block
      const hasDataDome = await page.evaluate(() =>
        document.body.innerText.toLowerCase().includes('captcha') ||
        document.body.innerText.toLowerCase().includes('datadome') ||
        document.querySelector('iframe[src*="captcha-delivery"]') !== null
      );
      if (hasDataDome) {
        isRestricted = true;
        return { exchangeRate: null, receiveAmount: null, fee: null, error: 'DataDome bot detection' };
      }

      await dismissCookieBanner(page);

      // Select receive country
      await selectCountry(page, 'Country', toCountry.name);

      // Click send money
      await trySendMoney(page, fromCountry);

      // Check for DataDome after interactions
      const hasDataDomeAfter = await page.evaluate(() =>
        document.body.innerText.toLowerCase().includes('captcha') ||
        document.body.innerText.toLowerCase().includes('datadome') ||
        document.querySelector('iframe[src*="captcha-delivery"]') !== null
      );
      if (hasDataDomeAfter) {
        isRestricted = true;
        return { exchangeRate: null, receiveAmount: null, fee: null, error: 'DataDome bot detection' };
      }

      // Check for captcha slider
      const mainSlider = page.locator('.slider').first();
      if (await mainSlider.isVisible({ timeout: 1500 }).catch(() => false)) {
        const sliderSuccess = await dragSlider(page, mainSlider);
        if (!sliderSuccess) {
          return { exchangeRate: null, receiveAmount: null, fee: null };
        }
      }

      // Wait for calculator to populate
      await page
        .waitForFunction(
          () => {
            const inputs = document.querySelectorAll('input[type="text"]');
            return inputs.length >= 2 && inputs[0].value && inputs[1].value;
          },
          { timeout: 8000 }
        )
        .catch(() => {});

      // Extra wait for rate calculation
      await page.waitForTimeout(1500);

      // Extract rate from calculator inputs
      return await extractRateFromCalculator(page, sendCurrency, receiveCurrency, sendAmount);
    },
  };
}

module.exports = createMoneyGramScraper();

async function selectCountry(page, ariaLabel, countryName) {
  try {
    const btn = page.locator(`button[aria-label="${ariaLabel}"]`).last();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
    }

    const option = page
      .locator('[role="option"]')
      .filter({ hasText: countryName })
      .first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click({ timeout: 5000 });
      await page.waitForTimeout(800);
    }
  } catch {}
}

async function trySendMoney(page, fromCountry) {
  try {
    const sendMoneyBtn = page.getByRole('button', { name: 'Send money' }).first();
    if (!(await sendMoneyBtn.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const isDisabled = await sendMoneyBtn.isDisabled().catch(() => true);
    if (!isDisabled) {
      await sendMoneyBtn.click();
      try {
        await page.waitForNavigation({ timeout: 9000 });
      } catch {}
      return;
    }

    // Try selecting send country first
    const sendBtn = page.locator('button[aria-label="Country"]').first();
    if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const sendText = await sendBtn.textContent().catch(() => '');
      if (!sendText.includes(fromCountry.name)) {
        await sendBtn.click();
        await page.waitForTimeout(500);
        const sendOpt = page
          .locator('[role="option"]')
          .filter({ hasText: fromCountry.name })
          .first();
        if (await sendOpt.isVisible({ timeout: 5000 }).catch(() => false)) {
          await sendOpt.click({ timeout: 5000 });
          await page.waitForTimeout(800);
        }
      }
    }

    // Retry send money
    if (await sendMoneyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const retryDisabled = await sendMoneyBtn.isDisabled().catch(() => true);
      if (!retryDisabled) {
        await sendMoneyBtn.click();
        try {
          await page.waitForNavigation({ timeout: 5000 });
        } catch {
          return;
        }
      }
    }
  } catch {}
}

async function dragSlider(page, slider) {
  try {
    const box = await slider.boundingBox();
    if (!box) return false;

    const init = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const target = {
      x: box.x + box.width - 15,
      y: init.y + (Math.random() - 0.5) * 10,
    };

    await page.mouse.move(init.x, init.y);
    await page.waitForTimeout(200 + Math.random() * 300);
    await page.mouse.down();
    await page.waitForTimeout(100 + Math.random() * 200);
    await page.mouse.move(target.x, target.y, {
      steps: 50 + Math.floor(Math.random() * 50),
    });
    await page.waitForTimeout(100 + Math.random() * 200);
    await page.mouse.up();

    // Wait after slider to see if calculator loads
    await page.waitForTimeout(2000);
    return true;
  } catch {
    return false;
  }
}

async function extractRateFromCalculator(page, sendCurrency, receiveCurrency, sendAmount) {
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="text"]'))
      .map((inp) => inp.value.trim())
      .filter((v) => v && v !== '0');
  });

  if (inputs.length >= 2) {
    const sendVal = parseFloat(inputs[0].replace(/,/g, ''));
    const recvVal = parseFloat(inputs[1].replace(/,/g, ''));
    if (sendVal > 0 && recvVal > 0 && sendVal !== recvVal) {
      const exchangeRate = recvVal / sendVal;
      if (exchangeRate > 0.01 && exchangeRate < 100000) {
        return {
          exchangeRate,
          receiveAmount: exchangeRate * sendAmount,
          fee: null,
        };
      }
    }
  }

  // Fallback: body text regex
  const bodyText = await page.evaluate(() => document.body.innerText);
  const rateMatch = bodyText.match(
    new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
  );
  if (rateMatch) {
    const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
    if (exchangeRate > 0.01 && exchangeRate < 100000) {
      return {
        exchangeRate,
        receiveAmount: exchangeRate * sendAmount,
        fee: null,
      };
    }
  }

  return { exchangeRate: null, receiveAmount: null, fee: null };
}

async function dismissCookieBanner(page) {
  try {
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accept")',
      'button:has-text("I Accept")',
    ];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}
