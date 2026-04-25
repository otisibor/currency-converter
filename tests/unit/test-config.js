const config = require('../../src/config');

module.exports = async ({ test, assert, assertEqual }) => {
  await test('exports SEND_AMOUNT as number', async () => {
    assertEqual(typeof config.SEND_AMOUNT, 'number');
    assertEqual(config.SEND_AMOUNT, 1000);
  });

  await test('CURRENCY_COUNTRY_MAP has all 14 currencies', async () => {
    const currencies = ['AED', 'AUD', 'CAD', 'EUR', 'GBP', 'PLN', 'USD', 'GHS', 'INR', 'KES', 'MXN', 'NGN', 'PHP', 'PKR'];
    for (const code of currencies) {
      assert(config.CURRENCY_COUNTRY_MAP[code], `Should have ${code}`);
      assert(config.CURRENCY_COUNTRY_MAP[code].code, `${code} should have code`);
      assert(config.CURRENCY_COUNTRY_MAP[code].slug, `${code} should have slug`);
    }
    assertEqual(Object.keys(config.CURRENCY_COUNTRY_MAP).length, 14);
  });

  await test('BROWSER_OPTIONS has required fields', async () => {
    assertEqual(config.BROWSER_OPTIONS.headless, true);
    assert(Array.isArray(config.BROWSER_OPTIONS.args));
  });

  await test('CONTEXT_OPTIONS has user agent and viewport', async () => {
    assert(typeof config.CONTEXT_OPTIONS.userAgent === 'string');
    assert(config.CONTEXT_OPTIONS.viewport);
    assert(config.CONTEXT_OPTIONS.viewport.width > 0);
    assert(config.CONTEXT_OPTIONS.viewport.height > 0);
  });

  await test('TIMEOUTS has required keys', async () => {
    assert(config.TIMEOUTS.navigation > 0);
    assert(config.TIMEOUTS.element > 0);
    assert(config.TIMEOUTS.betweenRequests > 0);
  });
};
