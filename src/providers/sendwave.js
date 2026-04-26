const { TIMEOUTS } = require('../config');
const cheerio = require('cheerio');

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

    await page.goto('https://www.sendwave.com/en/', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(3000);

    await dismissCookieBanner(page);

    // Wait for calculator inputs to render
    await page.locator('input[type="decimal"]').first().waitFor({ timeout: 5000 });

    // Select send currency (opens a MUI Drawer with autocomplete)
    await selectCountry(page, sendCountry, 'send');

    // Select receive currency (opens a MUI Drawer with autocomplete)
    await selectCountry(page, receiveCountry, 'receive');

    // Wait for rate to update
    await page.waitForTimeout(2000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const rateRegex = new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i');
    const rateMatch = bodyText.match(rateRegex);

    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // Fallback: try to read receive amount from calculator input
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="decimal"]')).map(i => i.value);
    });

    if (inputs.length >= 2 && inputs[1]) {
      const recvAmt = parseFloat(inputs[1].replace(/,/g, ''));
      if (recvAmt > 0) {
        const exchangeRate = recvAmt / sendAmount;
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function selectCountry(page, countryName, side) {
  const selector = side === 'send'
    ? '[data-testid="exchange-calculator-send-country-select"]'
    : '[data-testid="exchange-calculator-receive-country-select"]';

  await page.click(selector);
  await page.waitForTimeout(500);

  // Type in the autocomplete search input
  const searchInput = page.locator('input.MuiAutocomplete-input, input[role="combobox"]').last();
  await searchInput.click();
  await searchInput.fill(countryName);
  await page.waitForTimeout(500);

  // Click the matching option
  const option = page.locator(`li.MuiAutocomplete-option:has-text("${countryName}")`).first();
  await option.click();
  await page.waitForTimeout(1000);
}

async function dismissCookieBanner(page) {
  try {
    const selectors = ['#onetrust-accept-btn-handler', '.osano-cm-accept-all'];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  } catch {}
}
