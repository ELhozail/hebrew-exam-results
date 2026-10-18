-- No plaintext Israeli identity numbers are stored. Only keyed HMAC hashes.
CREATE TABLE IF NOT EXISTS students (
  id_hash TEXT PRIMARY KEY NOT NULL,
  student_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('B1','NOT_IN_PROGRAM')),
  pin_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attempts (
  ip_hash TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
