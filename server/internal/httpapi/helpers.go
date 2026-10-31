package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"online-exam-system/server/internal/store"
)

func pathParam(r *http.Request, name string) string {
	return chi.URLParam(r, name)
}

func parseUUIDParam(w http.ResponseWriter, raw, field string) (string, bool) {
	if _, err := uuid.Parse(raw); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", field+" 格式不正确")
		return "", false
	}
	return raw, true
}

func validateUUIDField(w http.ResponseWriter, raw, field string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", field+" 不能为空")
		return "", false
	}
	return parseUUIDParam(w, raw, field)
}

func validOneOf(value string, allowed ...string) bool {
	for _, item := range allowed {
		if value == item {
			return true
		}
	}
	return false
}

func isJSONObject(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return len(trimmed) > 0 && trimmed[0] == '{' && json.Valid(raw)
}

func (a *API) storeError(w http.ResponseWriter, r *http.Request, err error, notFoundMessage string) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		apiError(w, http.StatusNotFound, "NOT_FOUND", notFoundMessage)
	case errors.Is(err, store.ErrConflict):
		apiError(w, http.StatusConflict, "CONFLICT", "数据冲突，请刷新后重试")
	case errors.Is(err, store.ErrInvalidState):
		apiError(w, http.StatusConflict, "INVALID_STATE", "当前状态不允许该操作")
	case errors.Is(err, store.ErrForbidden):
		apiError(w, http.StatusForbidden, "FORBIDDEN", "无权访问该资源")
	case errors.Is(err, store.ErrInsufficientQuestions):
		apiError(w, http.StatusUnprocessableEntity, "INSUFFICIENT_QUESTIONS", "符合条件的题目不足，无法生成试卷")
	case errors.Is(err, store.ErrTooEarly):
		apiError(w, http.StatusConflict, "EXAM_NOT_STARTED", "考试尚未开始")
	case errors.Is(err, store.ErrExpired):
		apiError(w, http.StatusConflict, "EXAM_EXPIRED", "考试已结束或答卷已超时")
	default:
		a.log.Error("request failed", "error", err, "method", r.Method, "path", r.URL.Path)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
	}
}

func parseTimeQuery(w http.ResponseWriter, r *http.Request, key string) (*time.Time, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return nil, true
	}
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", key+" 需为 RFC3339 时间")
		return nil, false
	}
	return &parsed, true
}
