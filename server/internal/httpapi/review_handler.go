package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

// reviewScope returns the reviewer id to filter by. Plain reviewers only see their own
// (plus unassigned) tasks; exam administrators and org admins see the whole pool. The
// account is the one reloaded for this request, so a role change applies immediately.
func reviewScope(actor store.User) string {
	if actor.Role == "reviewer" {
		return actor.ID
	}
	return ""
}

func (a *API) handleListReviewTasks(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFrom(r.Context())
	page, pageSize := pagination(r)
	filter := store.ReviewFilter{
		Status:     strings.TrimSpace(r.URL.Query().Get("status")),
		ExamID:     strings.TrimSpace(r.URL.Query().Get("exam_id")),
		ReviewerID: reviewScope(actor),
		Page:       page,
		PageSize:   pageSize,
	}
	if filter.ExamID != "" {
		if _, ok := parseUUIDParam(w, filter.ExamID, "exam_id"); !ok {
			return
		}
	}
	tasks, total, err := a.store.ListReviewTasks(r.Context(), actor.OrgID, filter)
	if err != nil {
		a.storeError(w, r, err, "阅卷任务不存在")
		return
	}
	listData(w, tasks, page, pageSize, total)
}

func (a *API) handleGetReviewTask(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFrom(r.Context())
	taskID, ok := parseUUIDParam(w, pathParam(r, "id"), "阅卷任务 ID")
	if !ok {
		return
	}
	task, err := a.store.GetReviewTaskDetail(r.Context(), actor.OrgID, taskID, reviewScope(actor))
	if err != nil {
		a.storeError(w, r, err, "阅卷任务不存在")
		return
	}
	data(w, http.StatusOK, task)
}

// handleReviewTaskNeighbors returns the previous/next task of the queue the reviewer is browsing,
// which is what powers 上一份/下一份 in the grading drawer.
func (a *API) handleReviewTaskNeighbors(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFrom(r.Context())
	taskID, ok := parseUUIDParam(w, pathParam(r, "id"), "阅卷任务 ID")
	if !ok {
		return
	}
	filter := store.ReviewFilter{
		Status:     strings.TrimSpace(r.URL.Query().Get("status")),
		ExamID:     strings.TrimSpace(r.URL.Query().Get("exam_id")),
		ReviewerID: reviewScope(actor),
	}
	if filter.ExamID != "" {
		if _, ok := parseUUIDParam(w, filter.ExamID, "exam_id"); !ok {
			return
		}
	}
	queue, err := a.store.ReviewTaskNeighbors(r.Context(), actor.OrgID, filter, taskID)
	if err != nil {
		a.storeError(w, r, err, "阅卷任务不存在")
		return
	}
	data(w, http.StatusOK, queue)
}

type submitReviewRequest struct {
	Score   *float64 `json:"score"`
	Comment string   `json:"comment"`
}

func (a *API) handleSubmitReview(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	taskID, ok := parseUUIDParam(w, pathParam(r, "id"), "阅卷任务 ID")
	if !ok {
		return
	}
	var req submitReviewRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Score == nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请填写评分")
		return
	}
	req.Comment = strings.TrimSpace(req.Comment)
	if utf8.RuneCountInString(req.Comment) > 2000 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "评语不能超过 2000 个字符")
		return
	}
	result, err := a.store.SubmitReview(r.Context(), claims.OrgID, claims.Subject, taskID, *req.Score, req.Comment)
	if err != nil {
		a.storeError(w, r, err, "阅卷任务不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "review.submitted",
		TargetType: "review_task", TargetID: taskID,
		Detail: map[string]any{"score": result.Score, "attempt_total": result.AttemptTotal},
	})
	data(w, http.StatusOK, result)
}
