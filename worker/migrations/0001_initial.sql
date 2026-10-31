PRAGMA foreign_keys = ON;

CREATE TABLE users (
  github_id INTEGER PRIMARY KEY CHECK (github_id > 0),
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL REFERENCES users(github_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX sessions_user_idx ON sessions(github_id);

-- A single-use authorization attempt. Only the initiating browser's secret
-- binding cookie can consume it. GitHub access tokens are never stored.
CREATE TABLE oauth_states (
  nonce_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry_idx ON oauth_states(expires_at);

CREATE TABLE favorites (
  github_id INTEGER NOT NULL REFERENCES users(github_id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL CHECK (repo_id > 0 AND repo_id <= 9007199254740991),
  repository TEXT NOT NULL CHECK (json_valid(repository) AND json_type(repository) = 'object' AND length(CAST(repository AS BLOB)) <= 32768),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (github_id, repo_id)
);

-- Import receipts make retries of the one-time local migration safe, even if
-- the original response was lost and a favorite was subsequently removed.
CREATE TABLE favorite_imports (
  github_id INTEGER NOT NULL REFERENCES users(github_id) ON DELETE CASCADE,
  batch_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (github_id, batch_key)
);
