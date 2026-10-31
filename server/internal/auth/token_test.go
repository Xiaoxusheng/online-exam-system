package auth

import (
	"testing"
	"time"
)

func TestTokenIssueAndParse(t *testing.T) {
	m := NewTokenManager("test-secret-that-is-long-enough-123456", time.Hour)

	raw, expiresAt, err := m.Issue("user-1", "org-1", "org_admin", "管理员")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	if !expiresAt.After(time.Now()) {
		t.Fatalf("expires_at not in the future: %v", expiresAt)
	}

	claims, err := m.Parse(raw)
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	if claims.Subject != "user-1" || claims.OrgID != "org-1" || claims.Role != "org_admin" || claims.Name != "管理员" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestTokenRejectsTamperedToken(t *testing.T) {
	m := NewTokenManager("test-secret-that-is-long-enough-123456", time.Hour)
	raw, _, err := m.Issue("user-1", "org-1", "student", "考生")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	if _, err := m.Parse(raw + "x"); err == nil {
		t.Fatal("expected tampered token to be rejected")
	}
}

func TestTokenRejectsExpiredToken(t *testing.T) {
	m := NewTokenManager("test-secret-that-is-long-enough-123456", time.Hour)
	m.ttl = -time.Minute

	raw, _, err := m.Issue("user-1", "org-1", "student", "考生")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	if _, err := m.Parse(raw); err == nil {
		t.Fatal("expected expired token to be rejected")
	}
}

func TestTokenRejectsOtherSecret(t *testing.T) {
	issuer := NewTokenManager("test-secret-that-is-long-enough-123456", time.Hour)
	raw, _, err := issuer.Issue("user-1", "org-1", "student", "考生")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	other := NewTokenManager("another-secret-that-is-long-enough-654321", time.Hour)
	if _, err := other.Parse(raw); err == nil {
		t.Fatal("expected token signed by another secret to be rejected")
	}
}
