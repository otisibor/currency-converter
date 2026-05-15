const { TIMEOUTS } = require('../config');

const SEND_COUNTRY_MAP = {
  CAD: 'Canada',
  EUR: 'Germany',
  GBP: 'United Kingdom',
  USD: 'United States',
};

const RECEIVE_COUNTRY_MAP = {
  GHS: 'Ghana',
  INR: 'India',
  KES: 'Kenya',
  MXN: 'Mexico',
  NGN: 'Nigeria',
  PHP: 'Philippines',
  PKR: 'Pakistan',
};

module.exports = {
  name: 'Sendwave',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    const sendCountry = SEND_COUNTRY_MAP[sendCurrency];
    const receiveCountry = RECEIVE_COUNTRY_MAP[receiveCurrency];
    if (!sendCountry || !receiveCountry) {
      return { exchangeRate: null, receiveAmount: null, fee: null };
    }

    await page.goto('https://www.sendwave.com/en/', {
      waitUntil: 'networkidle',
      timeout: TIMEOUTS.navigation,
    });

    await dismissCookieBanner(page);

    // Wait for calculator to render
    await page.locator('input[type="decimal"]').first().waitFor({ timeout: 10000 });

    // Select send currency
    await selectCountry(page, sendCountry, 'send');

    // Select receive currency
    await selectCountry(page, receiveCountry, 'receive');

    // ── CRITICAL FIX: Fill amount then wait for React to update BOTH inputs ──
    const sendInput = page.locator('input[type="decimal"]').first();
    await sendInput.click({ clickCount: 3 });
    await sendInput.fill(String(sendAmount));

    // Wait for the receive field to show a positive value AND the send field
    // to actually display our entered value (not the default 100)
    await page.waitForFunction(
      (expectedSend) => {
        const inputs = document.querySelectorAll('input[type="decimal"]');
        if (inputs.length < 2) return false;
        const sendVal = parseFloat(inputs[0].value.replace(/,/g, ''));
        const recvVal = parseFloat(inputs[1].value.replace(/,/g, ''));
        // Ensure send field shows our value AND receive is calculated
        return Math.abs(sendVal - expectedSend) < 0.1 && recvVal > 0;
      },
      sendAmount,
      { timeout: 8000 }
    ).catch(() => {});

    // Extra safety wait for React to settle
    await page.waitForTimeout(1500);

    // Read values directly from DOM
    const result = await page.evaluate((expectedSend) => {
      const inputs = document.querySelectorAll('input[type="decimal"]');
      if (inputs.length < 2) return null;
      const sendVal = parseFloat(inputs[0].value.replace(/,/g, ''));
      const recvVal = parseFloat(inputs[1].value.replace(/,/g, ''));
      return { sendVal, recvVal, sendDisplay: inputs[0].value, recvDisplay: inputs[1].value };
    }, sendAmount);

    if (result && result.recvVal > 0 && result.sendVal > 0) {
      const exchangeRate = result.recvVal / result.sendVal;
      // Sanity check: reject the 1/10th bug pattern
      if (exchangeRate > 0.01) {
        return {
          exchangeRate,
          receiveAmount: exchangeRate * sendAmount,
          fee: null,
        };
      }
    }

    // Fallback: extract rate from page text (e.g. "1 USD = 60.98 PHP")
    const bodyText = await page.evaluate(() => document.body.innerText);
    const rateRegex = new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i');
    const rateMatch = bodyText.match(rateRegex);

    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function selectCountry(page, countryName, side) {
  const selector =
    side === 'send'
      ? '[data-testid="exchange-calculator-send-country-select"]'
      : '[data-testid="exchange-calculator-receive-country-select"]';

  await page.click(selector);
  await page.waitForTimeout(500);

  // Type in the autocomplete search input
  const searchInput = page.locator('input.MuiAutocomplete-input, input[role="combobox"]').last();
  await searchInput.click();
  await searchInput.fill(countryName);

  // Wait for MUI to filter the list before clicking
  await page
    .waitForFunction(
      (name) => {
        const options = document.querySelectorAll('li.MuiAutocomplete-option');
        return Array.from(options).some((li) => li.textContent.includes(name));
      },
      countryName,
      { timeout: 3000 }
    )
    .catch(() => {});

  // Click the matching option
  const option = page
    .locator('li.MuiAutocomplete-option')
    .filter({ hasText: countryName })
    .first();
  await option.click();

  // Wait for the calculator to update after country change
  await page.waitForTimeout(1500);
}

async function dismissCookieBanner(page) {
  try {
    const selectors = ['#onetrust-accept-btn-handler', '.osano-cm-accept-all'];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  } catch {}
}
