---
workspace_name: "rates-fetcher"
spec_directory: "specifications/01-rates-fetcher"
feature_directory: "specifications/01-rates-fetcher/features/04-worldremit"
this_file: "specifications/01-rates-fetcher/features/04-worldremit/feature.md"

feature: "WorldRemit Provider"
description: "Scraper for WorldRemit (worldremit.com) — interactive currency converter calculator with correct selectors"
status: completed
priority: high
created: 2026-04-25
last_updated: 2026-04-25
author: "Main Agent"

depends_on: ["01-scraper-engine"]

tasks:
  completed: 6
  uncompleted: 0
  total: 6
  completion_percentage: 100
---

# WorldRemit Provider

## Overview

WorldRemit offers currency conversion for 42 currency pairs. The converter at `/en/currency-converter` has an interactive calculator widget. The page uses MUI (Material UI) Autocomplete components for currency selection.

## Provider Details

- **Name**: WorldRemit
- **Base URL**: https://www.worldremit.com
- **Converter URL**: `https://www.worldremit.com/en/currency-converter`
- **Pairs in CSV**: 42
- **Send currencies**: AUD, CAD, EUR, GBP, PLN, USD
- **Receive currencies**: GHS, INR, KES, MXN, NGN, PHP, PKR

## Page Structure (Verified)

The calculator uses MUI Autocomplete with this structure:

```
[data-testid="calculator-v2-send-country-select"]     → Button showing current send currency (e.g. "GBP")
  → opens popup containing:
    #calculator-v2-send-country-search-input           → Search input (type="text", autocomplete)
    #calculator-v2-send-country-search-input-listbox   → <ul role="listbox"> with <li role="option"> items

[data-testid="calculator-v2-receive-country-select"]   → Button showing current receive currency (e.g. "PHP")
  → opens popup containing:
    #calculator-v2-receive-country-search-input        → Search input
    #calculator-v2-receive-country-search-input-listbox → <ul role="listbox"> with <li> items

input[aria-label="pricing-calculator-input-label"]     → Calculator inputs (2 visible)
  → [0]: Send amount (editable)
  → [1]: Receive amount (read-only, auto-calculated)

input[name="Receive method"]                           → Receive method selector (Bank Transfer, Mobile Money, Airtime, etc.)
```

## Scraping Strategy

### Priority 1: Interactive Calculator (Primary & Only Approach)

WorldRemit's converter does NOT support URL parameters for currency pairs. All selections must be made interactively.

**Interaction Flow**:
1. Navigate to `https://www.worldremit.com/en/currency-converter`
2. Wait 4s for page load
3. Dismiss cookie consent (`#onetrust-accept-btn-handler`)
4. Wait 1s
5. **Select send currency**:
   - Click `[data-testid="calculator-v2-send-country-select"]`
   - Fill `#calculator-v2-send-country-search-input` with currency code (e.g. "USD")
   - Wait 800ms for filter
   - Click first `<li>` inside `#calculator-v2-send-country-search-input-listbox`
   - Wait 3s for rate to recalculate
6. **Select receive currency**:
   - Click `[data-testid="calculator-v2-receive-country-select"]`
   - Fill `#calculator-v2-receive-country-search-input` with currency code (e.g. "NGN")
   - Wait 800ms for filter
   - Click first `<li>` inside `#calculator-v2-receive-country-search-input-listbox`
   - Wait 3s for rate to recalculate
7. **Set send amount**:
   - Fill first `input[aria-label="pricing-calculator-input-label"]` with sendAmount
   - Wait 3s for calculation
8. **Read receive amount**:
   - Get value of second `input[aria-label="pricing-calculator-input-label"]`
   - Calculate rate: receiveAmount / sendAmount

**Data Extraction**:
- **Exchange rate**: `recvAmt / sendAmt` from calculator inputs
- **Receive amount**: Value of second pricing-calculator-input-label input
- **Fee**: Not reliably extractable from inputs (returns null)

**Skip condition**: If `input[name="Receive method"]` value contains "Airtime", skip this pair (app-only, requires mobile app).

## Verified Rates (2026-04-25)

| Send | Receive | Rate |
|------|---------|------|
| USD | NGN | 1377.063 |
| USD | INR | 93.883 |
| USD | GHS | 11.09 |

## Architecture

### File Structure

```
src/providers/worldremit.js
```

### Component Details

- **Module**: `src/providers/worldremit.js`
- **Exports**: `{ name: 'WorldRemit', fetchRate(page, sendCurrency, receiveCurrency, sendAmount) }`
- **Dependencies**: `../config` (TIMEOUTS)
- **Strategy**: Interactive calculator only (no static URL support)

### Key Selectors

| Purpose | Selector |
|---------|----------|
| Send currency button | `[data-testid="calculator-v2-send-country-select"]` |
| Send currency search input | `#calculator-v2-send-country-search-input` |
| Send currency listbox | `#calculator-v2-send-country-search-input-listbox` |
| Receive currency button | `[data-testid="calculator-v2-receive-country-select"]` |
| Receive currency search input | `#calculator-v2-receive-country-search-input` |
| Receive currency listbox | `#calculator-v2-receive-country-search-input-listbox` |
| Calculator inputs | `input[aria-label="pricing-calculator-input-label"]` |
| Receive method | `input[name="Receive method"]` |

### Cookie/Consent Handling

WorldRemit uses OneTrust:
- Try: `#onetrust-accept-btn-handler`, `button:has-text("Accept")`, `button:has-text("Got it")`

### Important Learnings

1. **MUI Autocomplete options are links (`<a>` tags inside `<li>`)** — Playwright's `.click()` on `<li>` activates the link and navigates away. Use the correct listbox selector and click the `<li>` directly.
2. **No URL parameters** — WorldRemit doesn't support query params for currency selection. Interactive flow is the only approach.
3. **Two calculator inputs** — First is editable (send amount), second is read-only (receive amount). Rate = input[1] / input[0].
4. **Airtime receive method** — Some corridors only support "Airtime" (mobile app). Detect via `input[name="Receive method"]` value and skip.
5. **Wait 3s after currency selection** — The rate takes ~2-3 seconds to recalculate after selecting a new currency.
6. **Cookie banner** — Standard OneTrust banner, dismiss early.

## Tasks

- [x] Task 1: Identify correct MUI Autocomplete selectors for currency selection
- [x] Task 2: Implement interactive currency selection flow (send + receive)
- [x] Task 3: Read rate from calculator input values (not regex on body text)
- [x] Task 4: Add cookie consent dismissal
- [x] Task 5: Handle Airtime receive method (skip with note)
- [x] Task 6: Test with multiple pairs (USD→NGN, USD→INR, USD→GHS)

## Testing

### Test Cases

1. **Rate extraction — standard pair**
   - Given: Calculator loaded, USD→NGN, amount=1000
   - When: `fetchRate` completes
   - Then: Returns exchangeRate ≈ 1377

2. **Airtime detection**
   - Given: Corridor only supports Airtime receive
   - When: `fetchRate` called
   - Then: Returns null with note indicating app-only

3. **Edge case — unsupported corridor**
   - Given: Currency not supported by WorldRemit
   - When: `fetchRate` called
   - Then: Returns null values gracefully

## Success Criteria

- [x] All tasks completed
- [x] Interactive calculator works for tested pairs
- [x] Correct selectors identified and documented
- [x] Airtime corridors detected and skipped
- [x] No crashes on unsupported corridors

---

_Created: 2026-04-25_
