CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  credits_remaining INTEGER NOT NULL,
  last_reset_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS play_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS plays (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  token TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL,
  prize_pence INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prize_tiers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight > 0),
  prize_pence INTEGER NOT NULL,
  is_jackpot BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS jackpot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  amount_pence INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'claimed')),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ
);

INSERT INTO prize_tiers (id, name, weight, prize_pence, is_jackpot)
VALUES
  (1, 'lose', 70, 0, FALSE),
  (2, 'small', 25, 200, FALSE),
  (3, 'jackpot', 5, 100000000, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO jackpot (id, amount_pence, status)
VALUES (1, 100000000, 'available')
ON CONFLICT (id) DO NOTHING;
