package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/store"
)

type loginRequest struct {
	Account  string `json:"account"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token            string    `json:"token"`
	ExpiresAt        time.Time `json:"expires_at"`
	RefreshToken     string    `json:"refresh_token"`
	RefreshExpiresAt time.Time `json:"refresh_expires_at"`
	User             userDTO   `json:"user"`
}

type userDTO struct {
	ID          string     `json:"id"`
	OrgID       string     `json:"org_id"`
	Name        string     `json:"name"`
	Username    string     `json:"username"`
	Phone       string     `json:"phone"`
	Email       string     `json:"email"`
	Role        string     `json:"role"`
	DataScope   string     `json:"data_scope"`
	Status      string     `json:"status"`
	CampusID    *string    `json:"campus_id,omitempty"`
	ClassID     *string    `json:"class_id,omitempty"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func toUserDTO(u store.User) userDTO {
	return userDTO{
		ID:          u.ID,
		OrgID:       u.OrgID,
		Name:        u.Name,
		Username:    u.Username,
		Phone:       u.Phone,
		Email:       u.Email,
		Role:        u.Role,
		DataScope:   u.DataScope,
		Status:      u.Status,
		CampusID:    u.CampusID,
		ClassID:     u.ClassID,
		LastLoginAt: u.LastLoginAt,
		CreatedAt:   u.CreatedAt,
	}
}

func (a *API) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Account = strings.TrimSpace(req.Account)
	if req.Account == "" || len(req.Account) > 64 || req.Password == "" || len(req.Password) > 128 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请输入账号和密码")
		return
	}

	ip := clientIP(r)
	if retryAfter, blocked := a.limiter.check(strings.ToLower(req.Account), ip); blocked {
		seconds := int(retryAfter.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		a.log.Warn("login rate limited", "account", req.Account, "ip", ip, "retry_after_s", seconds)
		apiError(w, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "登录尝试过于频繁，请稍后再试")
		return
	}

	user, passwordHash, err := a.store.FindUserByAccount(r.Context(), req.Account)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			auth.BurnPasswordCheck(req.Password)
			a.limiter.fail(strings.ToLower(req.Account), ip)
			a.audit(r, store.AuditEntry{
				Action:     "auth.login_failed",
				TargetType: "user",
				Detail:     map[string]any{"account": req.Account, "reason": "unknown_account"},
			})
			apiError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "账号或密码错误")
			return
		}
		a.log.Error("login lookup failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}

	if !auth.VerifyPassword(passwordHash, req.Password) {
		a.limiter.fail(strings.ToLower(req.Account), ip)
		a.audit(r, store.AuditEntry{
			OrgID:      user.OrgID,
			ActorID:    user.ID,
			Action:     "auth.login_failed",
			TargetType: "user",
			TargetID:   user.ID,
			Detail:     map[string]any{"reason": "wrong_password"},
		})
		apiError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "账号或密码错误")
		return
	}

	if user.Status != "active" {
		a.limiter.fail(strings.ToLower(req.Account), ip)
		a.audit(r, store.AuditEntry{
			OrgID:      user.OrgID,
			ActorID:    user.ID,
			Action:     "auth.login_failed",
			TargetType: "user",
			TargetID:   user.ID,
			Detail:     map[string]any{"reason": "account_disabled"},
		})
		apiError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "账号已停用，请联系管理员")
		return
	}

	a.limiter.reset(strings.ToLower(req.Account))
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

	a.audit(r, store.AuditEntry{
		OrgID:      user.OrgID,
		ActorID:    user.ID,
		Action:     "auth.login",
		TargetType: "user",
		TargetID:   user.ID,
	})

	data(w, http.StatusOK, loginResponse{
		Token:            token,
		ExpiresAt:        expiresAt,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: refreshExpiresAt,
		User:             toUserDTO(user),
	})
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// handleRefresh rotates a refresh token: the presented token is revoked and a new
// access + refresh pair is issued for the same user.
func (a *API) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.RefreshToken = strings.TrimSpace(req.RefreshToken)
	if req.RefreshToken == "" || len(req.RefreshToken) > 128 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "缺少刷新令牌")
		return
	}

	newToken, newHash, err := auth.NewRefreshToken()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	refreshExpiresAt := time.Now().Add(a.cfg.RefreshTTL)
	rotated, err := a.store.RotateRefreshToken(r.Context(), auth.HashRefreshToken(req.RefreshToken), newHash, r.UserAgent(), clientIP(r), refreshExpiresAt)
	if err != nil {
		if errors.Is(err, store.ErrForbidden) {
			a.log.Warn("refresh token reuse detected", "ip", clientIP(r))
			a.audit(r, store.AuditEntry{
				Action:     "auth.refresh_reuse",
				TargetType: "user",
				Detail:     map[string]any{"ip": clientIP(r)},
			})
		}
		apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "登录状态已失效，请重新登录")
		return
	}

	user, err := a.store.FindUserByID(r.Context(), rotated.UserID)
	if err != nil || user.Status != "active" {
		if user.ID != "" {
			_ = a.store.RevokeAllRefreshTokens(r.Context(), user.ID)
		}
		apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "账号不可用，请重新登录")
		return
	}

	token, expiresAt, err := a.tokens.Issue(user.ID, user.OrgID, user.Role, user.Name)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	data(w, http.StatusOK, loginResponse{
		Token:            token,
		ExpiresAt:        expiresAt,
		RefreshToken:     newToken,
		RefreshExpiresAt: refreshExpiresAt,
		User:             toUserDTO(user),
	})
}

func (a *API) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFrom(r.Context())
	if !ok {
		apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "请先登录")
		return
	}

	user, err := a.store.FindUserByID(r.Context(), claims.Subject)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "登录状态已失效，请重新登录")
			return
		}
		a.log.Error("load current user failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	if user.Status != "active" {
		apiError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "账号已停用，请联系管理员")
		return
	}
	data(w, http.StatusOK, toUserDTO(user))
}

func (a *API) handleLogout(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req refreshRequest
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if token := strings.TrimSpace(req.RefreshToken); token != "" && len(token) <= 128 {
		if err := a.store.RevokeRefreshToken(r.Context(), auth.HashRefreshToken(token)); err != nil {
			a.log.Warn("revoke refresh token failed", "error", err)
		}
	}
	if claims != nil {
		a.audit(r, store.AuditEntry{
			OrgID:      claims.OrgID,
			ActorID:    claims.Subject,
			Action:     "auth.logout",
			TargetType: "user",
			TargetID:   claims.Subject,
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) audit(r *http.Request, entry store.AuditEntry) {
	entry.IP = clientIP(r)
	entry.UserAgent = r.UserAgent()
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
	defer cancel()
	if err := a.store.InsertAudit(ctx, entry); err != nil {
		a.log.Error("write audit log failed", "error", err, "action", entry.Action)
	}
}
