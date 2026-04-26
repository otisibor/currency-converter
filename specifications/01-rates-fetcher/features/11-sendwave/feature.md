---
workspace_name: "rates-fetcher"
spec_directory: "specifications/01-rates-fetcher"
feature_directory: "specifications/01-rates-fetcher/features/11-sendwave"
this_file: "specifications/01-rates-fetcher/features/11-sendwave/feature.md"

feature: "Sendwave Provider"
description: "Scraper for Sendwave (sendwave.com) — homepage calculator with send/receive fields"
status: completed
priority: high
created: 2026-04-25
last_updated: 2026-04-25
author: "Main Agent"

depends_on: ["01-scraper-engine"]

tasks:
  completed: 0
  uncompleted: 6
  total: 6
  completion_percentage: 0
---

# Sendwave Provider

## Overview

Sendwave is a mobile-first remittance provider with 28 currency pairs. Their homepage displays an exchange rate calculator with "You send" and "They get" fields. No dedicated currency converter page — rates are on the homepage.

## Provider Details

- **Name**: Sendwave
- **Base URL**: https://www.sendwave.com
- **Calculator URL**: `https://www.sendwave.com/en/` (homepage)
- **Pairs in CSV**: 28
- **Send currencies**: CAD, EUR, GBP, USD
- **Receive currencies**: GHS, INR, KES, MXN, NGN, PHP, PKR

## Scraping Strategy

### Interactive Homepage Calculator (Primary Method)

**Page Structure**:
- "You send" amount input (decimal input)
- "They get" amount output (decimal input)
- Exchange rate display in body text: `1 {FROM} = {rate} {TO}`
- Send country selector: `div[data-testid="exchange-calculator-send-country-select"]`
- Receive country selector: `div[data-testid="exchange-calculator-receive-country-select"]`

**Interaction Flow**:
1. Navigate to `https://www.sendwave.com/en/`, wait `domcontentloaded`
2. Wait 3s for page to fully render
3. Dismiss cookie consent (`.osano-cm-accept-all` or `#onetrust-accept-btn-handler`)
4. Wait for `input[type="decimal"]` to appear
5. Click send country selector → opens MUI Drawer modal with autocomplete
6. Type country name in `input.MuiAutocomplete-input` → click matching `li.MuiAutocomplete-option`
7. Click receive country selector → opens MUI Drawer modal with autocomplete
8. Type country name in `input.MuiAutocomplete-input` → click matching `li.MuiAutocomplete-option`
9. Wait 2s for rate calculation to update
10. Extract rate from body text matching `1 {FROM} = {rate} {TO}`

**Country Mappings**:

| Currency | Send Country | Receive Country |
|----------|-------------|-----------------|
| CAD      | Canada      | —               |
| EUR      | Germany     | —               |
| GBP      | United Kingdom | —            |
| USD      | United States | —              |
| GHS      | —           | Ghana           |
| INR      | —           | India           |
| KES      | —           | Kenya           |
| MXN      | —           | Mexico          |
| NGN      | —           | Nigeria         |
| PHP      | —           | Philippines     |
| PKR      | —           | Pakistan        |

**Fallback**: If body text rate extraction fails, read the receive amount from the second `input[type="decimal"]` and compute `rate = receiveAmount / sendAmount`.

## Architecture

### File Structure

```
src/providers/sendwave.js
```

### Component Details

- **Module**: `src/providers/sendwave.js`
- **Exports**: `{ name: 'Sendwave', fetchRate(page, sendCurrency, receiveCurrency, sendAmount) }`
- **Dependencies**: `../config` (TIMEOUTS)
- **Strategy**: Interactive homepage calculator with MUI Drawer autocomplete selectors

## Tasks

- [x] Task 1: Implement homepage navigation and static rate extraction
- [x] Task 2: Implement interactive calculator interaction
- [x] Task 3: Add cookie consent dismissal
- [x] Task 4: Add currency selector interaction (MUI Drawer + autocomplete)
- [x] Task 5: Test with multiple pairs (USD→NGN, GBP→INR, EUR→GHS)
- [x] Task 6: Handle edge cases

## Success Criteria

- [x] All tasks completed
- [x] Rate extraction works for tested pairs (CAD→GHS=8.08, EUR→INR=109.97, GBP→KES=177.81, etc.)
- [x] Graceful fallback (calculator input parsing)

---

_Created: 2026-04-25_
