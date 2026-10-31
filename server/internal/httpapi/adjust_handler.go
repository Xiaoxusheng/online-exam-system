package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

type adjustScoreRequest struct {
	Reason string                `json:"reason"`
	Items  []store.ScoreOverride `json:"items"`
}

func (a *API) handleAdjustScore(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	scope := scopeFrom(r.Context())
	attemptID, ok := parseUUIDParam(w, pathParam(r, "attemptId"), "答卷 ID")
	if !ok {
		return
	}
	var req adjustScoreRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" || utf8.RuneCountInString(req.Reason) > 200 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "更正原因不能为空且不超过 200 字")
		return
	}
	if len(req.Items) == 0 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请至少填写一道题目的新分数")
		return
	}
	if len(req.Items) > 100 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "单次最多更正 100 道题")
		return
	}
	for _, item := range req.Items {
		if _, ok := parseUUIDParam(w, item.QuestionID, "题目 ID"); !ok {
			return
		}
		if item.Score < 0 {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "分数不能为负数")
			return
		}
	}

	adjustment, err := a.store.AdjustScore(r.Context(), scope, attemptID, req.Reason, req.Items)
	if err != nil {
		a.storeError(w, r, err, "成绩记录不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "score.adjusted",
		TargetType: "attempt", TargetID: attemptID,
		Detail: map[string]any{"before": adjustment.BeforeTotal, "after": adjustment.AfterTotal, "items": len(adjustment.Items)},
	})
	data(w, http.StatusOK, adjustment)
}

func (a *API) handleListScoreAdjustments(w http.ResponseWriter, r *http.Request) {
	attemptID, ok := parseUUIDParam(w, pathParam(r, "attemptId"), "答卷 ID")
	if !ok {
		return
	}
	items, err := a.store.ListScoreAdjustments(r.Context(), scopeFrom(r.Context()), attemptID)
	if err != nil {
		a.storeError(w, r, err, "更正记录不存在")
		return
	}
	data(w, http.StatusOK, items)
}

type createAppealRequest struct {
	QuestionID string `json:"question_id"`
	Reason     string `json:"reason"`
}

func (a *API) handleCreateAppeal(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	attemptID, ok := parseUUIDParam(w, pathParam(r, "attemptId"), "答卷 ID")
	if !ok {
		return
	}
	var req createAppealRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" || utf8.RuneCountInString(req.Reason) > 500 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "申诉理由不能为空且不超过 500 字")
		return
	}
	req.QuestionID = strings.TrimSpace(req.QuestionID)
	if req.QuestionID != "" {
		if _, ok := parseUUIDParam(w, req.QuestionID, "题目 ID"); !ok {
			return
		}
	}
	appeal, err := a.store.CreateAppeal(r.Context(), scopeFrom(r.Context()), attemptID, req.QuestionID, req.Reason)
	if err != nil {
		a.storeError(w, r, err, "成绩不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "score.appeal_created",
		TargetType: "attempt", TargetID: attemptID, Detail: map[string]any{"appeal_id": appeal.ID},
	})
	data(w, http.StatusCreated, appeal)
}

func (a *API) handleMyAppeals(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	items, err := a.store.ListMyAppeals(r.Context(), claims.Subject)
	if err != nil {
		a.storeError(w, r, err, "暂无申诉")
		return
	}
	data(w, http.StatusOK, items)
}

func (a *API) handleListAppeals(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination(r)
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !validOneOf(status, "pending", "accepted", "rejected") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "申诉状态不正确")
		return
	}
	items, total, err := a.store.ListAppeals(r.Context(), scopeFrom(r.Context()), status, page, pageSize)
	if err != nil {
		a.storeError(w, r, err, "暂无申诉")
		return
	}
	listData(w, items, page, pageSize, total)
}

type handleAppealRequest struct {
	Action string `json:"action"`
	Note   string `json:"note"`
}

func (a *API) handleHandleAppeal(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	appealID, ok := parseUUIDParam(w, pathParam(r, "id"), "申诉 ID")
	if !ok {
		return
	}
	var req handleAppealRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Action = strings.TrimSpace(req.Action)
	req.Note = strings.TrimSpace(req.Note)
	if !validOneOf(req.Action, "accepted", "rejected") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "处理结果只能是 通过 或 不通过")
		return
	}
	if req.Note == "" || utf8.RuneCountInString(req.Note) > 300 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "处理说明不能为空且不超过 300 字")
		return
	}
	appeal, err := a.store.HandleAppeal(r.Context(), scopeFrom(r.Context()), appealID, req.Action, req.Note)
	if err != nil {
		a.storeError(w, r, err, "申诉不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "score.appeal_" + req.Action,
		TargetType: "score_appeal", TargetID: appealID, Detail: map[string]any{"attempt_id": appeal.AttemptID},
	})
	data(w, http.StatusOK, appeal)
}
