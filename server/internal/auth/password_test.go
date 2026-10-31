package auth

import "testing"

func TestPasswordHashAndVerify(t *testing.T) {
	hash, err := HashPassword("Admin@123456")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if hash == "Admin@123456" {
		t.Fatal("password must not be stored in plain text")
	}
	if !VerifyPassword(hash, "Admin@123456") {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword(hash, "wrong-password") {
		t.Fatal("expected wrong password to be rejected")
	}
}
