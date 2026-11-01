package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/store"
)

// smsVerification implements C-01 phone-code login. Codes live in process
// memory (single-instance deployment), expire after 5 minutes and are consumed
// on first use. Per-phone and per-IP throttles blunt SMS-pumping abuse.
type smsVerification struct {
	mu     sync.Mutex
	codes  map[string]smsCodeEntry
	sentAt map[string]time.Time
	ipHits map[string][]time.Time
}

type smsCodeEntry struct {
	code      string
	expiresAt time.Time
	failures  int
}

const (
	smsCodeTTL       = 5 * time.Minute
	smsResendWait    = 60 * time.Second
	smsMaxFailures   = 5
	smsIPHourlyLimit = 10
)

func newSMSVerification() *smsVerification {
	return &smsVerification{
		codes:  map[string]smsCodeEntry{},
		sentAt: map[string]time.Time{},
		ipHits: map[string][]time.Time{},
	}
}

func (s *smsVerification) issue(phone string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if last, ok := s.sentAt[phone]; ok && now.Sub(last) < smsResendWait {
		return "", false
	}
	code := fmt.Sprintf("%06d", randomInt(1000000))
	s.codes[phone] = smsCodeEntry{code: code, expiresAt: now.Add(smsCodeTTL)}
	s.sentAt[phone] = now
	return code, true
}

func (s *smsVerification) verify(phone, code string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.codes[phone]
	if !ok || time.Now().After(entry.expiresAt) {
		delete(s.codes, phone)
		return false
	}
	if entry.failures >= smsMaxFailures {
		delete(s.codes, phone)
		return false
	}
	if entry.code != code {
		entry.failures++
		s.codes[phone] = entry
		return false
	}
	delete(s.codes, phone) // consumed: single use
	return true
}

func (s *smsVerification) ipAllowed(ip string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	recent := s.ipHits[ip][:0]
	for _, hit := range s.ipHits[ip] {
		if now.Sub(hit) < time.Hour {
			recent = append(recent, hit)
		}
	}
	if len(recent) >= smsIPHourlyLimit {
		s.ipHits[ip] = recent
		return false
	}
	s.ipHits[ip] = append(recent, now)
	return true
}

func randomInt(upper int) int {
	value, err := rand.Int(rand.Reader, big.NewInt(int64(upper)))
	if err != nil {
		return int(time.Now().UnixNano() % int64(upper))
	}
	return int(value.Int64())
}

type smsCodeRequest struct {
	Phone string `json:"phone"`
}

// handleSendSmsCode sends a 6-digit login code to a registered phone.
func (a *API) handleSendSmsCode(w http.ResponseWriter, r *http.Request) {
	var req smsCodeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	phone := strings.TrimSpace(req.Phone)
	if !isValidPhone(phone) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请输入正确的手机号")
		return
	}
	ip := clientIP(r)
	if !a.sms.ipAllowed(ip) {
		apiError(w, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "验证码发送过于频繁，请一小时后再试")
		return
	}
	code, ok := a.sms.issue(phone)
	if !ok {
		apiError(w, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "验证码已发送，请 60 秒后再试")
		return
	}

	response := map[string]any{"expires_in": int(smsCodeTTL.Seconds())}
	if a.notifier != nil && a.notifier.SMSConfigured() {
		status, err := a.notifier.Send(r.Context(), "sms", phone, "登录验证码",
			fmt.Sprintf("你的登录验证码是 %s，%d 分钟内有效。为了账号安全，请勿转发给他人。", code, int(smsCodeTTL.Minutes())))
		if err != nil || status != "sent" {
			a.log.Warn("sms code delivery failed", "phone", phone, "status", status, "error", err)
			apiError(w, http.StatusInternalServerError, "INTERNAL", "验证码发送失败，请稍后再试")
			return
		}
	} else if a.cfg.IsDev() {
		// Dev convenience: without a gateway the code comes back inline.
		response["dev_code"] = code
	}
	a.audit(r, store.AuditEntry{
		Action:     "auth.sms_code_sent",
		TargetType: "user",
		Detail:     map[string]any{"phone": phone, "ip": ip},
	})
	data(w, http.StatusOK, response)
}

type smsLoginRequest struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

// handleLoginBySmsCode verifies the code and issues the same session envelope
// as the password login, reusing issueSession for token/refresh bookkeeping.
func (a *API) handleLoginBySmsCode(w http.ResponseWriter, r *http.Request) {
	var req smsLoginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	phone := strings.TrimSpace(req.Phone)
	code := strings.TrimSpace(req.Code)
	if !isValidPhone(phone) || code == "" || len(code) > 8 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请输入手机号和验证码")
		return
	}
	if !a.sms.verify(phone, code) {
		a.audit(r, store.AuditEntry{
			Action:     "auth.login_sms_failed",
			TargetType: "user",
			Detail:     map[string]any{"phone": phone, "reason": "bad_code"},
		})
		apiError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "验证码不正确或已过期")
		return
	}

	user, err := a.store.FindUserByPhone(r.Context(), phone)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apiError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "该手机号未绑定任何账号")
			return
		}
		a.log.Error("sms login lookup failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	a.issueSession(w, r, user, map[string]any{"method": "sms"})
}

func isValidPhone(phone string) bool {
	if len(phone) != 11 {
		return false
	}
	if _, err := strconv.ParseInt(phone, 10, 64); err != nil {
		return false
	}
	return strings.HasPrefix(phone, "1")
}

// issueSession mints the access+refresh pair and writes the standard login
// audit trail. Shared by password login and SMS login.
func (a *API) issueSession(w http.ResponseWriter, r *http.Request, user store.User, detail map[string]any) {
	ip := clientIP(r)
	token, expiresAt, err := a.tokens.Issue(user.ID, user.OrgID, user.Role, user.Name)
	if err != nil {
		a.log.Error("issue token failed", "error", err, "user_id", user.ID)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}

	refreshToken, refreshHash, err := auth.NewRefreshToken()
	if err != nil {
		a.log.Error("generate refresh token failed", "error", err, "user_id", user.ID)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	refreshExpiresAt := time.Now().Add(a.cfg.RefreshTTL)
	if err := a.store.CreateRefreshToken(r.Context(), user.ID, refreshHash, r.UserAgent(), ip, refreshExpiresAt); err != nil {
		a.log.Error("store refresh token failed", "error", err, "user_id", user.ID)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}

	if err := a.store.TouchLastLogin(r.Context(), user.ID); err != nil {
		a.log.Warn("update last_login_at failed", "error", err, "user_id", user.ID)
	}

	auditDetail := map[string]any{}
	for key, value := range detail {
		auditDetail[key] = value
	}
	a.audit(r, store.AuditEntry{
		OrgID:      user.OrgID,
		ActorID:    user.ID,
		Action:     "auth.login",
		TargetType: "user",
		TargetID:   user.ID,
		Detail:     auditDetail,
	})

	data(w, http.StatusOK, loginResponse{
		Token:            token,
		ExpiresAt:        expiresAt,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: refreshExpiresAt,
		User:             toUserDTO(user),
	})
}
