---
workspace_name: "rates-fetcher"
spec_directory: "specifications/01-rates-fetcher"
feature_directory: "specifications/01-rates-fetcher/features/09-ria"
this_file: "specifications/01-rates-fetcher/features/09-ria/feature.md"

feature: "Ria Provider"
description: "Scraper for Ria (riamoneytransfer.com) — dynamically loaded calculator with HTML-first rate extraction"
status: complete
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

# Ria Provider

## Overview

Ria Money Transfer offers 42 currency pairs. Their homepage features a dynamically loaded calculator component (visible as skeleton loading elements in static HTML). No dedicated static converter page — rates are only available through the interactive calculator.

## Provider Details

- **Name**: Ria
- **Base URL**: https://www.riamoneytransfer.com
- **Calculator URL**: Homepage (`https://www.riamoneytransfer.com/en/us/` or similar locale path)
- **Pairs in CSV**: 42
- **Send currencies**: AUD, CAD, EUR, GBP, PLN, USD
- **Receive currencies**: GHS, INR, KES, MXN, NGN, PHP, PKR

## Scraping Strategy

### Priority 1: Static Page Read

Try the US locale homepage: `https://www.riamoneytransfer.com/en/us/`

Some rate information may be visible after JS rendering.

### Priority 2: Interactive Calculator (Fallback)

**Page Structure**:
- Next.js application with skeleton loading states
- Calculator component loads dynamically
- "Send amount" and "They receive" fields
- Country selectors

**Interaction Flow**:
1. Navigate to homepage, wait 5s (Next.js hydration)
2. Dismiss cookie consent
3. Wait for calculator skeleton to resolve
4. Find send country selector → select sendCurrency country
5. Find receive country selector → select receiveCurrency country
6. Fill send amount
7. Wait for rate calculation (3s)
8. Extract rate from displayed text

## Architecture

### File Structure

```
src/providers/ria.js
```

### Component Details

- **Module**: `src/providers/ria.js`
- **Exports**: `{ name: 'Ria', fetchRate(page, sendCurrency, receiveCurrency, sendAmount) }`
- **Dependencies**: `../config` (TIMEOUTS, CURRENCY_COUNTRY_MAP)
- **Strategy**: HTML-first extraction → input value fallback → regex fallback

### Special Considerations

- Next.js SPA — may require waiting for hydration
- Calculator loads as skeleton then populates
- 5s wait recommended for full render

### Rate Extraction Order

1. **HTML parsing**: `$('.result').text()` — reads `<p class="result">` containing `1.00000 USD = 1353.76857 NGN`
2. **Input value**: `$('#currencyTo').attr('value')` — receive amount field
3. **Regex fallback**: Tightened pattern on body text matching `1.0+ USD = {rate} CUR`

### Resolved Issues

- **Wrong rate from conversion table match** (2026-04-28): Regex `1[.,]?0+ USD` matched `1,000 USD = 1,578,XXX NGN` lines in the conversion table, returning the receive amount (~17) instead of the per-unit rate (~1,353). Fixed by switching to HTML-first extraction via `$('.result')` selector, with input value and regex as fallbacks.

### Send Currency Grouping Optimization

CSV pairs are grouped by send currency (AUD→*, CAD→*, EUR→*, etc.). Provider tracks `currentPage` and `currentSendCurrency` at module level:
- Skips page navigation when already on the correct page (`currentPage` matches requested currency)
- Only clicks the send currency dropdown when `currentSendCurrency` differs from the requested send currency
- Saves ~5s per pair within the same send-currency group by avoiding redundant dropdown clicks

## Tasks

- [ ] Task 1: Implement static page navigation
- [ ] Task 2: Implement calculator interaction flow
- [ ] Task 3: Add Next.js hydration wait
- [ ] Task 4: Add cookie consent dismissal
- [ ] Task 5: Test with multiple pairs
- [ ] Task 6: Handle edge cases

## Success Criteria

- [ ] All tasks completed
- [ ] Rate extraction works for tested pairs
- [ ] Next.js hydration handled properly

---

_Created: 2026-04-25_
