const { TIMEOUTS, CURRENCY_COUNTRY_MAP } = require('../config');
const cheerio = require('cheerio');

let currentPage = null;
let currentSendCurrency = null;

module.exports = {
  name: 'Ria',

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    if (currentPage !== page) {
      const url = 'https://www.riamoneytransfer.com/en-us/rates-conversion/';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await dismissCookieBanner(page);
      await page.locator('#currencyFrom').waitFor({ timeout: 5000 });
      currentPage = page;
      currentSendCurrency = null;
    }

    // ── Change receive currency ──
    const recvCombobox = page.locator('#currency-selector-currencyTo').first();
    await recvCombobox.waitFor({ timeout: 5000 }).catch(() => {});
    if (await recvCombobox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await recvCombobox.click();
      const option = page.locator('[role="option"]').filter({ hasText: receiveCurrency }).first();
      await option.waitFor({ timeout: 5000 });
      await option.click();
    }

    // ── Change send currency ──
    if (sendCurrency !== currentSendCurrency) {
      const sendCombobox = page.locator('#currency-selector-currencyFrom').first();
      if (await sendCombobox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendCombobox.click();
        const option = page.locator('[role="option"]').filter({ hasText: sendCurrency }).first();
        await option.waitFor({ timeout: 5000 });
        await option.click();
      }
      currentSendCurrency = sendCurrency;
    }

    // ── Fill amount ──
    const amountInput = page.locator('#currencyFrom').first();
    await amountInput.click({ clickCount: 3 });
    await amountInput.fill(String(sendAmount));

    // ✅ CRITICAL FIX: Wait for the SPECIFIC rate text to appear
    // The .result element must contain a rate expression for OUR pair
    await page.waitForFunction(
      (send, recv) => {
        const el = document.querySelector('.result');
        if (!el) return false;
        const text = el.textContent;
        return new RegExp(`1\s*\.?0*\s*${send}\s*=\s*[\d.,]+\s*${recv}`, 'i').test(text);
      },
      [sendCurrency, receiveCurrency],
      { timeout: 10000 }
    ).catch(() => {});

    await page.waitForTimeout(800);

    // ✅ CRITICAL FIX: Read live DOM via Playwright, NOT cheerio on stale HTML
    const resultText = await page.locator('.result').textContent();

    // Extract the rate for OUR specific pair only
    const m = resultText.match(
      new RegExp(`[\d.,]+\s+${sendCurrency}\s*=?\s*([\d.,]+)\s*${receiveCurrency}`, 'i')
    );

    if (m) {
      const exchangeRate = parseFloat(m[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    // Fallback: read the #currencyTo input value (live DOM)
    const receiveVal = await page.locator('#currencyTo').inputValue();
    if (receiveVal) {
      const rate = parseFloat(receiveVal.replace(/,/g, ''));
      if (rate > 0.001 && rate < 1000000) {
        return { exchangeRate: rate, receiveAmount: rate * sendAmount, fee: null };
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
    ];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }
  } catch {}
}
