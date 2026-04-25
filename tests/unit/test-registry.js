const { getProvider, PROVIDERS } = require('../../src/providers');

module.exports = async ({ test, assert, assertEqual }) => {
  await test('exports all 11 providers', async () => {
    const names = Object.keys(PROVIDERS);
    assertEqual(names.length, 11);
  });

  await test('getProvider returns module with fetchRate for known provider', async () => {
    const wise = getProvider('Wise');
    assert(wise !== null);
    assertEqual(wise.name, 'Wise');
    assertEqual(typeof wise.fetchRate, 'function');
  });

  await test('getProvider returns null for unknown provider', async () => {
    assertEqual(getProvider('NonExistent'), null);
  });

  await test('all provider modules have name and fetchRate', async () => {
    for (const [name, module] of Object.entries(PROVIDERS)) {
      assert(module.name, `${name} should have name property`);
      assertEqual(typeof module.fetchRate, 'function', `${name} should have fetchRate method`);
    }
  });
};
