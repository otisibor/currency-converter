const { TIMEOUTS } = require('../config');
const cheerio = require('cheerio');

let currentSendCurrency = null;

function reset() {
  currentSendCurrency = null;
}

module.exports = {
  name: 'WorldRemit',
  reset,

  async fetchRate(page, sendCurrency, receiveCurrency, sendAmount) {
    if (!page.url().includes('currency-converter')) {
      await page.goto('https://www.worldremit.com/en/currency-converter', { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.navigation });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      try {
        const acceptBtn = page.locator('#onetrust-accept-btn-handler').first();
        await acceptBtn.waitFor({ state: 'visible', timeout: 5000 });
        await acceptBtn.scrollIntoViewIfNeeded();
        await acceptBtn.click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
      } catch (err) {
        // Cookie popup not found
      }
      await page.waitForTimeout(200);
      currentSendCurrency = null;
    }

    // Only click send dropdown if currency changed
    if (sendCurrency !== currentSendCurrency) {
      await selectCountry(page, '[data-testid="calculator-v2-send-country-select"]', sendCurrency);
      currentSendCurrency = sendCurrency;
    }

    await selectCountry(page, '[data-testid="calculator-v2-receive-country-select"]', receiveCurrency);

    await page.evaluate(() => window.scrollTo(0, 0));

    const calcInputs = page.locator('input[aria-label="pricing-calculator-input-label"]');
    await calcInputs.first().fill(String(sendAmount));

    await page.waitForTimeout(2000);

    const values = await page.evaluate(() => {
      const els = document.querySelectorAll('input[aria-label="pricing-calculator-input-label"]');
      return Array.from(els).map(e => e.value.replace(/[\s,]/g, ''));
    });

    if (values.length >= 2 && parseFloat(values[1]) > 0) {
      const sendVal = parseFloat(values[0]);
      const recvAmt = parseFloat(values[1]);
      if (recvAmt > 0 && sendVal > 0) {
        const exchangeRate = recvAmt / sendVal;
        if (exchangeRate > 0.001 && exchangeRate < 1000000) {
          return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
        }
      }
    }

    // Fallback: cheerio parse
    const html = await page.content();
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    const rateMatch = bodyText.match(
      new RegExp(`1\\s+${sendCurrency}\\s*=\\s*([\\d.,]+)\\s*${receiveCurrency}`, 'i')
    );
    if (rateMatch) {
      const exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));
      if (exchangeRate > 0.001 && exchangeRate < 1000000) {
        return { exchangeRate, receiveAmount: exchangeRate * sendAmount, fee: null };
      }
    }

    return { exchangeRate: null, receiveAmount: null, fee: null };
  },
};

async function selectCountry(page, buttonSelector, currencyCode) {
  await page.locator(buttonSelector).first().click();
  await page.waitForTimeout(500);

  await page.evaluate((code) => {
    const listboxes = document.querySelectorAll('[role="listbox"]');
    for (const lb of listboxes) {
      if (lb.offsetParent !== null && lb.children.length > 0) {
        const items = Array.from(lb.querySelectorAll('li'));
        const match = items.find(li => li.textContent.trim().includes(code));
        if (match) {
          match.click();
          return true;
        }
      }
    }
    return false;
  }, currencyCode);

  await page.waitForTimeout(2000);
}
