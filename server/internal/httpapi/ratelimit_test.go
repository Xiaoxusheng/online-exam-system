package httpapi

import (
	"testing"
	"time"
)

func TestLoginLimiterBlocksAfterFailures(t *testing.T) {
	clock := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	limiter := newLoginLimiter(5, 60, 15*time.Minute)
	limiter.now = func() time.Time { return clock }

	for i := 0; i < 4; i++ {
		if _, blocked := limiter.check("alice", "10.0.0.1"); blocked {
			t.Fatalf("attempt %d must not be blocked yet", i+1)
		}
		limiter.fail("alice", "10.0.0.1")
	}
	if _, blocked := limiter.check("alice", "10.0.0.1"); blocked {
		t.Fatal("four failures must not block")
	}
	limiter.fail("alice", "10.0.0.1")
	retry, blocked := limiter.check("alice", "10.0.0.1")
	if !blocked || retry <= 0 {
		t.Fatal("fifth failure must block the account")
	}

	clock = clock.Add(16 * time.Minute)
	if _, blocked := limiter.check("alice", "10.0.0.1"); blocked {
		t.Fatal("the block must expire after the window")
	}
}

func TestLoginLimiterResetOnSuccess(t *testing.T) {
	limiter := newLoginLimiter(5, 60, 15*time.Minute)
	for i := 0; i < 4; i++ {
		limiter.fail("bob", "10.0.0.2")
	}
	limiter.reset("bob")
	for i := 0; i < 4; i++ {
		limiter.fail("bob", "10.0.0.2")
	}
	if _, blocked := limiter.check("bob", "10.0.0.2"); blocked {
		t.Fatal("a successful login must clear the account counter")
	}
}

func TestLoginLimiterIPBucket(t *testing.T) {
	limiter := newLoginLimiter(5, 60, 15*time.Minute)
	for i := 0; i < limiter.ipLimit; i++ {
		limiter.fail("user-a", "10.0.0.3")
	}
	if _, blocked := limiter.check("user-b", "10.0.0.3"); !blocked {
		t.Fatal("one host spraying accounts must be blocked by IP")
	}
	if _, blocked := limiter.check("user-b", "10.0.0.4"); blocked {
		t.Fatal("other hosts must stay unaffected")
	}
}
