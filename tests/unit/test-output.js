const fs = require('fs');
const path = require('path');
const { writeResults } = require('../../src/output');

module.exports = async ({ test, assert, assertEqual }) => {
  const sampleResults = [
    {
      provider: 'Wise',
      sendCurrency: 'USD',
      receiveCurrency: 'NGN',
      sendAmount: 1000,
      exchangeRate: 1580.50,
      receiveAmount: 1580500,
      fee: null,
      timestamp: '2026-04-25T12:00:00.000Z',
      success: true,
      error: null,
    },
    {
      provider: 'Wise',
      sendCurrency: 'GBP',
      receiveCurrency: 'INR',
      sendAmount: 1000,
      exchangeRate: 105.23,
      receiveAmount: 105230,
      fee: null,
      timestamp: '2026-04-25T12:00:01.000Z',
      success: true,
      error: null,
    },
  ];

  await test('writes rates.json as valid JSON', async () => {
    writeResults(sampleResults);
    const jsonPath = path.join(process.cwd(), 'output', 'rates.json');
    assert(fs.existsSync(jsonPath), 'rates.json should exist');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    assert(Array.isArray(data.results), 'Should have results array');
    assertEqual(data.results.length, 2, 'Should have 2 results');
  });

  await test('writes rates.csv with correct headers and rows', async () => {
    writeResults(sampleResults);
    const csvPath = path.join(process.cwd(), 'output', 'rates.csv');
    assert(fs.existsSync(csvPath), 'rates.csv should exist');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    assert(lines[0].includes('provider'), 'First line should have provider header');
    assert(lines[0].includes('exchangeRate'), 'First line should have exchangeRate header');
    assertEqual(lines.length, 3, 'Should have header + 2 data rows');
  });
};
