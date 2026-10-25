CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS workflows (
 id text PRIMARY KEY, version integer NOT NULL, definition jsonb NOT NULL,
 next_schedule_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS runs (
 id text PRIMARY KEY, workflow_id text NOT NULL REFERENCES workflows(id),
 snapshot jsonb NOT NULL, status text NOT NULL, priority integer NOT NULL DEFAULT 0,
 idempotency_key text, source text NOT NULL, next_at timestamptz NOT NULL DEFAULT now(),
 lease_owner text, lease_until timestamptz, fence bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(workflow_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS runs_queue_idx ON runs (priority DESC, next_at, created_at) WHERE status IN ('queued','running','waiting');
CREATE INDEX IF NOT EXISTS runs_workflow_idx ON runs(workflow_id,created_at DESC);
CREATE INDEX IF NOT EXISTS runs_active_workflow_idx ON runs(workflow_id,status,next_at) WHERE status IN ('queued','running','waiting');
CREATE TABLE IF NOT EXISTS run_events (
 id bigserial PRIMARY KEY, run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
 step_id text NOT NULL DEFAULT '', type text NOT NULL, message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS run_events_run_idx ON run_events(run_id,id);
CREATE TABLE IF NOT EXISTS callbacks (
 run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE, step_id text NOT NULL,
 attempt integer NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending', output jsonb, error text NOT NULL DEFAULT '',
 PRIMARY KEY(run_id,step_id,attempt)
);
INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
