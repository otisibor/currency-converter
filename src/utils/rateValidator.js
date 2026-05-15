/**
 * rateValidator.js — Rejects exchange-rate outliers before database write.
 *
 * Usage:
 *   const { isOutlier } = require('./utils/rateValidator');
 *   if (isOutlier('Wise', 'USD', 'NGN', 1363)) {
 *     // Reject — rate is > 200% of historical median
 *   }
 *
 * The validator maintains a rolling window of historical medians per provider+corridor.
 * On first run (no history), it accepts the rate and seeds the window.
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'rate-history.json');
const WINDOW_SIZE = 20; // Keep last N rates per corridor
const DEVIATION_THRESHOLD = 2.0; // Reject if > 200% of median
const MIN_RATES_FOR_VALIDATION = 3; // Need at least 3 historical points

let history = {};

// Load historical data if available
try {
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  }
} catch (err) {
  console.warn('Rate history file could not be loaded:', err.message);
}

function getKey(provider, sendCurrency, receiveCurrency) {
  return `${provider}|${sendCurrency}|${receiveCurrency}`;
}

function calculateMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function saveHistory() {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.warn('Could not save rate history:', err.message);
  }
}

/**
 * Check if a rate is an outlier relative to historical data.
 * Returns true if the rate should be rejected.
 */
function isOutlier(provider, sendCurrency, receiveCurrency, rate) {
  if (!rate || rate <= 0) return true; // Reject null/negative rates

  const key = getKey(provider, sendCurrency, receiveCurrency);
  const window = history[key] || [];

  // Not enough history yet — accept and seed
  if (window.length < MIN_RATES_FOR_VALIDATION) {
    return false;
  }

  const median = calculateMedian(window);
  if (!median || median <= 0) return false;

  // If rate deviates by more than 200% from median, it's an outlier
  const ratio = rate / median;
  if (ratio > DEVIATION_THRESHOLD || ratio < 1 / DEVIATION_THRESHOLD) {
    return true;
  }

  return false;
}

/**
 * Record a successfully validated rate into the historical window.
 */
function recordRate(provider, sendCurrency, receiveCurrency, rate) {
  if (!rate || rate <= 0) return;

  const key = getKey(provider, sendCurrency, receiveCurrency);
  if (!history[key]) history[key] = [];

  history[key].push(rate);

  // Keep only the last WINDOW_SIZE entries
  if (history[key].length > WINDOW_SIZE) {
    history[key] = history[key].slice(-WINDOW_SIZE);
  }

  saveHistory();
}

/**
 * Validate a rate and return a result object.
 */
function validateRate(provider, sendCurrency, receiveCurrency, rate) {
  if (!rate || rate <= 0) {
    return { valid: false, reason: 'Invalid or missing rate', rejected: true };
  }

  const outlier = isOutlier(provider, sendCurrency, receiveCurrency, rate);
  if (outlier) {
    const key = getKey(provider, sendCurrency, receiveCurrency);
    const window = history[key] || [];
    const median = calculateMedian(window);
    return {
      valid: false,
      reason: `Rate ${rate} is > ${DEVIATION_THRESHOLD * 100}% deviation from historical median ${median}`,
      rejected: true,
      median,
      historyCount: window.length,
    };
  }

  return { valid: true, rejected: false };
}

module.exports = {
  isOutlier,
  recordRate,
  validateRate,
  calculateMedian,
};
