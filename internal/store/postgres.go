package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/WeFode/go-flowforge/pkg/workflow"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed schema.sql
var schema string
var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("version or state conflict")
var ErrLeaseLost = errors.New("execution lease lost")
var ErrHistory = errors.New("workflow has execution history; disable it instead")

type Store struct{ DB *sql.DB }

func Open(ctx context.Context, dsn string, connections int) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(connections)
	db.SetMaxIdleConns(connections / 2)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}
func (s *Store) Migrate(ctx context.Context) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(76543101)"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, schema); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) PutWorkflow(ctx context.Context, d workflow.Definition, create bool) (workflow.Definition, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return d, err
	}
	defer tx.Rollback()
	var version int
	err = tx.QueryRowContext(ctx, "SELECT version FROM workflows WHERE id=$1 FOR UPDATE", d.ID).Scan(&version)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return d, err
	}
	if (create && version > 0) || (!create && version != d.Version) {
		return d, ErrConflict
	}
	if !create && version == 0 {
		return d, ErrNotFound
	}
	d.Version = version + 1
	var next *time.Time
	if d.Enabled && d.Schedule != nil {
		n, e := d.Schedule.Next(time.Now())
		if e != nil {
			return d, e
		}
		next = &n
	}
	b, err := json.Marshal(d)
	if err != nil {
		return d, err
	}
	if create {
		var result sql.Result
		result, err = tx.ExecContext(ctx, "INSERT INTO workflows(id,version,definition,next_schedule_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", d.ID, d.Version, b, next)
		if err == nil {
			n, _ := result.RowsAffected()
			if n == 0 {
				return d, ErrConflict
			}
		}
	} else {
		_, err = tx.ExecContext(ctx, "UPDATE workflows SET version=$2,definition=$3,next_schedule_at=$4,updated_at=now() WHERE id=$1", d.ID, d.Version, b, next)
	}
	if err != nil {
		return d, err
	}
	return d, tx.Commit()
}
func (s *Store) Workflow(ctx context.Context, id string) (workflow.Definition, error) {
	var d workflow.Definition
	var b []byte
	err := s.DB.QueryRowContext(ctx, "SELECT definition FROM workflows WHERE id=$1", id).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return d, ErrNotFound
	}
	if err != nil {
		return d, err
	}
	err = json.Unmarshal(b, &d)
	d.Normalize()
	return d, err
}

// DeleteWorkflow removes only unused definitions. Execution history must never be silently orphaned.
func (s *Store) DeleteWorkflow(ctx context.Context, id string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var locked string
	if err = tx.QueryRowContext(ctx, "SELECT id FROM workflows WHERE id=$1 FOR UPDATE", id).Scan(&locked); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	var used bool
	if err = tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM runs WHERE workflow_id=$1)", id).Scan(&used); err != nil {
		return err
	}
	if used {
		return ErrHistory
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM workflows WHERE id=$1", id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) Workflows(ctx context.Context) ([]workflow.Definition, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT definition FROM workflows ORDER BY updated_at DESC LIMIT 1000")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []workflow.Definition{}
	for rows.Next() {
		var b []byte
		if err = rows.Scan(&b); err != nil {
			return nil, err
		}
		var d workflow.Definition
		if err = json.Unmarshal(b, &d); err != nil {
			return nil, err
		}
		d.Normalize()
		list = append(list, d)
	}
	return list, rows.Err()
}
func newRun(d workflow.Definition, input map[string]any, source string, priority int, at time.Time) workflow.Run {
	if input == nil {
		input = map[string]any{}
	}
	r := workflow.Run{ID: workflow.NewID(), WorkflowID: d.ID, Definition: d, Input: input, Status: "queued", Source: source, Priority: priority, CreatedAt: time.Now().UTC(), NextAt: at, Steps: map[string]*workflow.StepState{}}
	for _, step := range d.Steps {
		r.Steps[step.ID] = &workflow.StepState{Status: "pending"}
	}
	return r
}
func insertRun(ctx context.Context, tx *sql.Tx, r workflow.Run, key string) (workflow.Run, bool, error) {
	b, err := json.Marshal(r)
	if err != nil {
		return r, false, err
	}
	var nullableKey any
	if key != "" {
		nullableKey = key
	}
	result, err := tx.ExecContext(ctx, "INSERT INTO runs(id,workflow_id,snapshot,status,priority,idempotency_key,source,next_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workflow_id,idempotency_key) DO NOTHING", r.ID, r.WorkflowID, b, r.Status, r.Priority, nullableKey, r.Source, r.NextAt, r.CreatedAt)
	if err != nil {
		return r, false, err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		var old []byte
		err = tx.QueryRowContext(ctx, "SELECT snapshot FROM runs WHERE workflow_id=$1 AND idempotency_key=$2", r.WorkflowID, key).Scan(&old)
		if err != nil {
			return r, false, err
		}
		err = json.Unmarshal(old, &r)
		return r, false, err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO run_events(run_id,type,message) VALUES($1,'run.queued',$2)", r.ID, r.Source)
	return r, true, err
}
func (s *Store) Enqueue(ctx context.Context, id string, input map[string]any, source, key string, priority int, at time.Time) (workflow.Run, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return workflow.Run{}, err
	}
	defer tx.Rollback()
	var b []byte
	err = tx.QueryRowContext(ctx, "SELECT definition FROM workflows WHERE id=$1 FOR SHARE", id).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return workflow.Run{}, ErrNotFound
	}
	if err != nil {
		return workflow.Run{}, err
	}
	var d workflow.Definition
	if err = json.Unmarshal(b, &d); err != nil {
		return workflow.Run{}, err
	}
	if !d.Enabled {
		return workflow.Run{}, fmt.Errorf("workflow is disabled: %w", ErrConflict)
	}
	r, _, err := insertRun(ctx, tx, newRun(d, input, source, priority, at), key)
	if err != nil {
		return r, err
	}
	return r, tx.Commit()
}

// ScheduleTick atomically advances a schedule and enqueues one occurrence. Missed occurrences coalesce into one run.
func (s *Store) ScheduleTick(ctx context.Context) error {
	for range 32 {
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		var b []byte
		var due time.Time
		err = tx.QueryRowContext(ctx, "SELECT definition,next_schedule_at FROM workflows WHERE next_schedule_at<=now() ORDER BY next_schedule_at FOR UPDATE SKIP LOCKED LIMIT 1").Scan(&b, &due)
		if errors.Is(err, sql.ErrNoRows) {
			tx.Rollback()
			return nil
		}
		if err != nil {
			tx.Rollback()
			return err
		}
		var d workflow.Definition
		if err = json.Unmarshal(b, &d); err != nil {
			tx.Rollback()
			return err
		}
		next, err := d.Schedule.Next(time.Now())
		if err == nil {
			_, _, err = insertRun(ctx, tx, newRun(d, map[string]any{"scheduled_at": due.Format(time.RFC3339)}, "schedule", 0, time.Now()), "schedule:"+due.UTC().Format(time.RFC3339Nano))
		}
		if err == nil {
			_, err = tx.ExecContext(ctx, "UPDATE workflows SET next_schedule_at=$2 WHERE id=$1", d.ID, next)
		}
		if err != nil {
			tx.Rollback()
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
func (s *Store) Claim(ctx context.Context, owner string, lease time.Duration) (*workflow.Run, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var id string
	var maxActive int
	err = tx.QueryRowContext(ctx, `
 SELECT w.id,(w.definition->>'max_active_runs')::int FROM workflows w
 WHERE EXISTS (
   SELECT 1 FROM runs r WHERE r.workflow_id=w.id AND r.status IN ('queued','running','waiting')
   AND r.next_at<=now() AND (r.lease_until IS NULL OR r.lease_until<now())
   AND (r.status IN ('running','waiting') OR (
     SELECT count(*) FROM runs a WHERE a.workflow_id=w.id
     AND (a.status IN ('running','waiting') OR (a.status='queued' AND a.lease_until>now()))
   ) < (w.definition->>'max_active_runs')::int)
 ) ORDER BY (SELECT min(next_at) FROM runs r WHERE r.workflow_id=w.id AND r.status IN ('queued','running','waiting'))
 FOR UPDATE OF w SKIP LOCKED LIMIT 1`).Scan(&id, &maxActive)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var count int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM runs WHERE workflow_id=$1 AND (status IN ('running','waiting') OR (status='queued' AND lease_until>now()))", id).Scan(&count); err != nil {
		return nil, err
	}
	var b []byte
	r := &workflow.Run{}
	err = tx.QueryRowContext(ctx, `UPDATE runs SET lease_owner=$2,lease_until=now()+$3*interval '1 second',fence=fence+1 WHERE id=(SELECT id FROM runs WHERE workflow_id=$1 AND status IN ('queued','running','waiting') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND (status IN ('running','waiting') OR $4) ORDER BY priority DESC,next_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING snapshot,fence`, id, owner, lease.Seconds(), count < maxActive).Scan(&b, &r.Fence)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(b, r); err != nil {
		return nil, err
	}
	r.Owner = owner
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return r, nil
}
func (s *Store) Renew(ctx context.Context, r *workflow.Run, lease time.Duration) error {
	result, err := s.DB.ExecContext(ctx, "UPDATE runs SET lease_until=now()+$4*interval '1 second' WHERE id=$1 AND lease_owner=$2 AND fence=$3 AND lease_until>now() AND status IN ('queued','running','waiting')", r.ID, r.Owner, r.Fence, lease.Seconds())
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return ErrLeaseLost
	}
	return nil
}
func (s *Store) Save(ctx context.Context, r *workflow.Run, release bool, events ...workflow.Event) error {
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE runs SET snapshot=$4,status=$5,next_at=$6,finished_at=$7,lease_owner=CASE WHEN $8 THEN NULL ELSE lease_owner END,lease_until=CASE WHEN $8 THEN NULL ELSE lease_until END WHERE id=$1 AND lease_owner=$2 AND fence=$3 AND lease_until>now() AND status IN ('queued','running','waiting')`, r.ID, r.Owner, r.Fence, b, r.Status, r.NextAt, r.FinishedAt, release)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return ErrLeaseLost
	}
	// Use a separate statement after acquiring the run row lock. A callback that
	// committed before this transaction is visible here; one waiting on our row
	// lock will move next_at forward after we commit. Neither wakeup can be lost.
	if _, err = tx.ExecContext(ctx, `UPDATE runs r SET next_at=LEAST(r.next_at,now()) WHERE r.id=$1 AND EXISTS (
 SELECT 1 FROM callbacks c WHERE c.run_id=r.id AND c.status IN ('succeeded','failed')
 AND c.attempt=(r.snapshot->'steps'->c.step_id->>'attempts')::int
 AND r.snapshot->'steps'->c.step_id->>'status'='waiting_callback')`, r.ID); err != nil {
		return err
	}
	for _, e := range events {
		if _, err = tx.ExecContext(ctx, "INSERT INTO run_events(run_id,step_id,type,message) VALUES($1,$2,$3,$4)", r.ID, e.StepID, e.Type, e.Message); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func scanRun(row interface{ Scan(...any) error }) (workflow.Run, error) {
	var r workflow.Run
	var b []byte
	var status string
	err := row.Scan(&b, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	if err != nil {
		return r, err
	}
	err = json.Unmarshal(b, &r)
	r.Definition.Normalize()
	r.Status = status
	return r, err
}
func (s *Store) Run(ctx context.Context, id string) (workflow.Run, error) {
	return scanRun(s.DB.QueryRowContext(ctx, "SELECT snapshot,status FROM runs WHERE id=$1", id))
}
func (s *Store) Runs(ctx context.Context, workflowID, status string, limit, offset int) ([]workflow.Run, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT snapshot,status FROM runs WHERE ($1='' OR workflow_id=$1) AND ($2='' OR status=$2) ORDER BY created_at DESC LIMIT $3 OFFSET $4", workflowID, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []workflow.Run{}
	for rows.Next() {
		r, e := scanRun(rows)
		if e != nil {
			return nil, e
		}
		list = append(list, r)
	}
	return list, rows.Err()
}
func (s *Store) Cancel(ctx context.Context, id string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	r, err := scanRun(tx.QueryRowContext(ctx, "SELECT snapshot,status FROM runs WHERE id=$1 FOR UPDATE", id))
	if err != nil {
		return err
	}
	if workflow.Terminal(r.Status) {
		return ErrConflict
	}
	now := time.Now().UTC()
	r.Status = "cancelled"
	r.FinishedAt = &now
	for _, state := range r.Steps {
		if !workflow.Terminal(state.Status) {
			state.Status = "cancelled"
			state.FinishedAt = &now
		}
	}
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE runs SET snapshot=$2,status='cancelled',finished_at=now(),lease_until=NULL,lease_owner=NULL,fence=fence+1 WHERE id=$1", id, b); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO run_events(run_id,type,message) VALUES($1,'run.cancelled','cancelled by API')", id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) Replay(ctx context.Context, id, key string) (workflow.Run, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return workflow.Run{}, err
	}
	defer tx.Rollback()
	old, err := scanRun(tx.QueryRowContext(ctx, "SELECT snapshot,status FROM runs WHERE id=$1 FOR SHARE", id))
	if err != nil {
		return old, err
	}
	if !workflow.Terminal(old.Status) {
		return old, ErrConflict
	}
	r, _, err := insertRun(ctx, tx, newRun(old.Definition, old.Input, "replay:"+id, old.Priority, time.Now()), key)
	if err != nil {
		return r, err
	}
	return r, tx.Commit()
}
func (s *Store) Events(ctx context.Context, id string, after int64) ([]workflow.Event, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT id,run_id,step_id,type,message,created_at FROM run_events WHERE run_id=$1 AND id>$2 ORDER BY id LIMIT 1000", id, after)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []workflow.Event{}
	for rows.Next() {
		var e workflow.Event
		if err = rows.Scan(&e.ID, &e.RunID, &e.StepID, &e.Type, &e.Message, &e.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, rows.Err()
}
func TokenHash(token string) string {
	b := sha256.Sum256([]byte(token))
	return hex.EncodeToString(b[:])
}
func (s *Store) PrepareCallback(ctx context.Context, r *workflow.Run, stepID, token string, expires time.Time) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO callbacks(run_id,step_id,attempt,token_hash,expires_at) SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM runs WHERE id=$1 AND lease_owner=$6 AND fence=$7 AND lease_until>now() AND status IN ('queued','running','waiting'))`, r.ID, stepID, r.Steps[stepID].Attempts, TokenHash(token), expires, r.Owner, r.Fence)
	return err
}
func (s *Store) CallbackResult(ctx context.Context, r *workflow.Run, id string) (string, any, string, error) {
	var status, message string
	var b []byte
	err := s.DB.QueryRowContext(ctx, "SELECT status,output,error FROM callbacks WHERE run_id=$1 AND step_id=$2 AND attempt=$3", r.ID, id, r.Steps[id].Attempts).Scan(&status, &b, &message)
	if errors.Is(err, sql.ErrNoRows) {
		return "pending", nil, "", nil
	}
	if err != nil {
		return "", nil, "", err
	}
	var output any
	if len(b) > 0 {
		err = json.Unmarshal(b, &output)
	}
	return status, output, message, err
}
func (s *Store) CompleteCallback(ctx context.Context, token, status string, output any, message string) error {
	b, err := json.Marshal(output)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var runID, stepID, old string
	var attempt int
	err = tx.QueryRowContext(ctx, "SELECT run_id,step_id,attempt,status FROM callbacks WHERE token_hash=$1 AND expires_at>now() FOR UPDATE", TokenHash(token)).Scan(&runID, &stepID, &attempt, &old)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	r, err := scanRun(tx.QueryRowContext(ctx, "SELECT snapshot,status FROM runs WHERE id=$1 FOR UPDATE", runID))
	if err != nil {
		return err
	}
	if old != "pending" {
		if old == status {
			return nil
		}
		return ErrConflict
	}
	state := r.Steps[stepID]
	if workflow.Terminal(r.Status) || state == nil || state.Attempts != attempt || state.Status != "waiting_callback" {
		return ErrConflict
	}
	if _, err = tx.ExecContext(ctx, "UPDATE callbacks SET status=$2,output=$3,error=$4 WHERE token_hash=$1", TokenHash(token), status, b, message); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE runs SET next_at=LEAST(next_at,now()) WHERE id=$1", runID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) Stats(ctx context.Context) (map[string]int64, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT status,count(*) FROM runs GROUP BY status")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]int64{}
	for rows.Next() {
		var status string
		var n int64
		if err = rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		result[status] = n
	}
	return result, rows.Err()
}
