-- Keep the original migration immutable: it is already applied in production.
-- Old in-flight attempts deliberately lack the client proof and cannot finish.
ALTER TABLE oauth_states ADD COLUMN client_challenge TEXT;
ALTER TABLE oauth_states ADD COLUMN client_state TEXT;

-- A callback URL carries only this short-lived, single-use code. It is useless
-- without the verifier retained in the initiating website tab's sessionStorage.
CREATE TABLE login_exchanges (
  code_hash TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL REFERENCES users(github_id) ON DELETE CASCADE,
  client_challenge TEXT NOT NULL,
  client_state TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_exchanges_expiry_idx ON login_exchanges(expires_at);
