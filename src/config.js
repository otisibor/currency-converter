const SEND_AMOUNT = 1000;

const CURRENCY_COUNTRY_MAP = {
  AED: { code: 'AE', name: 'United Arab Emirates', slug: 'united-arab-emirates' },
  AUD: { code: 'AU', name: 'Australia', slug: 'australia' },
  CAD: { code: 'CA', name: 'Canada', slug: 'canada' },
  EUR: { code: 'DE', name: 'Germany', slug: 'germany' },
  GBP: { code: 'GB', name: 'United Kingdom', slug: 'united-kingdom' },
  PLN: { code: 'PL', name: 'Poland', slug: 'poland' },
  USD: { code: 'US', name: 'United States', slug: 'united-states' },
  GHS: { code: 'GH', name: 'Ghana', slug: 'ghana' },
  INR: { code: 'IN', name: 'India', slug: 'india' },
  KES: { code: 'KE', name: 'Kenya', slug: 'kenya' },
  MXN: { code: 'MX', name: 'Mexico', slug: 'mexico' },
  NGN: { code: 'NG', name: 'Nigeria', slug: 'nigeria' },
  PHP: { code: 'PH', name: 'Philippines', slug: 'philippines' },
  PKR: { code: 'PK', name: 'Pakistan', slug: 'pakistan' },
};

const BROWSER_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
  ],
};

const CONTEXT_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  viewport: { width: 800, height: 800 },
  locale: 'en-US',
};

const TIMEOUTS = {
  navigation: 30000,
  element: 15000,
  betweenRequests: 2000,
};

module.exports = {
  SEND_AMOUNT,
  CURRENCY_COUNTRY_MAP,
  BROWSER_OPTIONS,
  CONTEXT_OPTIONS,
  TIMEOUTS,
};
