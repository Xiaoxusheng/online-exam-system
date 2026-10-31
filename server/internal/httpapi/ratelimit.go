package httpapi

import (
	"sync"
	"time"
)

// loginLimiter is a single-instance, in-memory brute-force guard. It counts failed
// logins per account and per client IP; a multi-replica deployment needs a shared
// store (Redis) instead — see docs/architecture.md.
type loginLimiter struct {
	mu           sync.Mutex
	byAccount    map[string]*attemptWindow
	byIP         map[string]*attemptWindow
	accountLimit int
	ipLimit      int
	window       time.Duration
	blockFor     time.Duration
	now          func() time.Time
}

type attemptWindow struct {
	failures     int
	windowStart  time.Time
	blockedUntil time.Time
}

func newLoginLimiter(accountLimit, ipLimit int, block time.Duration) *loginLimiter {
	if accountLimit <= 0 {
		accountLimit = 5
	}
	if ipLimit <= 0 {
		ipLimit = 60
	}
	if block <= 0 {
		block = 15 * time.Minute
	}
	return &loginLimiter{
		byAccount:    make(map[string]*attemptWindow),
		byIP:         make(map[string]*attemptWindow),
		accountLimit: accountLimit,
		ipLimit:      ipLimit,
		window:       block,
		blockFor:     block,
		now:          time.Now,
	}
}

// check reports whether the caller may attempt a login, and for how long they must wait.
func (l *loginLimiter) check(account, ip string) (time.Duration, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.prune(now)

	if entry, ok := l.byAccount[account]; ok && now.Before(entry.blockedUntil) {
		return entry.blockedUntil.Sub(now), true
	}
	if entry, ok := l.byIP[ip]; ok && now.Before(entry.blockedUntil) {
		return entry.blockedUntil.Sub(now), true
	}
	return 0, false
}

// fail records one failed credential attempt.
func (l *loginLimiter) fail(account, ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.bump(l.byAccount, account, now, l.accountLimit)
	if ip != "" {
		l.bump(l.byIP, ip, now, l.ipLimit)
	}
}

// reset clears the account window after a successful login (the IP window stays,
// so one compromised host cannot keep spraying accounts).
func (l *loginLimiter) reset(account string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.byAccount, account)
}

func (l *loginLimiter) bump(bucket map[string]*attemptWindow, key string, now time.Time, limit int) {
	entry, ok := bucket[key]
	if !ok || now.Sub(entry.windowStart) > l.window {
		bucket[key] = &attemptWindow{failures: 1, windowStart: now}
		return
	}
	entry.failures++
	if entry.failures >= limit {
		entry.blockedUntil = now.Add(l.blockFor)
		entry.failures = 0
		entry.windowStart = now
	}
}

func (l *loginLimiter) prune(now time.Time) {
	if len(l.byAccount) > 5000 {
		l.byAccount = make(map[string]*attemptWindow)
	}
	if len(l.byIP) > 5000 {
		l.byIP = make(map[string]*attemptWindow)
	}
	for key, entry := range l.byAccount {
		if now.After(entry.blockedUntil) && now.Sub(entry.windowStart) > l.window {
			delete(l.byAccount, key)
		}
	}
	for key, entry := range l.byIP {
		if now.After(entry.blockedUntil) && now.Sub(entry.windowStart) > l.window {
			delete(l.byIP, key)
		}
	}
}
