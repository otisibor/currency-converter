const { scrape } = require('./scraper');

(async () => {
  const pairs = [
    { sendCurrency: 'USD', receiveCurrency: 'PHP' },
  ];

  const results = await scrape({
    wu: { name: 'Western Union', pairs },
    ria: { name: 'Ria', pairs },
    panda: { name: 'Panda Remit', pairs },
    taptap: { name: 'Taptap Send', pairs },
    transfergo: { name: 'TransferGo', pairs },
  }, { headless: false });

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    const status = r.success ? 'OK' : 'FAIL';
    console.log(`[${status}] ${r.provider}: ${r.sendCurrency}->${r.receiveCurrency} rate=${r.exchangeRate}`);
    if (r.error) console.log(`  Error: ${r.error}`);
  }
})();
