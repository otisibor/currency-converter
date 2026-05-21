const { getBounds, hasPair } = require('./market-rates');

function validateRate(result, options = {}) {
  const { strict = false } = options;

  if (!result || result.exchangeRate == null || result.exchangeRate <= 0) {
    return {
      status: 'invalid',
      reason: result?.error || 'no rate',
    };
  }

  const { sendCurrency, receiveCurrency, exchangeRate } = result;
  const bounds = getBounds(sendCurrency, receiveCurrency);
  const deviation = bounds
    ? ((exchangeRate - bounds.mid) / bounds.mid) * 100
    : null;

  const sanityResult = sanityCheck(result);
  if (sanityResult) {
    return { status: 'invalid', reason: sanityResult, deviation, bounds };
  }

  if (!bounds) {
    return {
      status: strict ? 'invalid' : 'suspect',
      reason: 'no market reference for pair',
      deviation,
      bounds,
    };
  }

  if (exchangeRate >= bounds.min && exchangeRate <= bounds.max) {
    return {
      status: 'valid',
      deviation: parseFloat(deviation.toFixed(1)),
      bounds: { min: parseFloat(bounds.min.toFixed(2)), max: parseFloat(bounds.max.toFixed(2)), mid: bounds.mid },
    };
  }

  const doubleBounds = {
    min: bounds.mid * (1 - bounds.tolerance * 2),
    max: bounds.mid * (1 + bounds.tolerance * 2),
  };

  if (exchangeRate >= doubleBounds.min && exchangeRate <= doubleBounds.max) {
    if (strict) {
      return {
        status: 'invalid',
        reason: `strict mode: outside ${Math.round(bounds.tolerance * 100)}% bounds`,
        deviation: parseFloat(deviation.toFixed(1)),
        bounds: { min: parseFloat(bounds.min.toFixed(2)), max: parseFloat(bounds.max.toFixed(2)), mid: bounds.mid },
      };
    }
    return {
      status: 'suspect',
      reason: `outside ${Math.round(bounds.tolerance * 100)}% bounds but within ${Math.round(bounds.tolerance * 200)}%`,
      deviation: parseFloat(deviation.toFixed(1)),
      bounds: { min: parseFloat(bounds.min.toFixed(2)), max: parseFloat(bounds.max.toFixed(2)), mid: bounds.mid },
    };
  }

  return {
    status: 'invalid',
    reason: `exceeds ${Math.round(bounds.tolerance * 200)}% tolerance`,
    deviation: parseFloat(deviation.toFixed(1)),
    bounds: { min: parseFloat(bounds.min.toFixed(2)), max: parseFloat(bounds.max.toFixed(2)), mid: bounds.mid },
  };
}

function sanityCheck(result) {
  const { exchangeRate, sendAmount, sendCurrency, receiveCurrency } = result;

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return 'rate is not a finite positive number';
  }

  if (exchangeRate === sendAmount) {
    return 'rate equals sendAmount (likely parsing bug)';
  }

  if (exchangeRate === 1 && sendCurrency !== receiveCurrency) {
    return 'rate is 1 for different currencies';
  }

  const magnitude = Math.log10(exchangeRate);
  if (receiveCurrency === 'NGN' && magnitude < 2) {
    return 'NGN rate too low (expected thousands)';
  }
  if (receiveCurrency === 'PKR' && magnitude < 1.5) {
    return 'PKR rate too low (expected hundreds)';
  }
  if (['GHS', 'MXN'].includes(receiveCurrency) && magnitude < 0) {
    return `${receiveCurrency} rate below 1 (order of magnitude error)`;
  }

  return null;
}

function attachValidation(result, validation) {
  result.validation = {
    status: validation.status,
  };
  if (validation.deviation != null) result.validation.deviationFromMid = validation.deviation;
  if (validation.bounds) {
    result.validation.boundsMin = validation.bounds.min;
    result.validation.boundsMax = validation.bounds.max;
    result.validation.expectedMid = validation.bounds.mid;
  }
  if (validation.reason) result.validation.reason = validation.reason;
  if (validation.retryAttempted != null) result.validation.retryAttempted = validation.retryAttempted;
  if (validation.retrySucceeded != null) result.validation.retrySucceeded = validation.retrySucceeded;
}

function generateValidationReport(results) {
  const byProvider = {};
  const anomalies = [];
  let validCount = 0;
  let suspectCount = 0;
  let invalidCount = 0;
  let nullCount = 0;

  for (const r of results) {
    if (!byProvider[r.provider]) {
      byProvider[r.provider] = { valid: 0, suspect: 0, invalid: 0, null: 0 };
    }

    const v = r.validation;
    if (!r.success || !v) {
      nullCount++;
      byProvider[r.provider].null++;
      continue;
    }

    switch (v.status) {
      case 'valid':
        validCount++;
        byProvider[r.provider].valid++;
        break;
      case 'suspect':
        suspectCount++;
        byProvider[r.provider].suspect++;
        anomalies.push({
          provider: r.provider,
          pair: `${r.sendCurrency}/${r.receiveCurrency}`,
          extractedRate: r.exchangeRate,
          expectedMid: v.expectedMid,
          deviation: v.deviationFromMid,
          status: v.status,
          reason: v.reason,
        });
        break;
      case 'invalid':
        invalidCount++;
        byProvider[r.provider].invalid++;
        anomalies.push({
          provider: r.provider,
          pair: `${r.sendCurrency}/${r.receiveCurrency}`,
          extractedRate: r.exchangeRate,
          expectedMid: v.expectedMid,
          deviation: v.deviationFromMid,
          status: v.status,
          reason: v.reason,
        });
        break;
    }
  }

  const crossProvider = {};
  const successfulPairs = results.filter(r => r.success && r.validation?.status === 'valid');

  for (const r of successfulPairs) {
    const key = `${r.sendCurrency}/${r.receiveCurrency}`;
    if (!crossProvider[key]) crossProvider[key] = [];
    crossProvider[key].push(r);
  }

  const crossProviderReport = [];
  for (const [pair, providers] of Object.entries(crossProvider)) {
    if (providers.length < 2) continue;
    const rates = providers.map(p => p.exchangeRate).sort((a, b) => a - b);
    const median = rates.length % 2 === 0
      ? (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2
      : rates[Math.floor(rates.length / 2)];

    const providerDetails = {};
    let hasFlagged = false;
    for (const p of providers) {
      const dev = ((p.exchangeRate - median) / median) * 100;
      const flagged = Math.abs(dev) > 20;
      if (flagged) hasFlagged = true;
      providerDetails[p.provider] = { rate: p.exchangeRate, deviation: parseFloat(dev.toFixed(1)), flagged };
    }

    if (hasFlagged) {
      crossProviderReport.push({ pair, median: parseFloat(median.toFixed(2)), providers: providerDetails });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalRates: results.length,
    validRates: validCount,
    suspectRates: suspectCount,
    invalidRates: invalidCount,
    nullRates: nullCount,
    byProvider,
    anomalies,
    crossProvider: crossProviderReport,
  };
}

module.exports = { validateRate, attachValidation, sanityCheck, generateValidationReport };
