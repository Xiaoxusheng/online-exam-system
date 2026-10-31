package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultDevJWTSecret = "dev-only-insecure-secret-change-me"
	defaultDatabaseURL  = "postgres://postgres@127.0.0.1:5432/online_exam?sslmode=disable"
)

type Config struct {
	Env               string
	HTTPAddr          string
	DatabaseURL       string
	JWTSecret         string
	JWTTTL            time.Duration
	CORSOrigins       []string
	LogLevel          string
	MaxBodyBytes      int64
	SeedAdminPassword string
}

func Load() (Config, error) {
	cfg := Config{
		Env:               getEnv("APP_ENV", "dev"),
		HTTPAddr:          getEnv("HTTP_ADDR", ":8081"),
		DatabaseURL:       getEnv("DATABASE_URL", defaultDatabaseURL),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		JWTTTL:            8 * time.Hour,
		CORSOrigins:       splitTrim(getEnv("CORS_ORIGINS", "http://127.0.0.1:5174,http://localhost:5174")),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		MaxBodyBytes:      1 << 20,
		SeedAdminPassword: getEnv("SEED_ADMIN_PASSWORD", "Admin@123456"),
	}

	switch cfg.Env {
	case "dev", "test", "release":
	default:
		return cfg, fmt.Errorf("invalid APP_ENV %q (want dev, test or release)", cfg.Env)
	}

	if cfg.JWTSecret == "" {
		if cfg.Env == "release" {
			return cfg, fmt.Errorf("JWT_SECRET is required when APP_ENV=release")
		}
		cfg.JWTSecret = DefaultDevJWTSecret
	}
	if len(cfg.JWTSecret) < 32 && cfg.Env == "release" {
		return cfg, fmt.Errorf("JWT_SECRET must be at least 32 bytes in release mode")
	}

	if v := os.Getenv("JWT_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return cfg, fmt.Errorf("invalid JWT_TTL %q", v)
		}
		cfg.JWTTTL = d
	}
	if v := os.Getenv("MAX_BODY_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return cfg, fmt.Errorf("invalid MAX_BODY_BYTES %q", v)
		}
		cfg.MaxBodyBytes = n
	}
	return cfg, nil
}

func (c Config) IsDev() bool { return c.Env == "dev" }

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func splitTrim(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
