package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/config"
	"online-exam-system/server/internal/database"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("load config failed", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("connect database failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		slog.Error("begin transaction failed", "error", err)
		os.Exit(1)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var orgID string
	err = tx.QueryRow(ctx, `SELECT id::text FROM organizations ORDER BY created_at LIMIT 1`).Scan(&orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `INSERT INTO organizations (name) VALUES ($1) RETURNING id::text`, "示范教育培训机构").Scan(&orgID)
	}
	if err != nil {
		slog.Error("ensure organization failed", "error", err)
		os.Exit(1)
	}
	slog.Info("organization ready", "org_id", orgID)

	// Notification templates are part of a usable install: 0007 could only seed the
	// organisations that existed at migration time, so seed them for this one as well.
	if _, err := tx.Exec(ctx, `
		INSERT INTO notification_templates (org_id, channel, code, title_tpl, content_tpl, enabled)
		VALUES
			($1, 'inapp', 'exam_publish', '考试发布：{exam}', '考试时间 {start_at} 至 {end_at}，限时 {duration} 分钟，请按时参加。', TRUE),
			($1, 'inapp', 'score_publish', '成绩发布', '《{exam}》成绩已公布，得分 {total} 分。', TRUE),
			($1, 'inapp', 'score_adjust', '成绩更正', '成绩已更正：当前 {total} 分（原 {before} 分）。如有疑问可在“我的成绩”提交申诉。', TRUE),
			($1, 'inapp', 'score_appeal', '成绩申诉结果', '成绩申诉{verdict}：{note}。当前得分 {total} 分。', TRUE),
			($1, 'inapp', 'review_pending', '有新的阅卷任务', '《{exam}》有 {count} 份答卷等待批阅，请尽快处理。', TRUE)
		ON CONFLICT (org_id, code, channel) DO NOTHING`, orgID); err != nil {
		slog.Error("seed notification templates failed", "error", err)
		os.Exit(1)
	}

	var adminID string
	err = tx.QueryRow(ctx, `SELECT id::text FROM users WHERE org_id = $1 AND username = 'admin'`, orgID).Scan(&adminID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		hash, hashErr := auth.HashPassword(cfg.SeedAdminPassword)
		if hashErr != nil {
			slog.Error("hash seed password failed", "error", hashErr)
			os.Exit(1)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO users (org_id, name, username, phone, email, password_hash, role, data_scope, status)
			VALUES ($1, '系统管理员', 'admin', '13800000000', '', $2, 'org_admin', 'org', 'active')`,
			orgID, hash)
		if err != nil {
			slog.Error("create admin failed", "error", err)
			os.Exit(1)
		}
		slog.Info("admin user created", "username", "admin")
	case err != nil:
		slog.Error("lookup admin failed", "error", err)
		os.Exit(1)
	default:
		slog.Info("admin user already exists", "username", "admin", "user_id", adminID)
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("commit seed failed", "error", err)
		os.Exit(1)
	}
	if cfg.SeedAdminPassword == "Admin@123456" {
		slog.Warn("seed admin is using the default password, change it outside development")
	}
}
