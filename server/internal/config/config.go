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
	RefreshTTL        time.Duration
	LoginAccountLimit int
	LoginIPLimit      int
	LoginBlock        time.Duration
	CORSOrigins       []string
	LogLevel          string
	MaxBodyBytes      int64
	MaxUploadBytes    int64
	MediaDir          string
	SeedAdminPassword string
	WebDir            string

	// Outbound notification channels. SMTP unset = email disabled; SMS gateway
	// unset = sms deliveries are recorded as simulated.
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
	SMSAPIURL    string
	SMSAPIToken  string
}

func Load() (Config, error) {
	cfg := Config{
		Env:               getEnv("APP_ENV", "dev"),
		HTTPAddr:          getEnv("HTTP_ADDR", ":8081"),
		DatabaseURL:       getEnv("DATABASE_URL", defaultDatabaseURL),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		JWTTTL:            8 * time.Hour,
		RefreshTTL:        30 * 24 * time.Hour,
		LoginAccountLimit: 5,
		LoginIPLimit:      60,
		LoginBlock:        15 * time.Minute,
		CORSOrigins:       splitTrim(getEnv("CORS_ORIGINS", "http://127.0.0.1:5174,http://localhost:5174")),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		MaxBodyBytes:      1 << 20,
		MaxUploadBytes:    64 << 20,
		MediaDir:          getEnv("MEDIA_DIR", "data/media"),
		SeedAdminPassword: getEnv("SEED_ADMIN_PASSWORD", "Admin@123456"),
		WebDir:            os.Getenv("WEB_DIR"),

		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUsername: os.Getenv("SMTP_USERNAME"),
		SMTPPassword: os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:     os.Getenv("SMTP_FROM"),
		SMSAPIURL:    os.Getenv("SMS_API_URL"),
		SMSAPIToken:  os.Getenv("SMS_API_TOKEN"),
	}

	switch cfg.Env {
	case "dev", "test", "release":
	default:
		return cfg, fmt.Errorf("invalid APP_ENV %q (want dev, test or release)", cfg.Env)
	}

	// The built-in secret is a development convenience only. Allowing it in test or
	// release means one forgotten environment variable hands out forgeable org_admin
	// tokens, so those environments fail closed instead.
	if cfg.JWTSecret == "" {
		if cfg.Env != "dev" {
			return cfg, fmt.Errorf("JWT_SECRET is required when APP_ENV=%s", cfg.Env)
		}
		cfg.JWTSecret = DefaultDevJWTSecret
	}
	if cfg.Env != "dev" {
		if cfg.JWTSecret == DefaultDevJWTSecret {
			return cfg, fmt.Errorf("the built-in development JWT_SECRET is not allowed when APP_ENV=%s", cfg.Env)
		}
		if len(cfg.JWTSecret) < 32 {
			return cfg, fmt.Errorf("JWT_SECRET must be at least 32 bytes when APP_ENV=%s", cfg.Env)
		}
	}

	if v := os.Getenv("JWT_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return cfg, fmt.Errorf("invalid JWT_TTL %q", v)
		}
		cfg.JWTTTL = d
	}
	if v := os.Getenv("REFRESH_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return cfg, fmt.Errorf("invalid REFRESH_TTL %q", v)
		}
		cfg.RefreshTTL = d
	}
	if v := os.Getenv("LOGIN_ACCOUNT_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return cfg, fmt.Errorf("invalid LOGIN_ACCOUNT_LIMIT %q", v)
		}
		cfg.LoginAccountLimit = n
	}
	if v := os.Getenv("LOGIN_IP_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return cfg, fmt.Errorf("invalid LOGIN_IP_LIMIT %q", v)
		}
		cfg.LoginIPLimit = n
	}
	if v := os.Getenv("LOGIN_BLOCK"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return cfg, fmt.Errorf("invalid LOGIN_BLOCK %q", v)
		}
		cfg.LoginBlock = d
	}
	if v := os.Getenv("MAX_BODY_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return cfg, fmt.Errorf("invalid MAX_BODY_BYTES %q", v)
		}
		cfg.MaxBodyBytes = n
	}
	if v := os.Getenv("MAX_UPLOAD_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return cfg, fmt.Errorf("invalid MAX_UPLOAD_BYTES %q", v)
		}
		cfg.MaxUploadBytes = n
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
