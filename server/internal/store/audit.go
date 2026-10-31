package store

import (
	"context"
	"encoding/json"
	"fmt"
)

type AuditEntry struct {
	OrgID      string
	ActorID    string
	Action     string
	TargetType string
	TargetID   string
	Detail     map[string]any
	IP         string
	UserAgent  string
}

func (s *Store) InsertAudit(ctx context.Context, e AuditEntry) error {
	detail := e.Detail
	if detail == nil {
		detail = map[string]any{}
	}
	raw, err := json.Marshal(detail)
	if err != nil {
		return fmt.Errorf("marshal audit detail: %w", err)
	}
	if len(e.IP) > 128 {
		e.IP = e.IP[:128]
	}
	if len(e.UserAgent) > 512 {
		e.UserAgent = e.UserAgent[:512]
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO audit_logs (org_id, actor_id, action, target_type, target_id, detail, ip, user_agent)
		VALUES (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6::jsonb, $7, $8)`,
		e.OrgID, e.ActorID, e.Action, e.TargetType, e.TargetID, string(raw), e.IP, e.UserAgent,
	)
	if err != nil {
		return fmt.Errorf("insert audit log: %w", err)
	}
	return nil
}
