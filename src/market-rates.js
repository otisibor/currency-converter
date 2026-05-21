const RATES = {
  // USD send
  'USD-GHS': { mid: 15.0, tolerance: 0.15 },
  'USD-INR': { mid: 85.5, tolerance: 0.15 },
  'USD-KES': { mid: 130.0, tolerance: 0.15 },
  'USD-MXN': { mid: 19.5, tolerance: 0.15 },
  'USD-NGN': { mid: 1550.0, tolerance: 0.25 },
  'USD-PHP': { mid: 58.0, tolerance: 0.15 },
  'USD-PKR': { mid: 283.0, tolerance: 0.15 },

  // GBP send
  'GBP-GHS': { mid: 20.0, tolerance: 0.15 },
  'GBP-INR': { mid: 113.5, tolerance: 0.15 },
  'GBP-KES': { mid: 172.0, tolerance: 0.15 },
  'GBP-MXN': { mid: 25.8, tolerance: 0.15 },
  'GBP-NGN': { mid: 2050.0, tolerance: 0.25 },
  'GBP-PHP': { mid: 76.8, tolerance: 0.15 },
  'GBP-PKR': { mid: 375.0, tolerance: 0.15 },

  // EUR send
  'EUR-GHS': { mid: 17.0, tolerance: 0.15 },
  'EUR-INR': { mid: 96.5, tolerance: 0.15 },
  'EUR-KES': { mid: 147.0, tolerance: 0.15 },
  'EUR-MXN': { mid: 22.0, tolerance: 0.15 },
  'EUR-NGN': { mid: 1760.0, tolerance: 0.25 },
  'EUR-PHP': { mid: 65.5, tolerance: 0.15 },
  'EUR-PKR': { mid: 320.0, tolerance: 0.15 },

  // CAD send
  'CAD-GHS': { mid: 11.0, tolerance: 0.15 },
  'CAD-INR': { mid: 62.5, tolerance: 0.15 },
  'CAD-KES': { mid: 95.0, tolerance: 0.15 },
  'CAD-MXN': { mid: 14.2, tolerance: 0.15 },
  'CAD-NGN': { mid: 1130.0, tolerance: 0.25 },
  'CAD-PHP': { mid: 42.5, tolerance: 0.15 },
  'CAD-PKR': { mid: 207.0, tolerance: 0.15 },

  // AUD send
  'AUD-GHS': { mid: 9.5, tolerance: 0.15 },
  'AUD-INR': { mid: 54.5, tolerance: 0.15 },
  'AUD-KES': { mid: 83.0, tolerance: 0.15 },
  'AUD-MXN': { mid: 12.3, tolerance: 0.15 },
  'AUD-NGN': { mid: 980.0, tolerance: 0.25 },
  'AUD-PHP': { mid: 36.8, tolerance: 0.15 },
  'AUD-PKR': { mid: 180.0, tolerance: 0.15 },

  // AED send
  'AED-GHS': { mid: 4.1, tolerance: 0.15 },
  'AED-INR': { mid: 23.3, tolerance: 0.15 },
  'AED-KES': { mid: 35.4, tolerance: 0.15 },
  'AED-MXN': { mid: 5.3, tolerance: 0.15 },
  'AED-NGN': { mid: 422.0, tolerance: 0.25 },
  'AED-PHP': { mid: 15.8, tolerance: 0.15 },
  'AED-PKR': { mid: 77.0, tolerance: 0.15 },

  // PLN send
  'PLN-GHS': { mid: 3.8, tolerance: 0.15 },
  'PLN-INR': { mid: 21.5, tolerance: 0.15 },
  'PLN-KES': { mid: 32.8, tolerance: 0.15 },
  'PLN-MXN': { mid: 4.9, tolerance: 0.15 },
  'PLN-NGN': { mid: 393.0, tolerance: 0.25 },
  'PLN-PHP': { mid: 14.6, tolerance: 0.15 },
  'PLN-PKR': { mid: 71.0, tolerance: 0.15 },
};

function getBounds(sendCurrency, receiveCurrency) {
  const key = `${sendCurrency}-${receiveCurrency}`;
  const entry = RATES[key];
  if (!entry) return null;
  const t = entry.tolerance;
  return { min: entry.mid * (1 - t), max: entry.mid * (1 + t), mid: entry.mid, tolerance: t };
}

function hasPair(sendCurrency, receiveCurrency) {
  return `${sendCurrency}-${receiveCurrency}` in RATES;
}

module.exports = { RATES, getBounds, hasPair };
