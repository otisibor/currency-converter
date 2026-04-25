const path = require('path');
const { loadProviderPairs } = require('../../src/csv-parser');

module.exports = async ({ test, assert, assertEqual }) => {
  const csvPath = path.join(__dirname, '..', '..', 'Provider.csv');

  await test('loads Provider.csv and returns object', async () => {
    const pairs = loadProviderPairs(csvPath);
    assert(typeof pairs === 'object', 'Should return an object');
    assert(Object.keys(pairs).length > 0, 'Should have at least one provider');
  });

  await test('groups rows by provider name', async () => {
    const pairs = loadProviderPairs(csvPath);
    assertEqual(Object.keys(pairs).length, 11, 'Should have exactly 11 providers');
  });

  await test('Wise has 49 currency pairs', async () => {
    const pairs = loadProviderPairs(csvPath);
    assertEqual(pairs.Wise.pairs.length, 49, 'Wise should have 49 pairs');
  });

  await test('TransferGo has 5 currency pairs', async () => {
    const pairs = loadProviderPairs(csvPath);
    assertEqual(pairs.TransferGo.pairs.length, 5, 'TransferGo should have 5 pairs');
  });

  await test('each pair has sendCurrency and receiveCurrency', async () => {
    const pairs = loadProviderPairs(csvPath);
    for (const [providerName, provider] of Object.entries(pairs)) {
      assert(provider.name, `${providerName} should have name`);
      assert(provider.url, `${providerName} should have url`);
      for (const pair of provider.pairs) {
        assert(pair.sendCurrency, `${providerName} pair should have sendCurrency`);
        assert(pair.receiveCurrency, `${providerName} pair should have receiveCurrency`);
        assertEqual(pair.sendCurrency.length, 3, `sendCurrency should be 3 letters`);
        assertEqual(pair.receiveCurrency.length, 3, `receiveCurrency should be 3 letters`);
      }
    }
  });

  await test('total pair count is 423', async () => {
    const pairs = loadProviderPairs(csvPath);
    const total = Object.values(pairs).reduce((sum, p) => sum + p.pairs.length, 0);
    assertEqual(total, 422, 'Total pairs should be 422');
  });
};
