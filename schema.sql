CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  send_currency TEXT NOT NULL,
  receive_currency TEXT NOT NULL,
  send_amount REAL,
  exchange_rate REAL,
  receive_amount REAL,
  fee REAL,
  timestamp TEXT NOT NULL,
  success INTEGER NOT NULL,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_time ON exchange_rates(provider, timestamp);
CREATE INDEX IF NOT EXISTS idx_pair ON exchange_rates(send_currency, receive_currency, timestamp);
CREATE INDEX IF NOT EXISTS idx_timestamp ON exchange_rates(timestamp);
