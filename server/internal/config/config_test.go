package config

import (
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_TTL", "")
	t.Setenv("CORS_ORIGINS", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load defaults: %v", err)
	}
	if cfg.Env != "dev" || cfg.HTTPAddr != ":8081" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.JWTSecret != DefaultDevJWTSecret {
		t.Fatal("expected development JWT secret fallback")
	}
	if cfg.JWTTTL != 8*time.Hour {
		t.Fatalf("unexpected token ttl: %v", cfg.JWTTTL)
	}
	if len(cfg.CORSOrigins) != 2 {
		t.Fatalf("unexpected cors origins: %v", cfg.CORSOrigins)
	}
}

func TestLoadReleaseRequiresSecret(t *testing.T) {
	t.Setenv("APP_ENV", "release")
	t.Setenv("JWT_SECRET", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected release mode without JWT_SECRET to fail")
	}
}

func TestLoadRejectsShortReleaseSecret(t *testing.T) {
	t.Setenv("APP_ENV", "release")
	t.Setenv("JWT_SECRET", "too-short")

	if _, err := Load(); err == nil {
		t.Fatal("expected short JWT_SECRET in release mode to fail")
	}
}

func TestLoadRejectsInvalidTTL(t *testing.T) {
	t.Setenv("APP_ENV", "dev")
	t.Setenv("JWT_TTL", "not-a-duration")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid JWT_TTL to fail")
	}
}
