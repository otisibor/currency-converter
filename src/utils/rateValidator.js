// src/utils/rateValidator.js
// Validates scraped rates against historical medians to catch anomalies before DB write

const HISTORICAL_MEDIANS = {
  // Based on clean data from Apr 27-29, 2026
  'AED-GHS': 3.03,   'AED-INR': 25.81,  'AED-KES': 35.16,  'AED-MXN': 4.74,
  'AED-NGN': 371,    'AED-PHP': 16.69,  'AED-PKR': 76.04,
  'AUD-GHS': 7.97,   'AUD-INR': 67.86,  'AUD-KES': 92.77,  'AUD-MXN': 12.50,
  'AUD-NGN': 979,    'AUD-PHP': 44.00,  'AUD-PKR': 200.5,
  'CAD-GHS': 8.14,   'CAD-INR': 69.29,  'CAD-KES': 94.65,  'CAD-MXN': 12.76,
  'CAD-NGN': 1000,   'CAD-PHP': 45.06,  'CAD-PKR': 204.8,
  'EUR-GHS': 13.00,  'EUR-INR': 110.4,  'EUR-KES': 151.1,  'EUR-MXN': 20.37,
  'EUR-NGN': 1600,   'EUR-PHP': 71.21,  'EUR-PKR': 327.2,
  'GBP-GHS': 15.01,  'GBP-INR': 127.4,  'GBP-KES': 174.8,  'GBP-MXN': 23.52,
  'GBP-NGN': 1843,   'GBP-PHP': 82.22,  'GBP-PKR': 377.8,
  'PLN-GHS': 3.06,   'PLN-INR': 26.06,  'PLN-KES': 35.60,  'PLN-MXN': 4.80,
  'PLN-NGN': 376,    'PLN-PHP': 16.90,  'PLN-PKR': 77.01,
  'USD-GHS': 11.10,  'USD-INR': 94.51,  'USD-KES': 129.1,  'USD-MXN': 17.41,
  'USD-NGN': 1363,   'USD-PHP': 61.29,  'USD-PKR': 279.3,
};

const DEFAULT_TOLERANCE = 2.0; // 200% deviation threshold

function validateRate(rate, sendCurrency, receiveCurrency, tolerance = DEFAULT_TOLERANCE) {
  const key = `${sendCurrency}-${receiveCurrency}`;
  const median = HISTORICAL_MEDIANS[key];

  if (!median) {
    // No baseline yet — only check for absurd bounds
    if (rate > 50000 || rate < 0.001) {
      return {
        valid: false,
        reason: `Rate ${rate} outside sane bounds (no historical median for ${key})`,
        median: null,
      };
    }
    return { valid: true, median: null };
  }

  const deviation = Math.abs(rate - median) / median;

  if (deviation > tolerance) {
    return {
      valid: false,
      reason: `Rate ${rate} is ${(deviation * 100).toFixed(0)}% off median ${median} for ${key}`,
      median,
    };
  }

  if (rate > 50000 || rate < 0.001) {
    return { valid: false, reason: `Rate ${rate} outside sane bounds`, median };
  }

  return { valid: true, median };
}

module.exports = { validateRate, HISTORICAL_MEDIANS };
