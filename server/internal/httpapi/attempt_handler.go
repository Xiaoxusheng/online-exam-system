package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

type saveAnswerRequest struct {
	Content json.RawMessage `json:"content"`
	Version int             `json:"version"`
}

func (a *API) handleGetAttempt(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	attemptID, ok := parseUUIDParam(w, pathParam(r, "id"), "答卷 ID")
	if !ok {
		return
	}
	state, err := a.store.GetAttemptState(r.Context(), claims.Subject, attemptID)
	if err != nil {
		a.storeError(w, r, err, "答卷不存在")
		return
	}
	data(w, http.StatusOK, state)
}

func (a *API) handleSaveAnswer(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	attemptID, ok := parseUUIDParam(w, pathParam(r, "id"), "答卷 ID")
	if !ok {
		return
	}
	questionID, ok := parseUUIDParam(w, pathParam(r, "questionId"), "题目 ID")
	if !ok {
		return
	}
	var req saveAnswerRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !isJSONObject(req.Content) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "答案内容必须是 JSON 对象")
		return
	}
	if len(req.Content) > 64*1024 {
		apiError(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "单题答案不能超过 64KB")
		return
	}
	if req.Version < 0 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "答案版本不正确")
		return
	}
	version, err := a.store.SaveAnswer(r.Context(), claims.Subject, attemptID, questionID, req.Content, req.Version)
	if err != nil {
		a.storeError(w, r, err, "答卷或题目不存在")
		return
	}
	data(w, http.StatusOK, map[string]any{"question_id": questionID, "version": version})
}

func (a *API) handleSubmitAttempt(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	attemptID, ok := parseUUIDParam(w, pathParam(r, "id"), "答卷 ID")
	if !ok {
		return
	}
	result, err := a.store.SubmitAttempt(r.Context(), claims.Subject, attemptID)
	if err != nil {
		a.storeError(w, r, err, "答卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "attempt.submitted",
		TargetType: "attempt", TargetID: attemptID,
		Detail: map[string]any{"total_score": result.TotalScore, "pending_review": result.PendingReview},
	})
	data(w, http.StatusOK, result)
}

type proctorEventRequest struct {
	Type        string `json:"type"`
	Level       string `json:"level"`
	SnapshotURL string `json:"snapshot_url"`
	Note        string `json:"note"`
}

func (a *API) handleCreateProctorEvent(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	attemptID, ok := parseUUIDParam(w, pathParam(r, "id"), "答卷 ID")
	if !ok {
		return
	}
	var req proctorEventRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Type = strings.TrimSpace(req.Type)
	if req.Type == "" || utf8.RuneCountInString(req.Type) > 64 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "事件类型不能为空且不超过 64 个字符")
		return
	}
	req.Note = strings.TrimSpace(req.Note)
	if utf8.RuneCountInString(req.Note) > 200 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "事件备注不超过 200 字")
		return
	}
	if req.Level == "" {
		req.Level = "warning"
	}
	if !validOneOf(req.Level, "info", "warning", "critical") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "事件等级不正确")
		return
	}
	event, err := a.store.CreateProctorEventNote(r.Context(), claims.Subject, attemptID, req.Type, req.Level, strings.TrimSpace(req.SnapshotURL), req.Note)
	if err != nil {
		a.storeError(w, r, err, "答卷不存在或不在考试中")
		return
	}
	data(w, http.StatusCreated, event)
}
