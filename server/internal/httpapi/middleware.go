package httpapi

import (
	"bufio"
	"context"
	"errors"
	"net"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/store"
)

type ctxKey int

const (
	claimsKey ctxKey = iota
	actorKey
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

// Hijack keeps the websocket handshake working through the logging wrapper.
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("underlying ResponseWriter does not implement http.Hijacker")
	}
	return hijacker.Hijack()
}

func (a *API) requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		a.log.Info("http request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", middleware.GetReqID(r.Context()),
			"ip", clientIP(r),
		)
	})
}

func (a *API) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				a.log.Error("panic recovered", "panic", rec, "path", r.URL.Path, "stack", string(debug.Stack()))
				apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (a *API) cors(next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(a.cfg.CORSOrigins))
	for _, origin := range a.cfg.CORSOrigins {
		allowed[origin] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) bodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, a.cfg.MaxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := bearerToken(r)
		if raw == "" {
			apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "请先登录")
			return
		}
		claims, err := a.tokens.Parse(raw)
		if err != nil {
			apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "登录状态已失效，请重新登录")
			return
		}
		// Reload the account on every request so a disabled account or a role/scope
		// change takes effect immediately instead of when the token expires.
		actor, err := a.store.FindUserByID(r.Context(), claims.Subject)
		if err != nil {
			apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "账号不存在或已停用，请重新登录")
			return
		}
		if actor.Status != "active" {
			apiError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "账号已停用，请联系管理员")
			return
		}
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		ctx = context.WithValue(ctx, actorKey, actor)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *API) requireRoles(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := claimsFrom(r.Context())
			if !ok {
				apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "请先登录")
				return
			}
			if claims.Role == "org_admin" {
				next.ServeHTTP(w, r)
				return
			}
			if _, ok := allowed[claims.Role]; !ok {
				apiError(w, http.StatusForbidden, "FORBIDDEN", "无权访问该资源")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func claimsFrom(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(claimsKey).(*auth.Claims)
	return claims, ok
}

// scopeFrom builds the caller's data scope from the freshly loaded account.
// Handlers must use it instead of trusting query parameters for tenancy.
func scopeFrom(ctx context.Context) store.Scope {
	actor, ok := ctx.Value(actorKey).(store.User)
	if !ok {
		return store.Scope{}
	}
	scope := store.Scope{
		OrgID:     actor.OrgID,
		Role:      actor.Role,
		UserID:    actor.ID,
		DataScope: actor.DataScope,
	}
	if actor.CampusID != nil {
		scope.CampusID = *actor.CampusID
	}
	if actor.ClassID != nil {
		scope.ClassID = *actor.ClassID
	}
	return scope
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
