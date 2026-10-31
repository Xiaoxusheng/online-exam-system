package httpapi

import (
	"net/http"
	"strings"

	"online-exam-system/server/internal/store"
)

func (a *API) handleListScores(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination(r)
	filter := store.ScoreFilter{
		ExamID:   strings.TrimSpace(r.URL.Query().Get("exam_id")),
		Status:   strings.TrimSpace(r.URL.Query().Get("status")),
		Keyword:  strings.TrimSpace(r.URL.Query().Get("keyword")),
		Page:     page,
		PageSize: pageSize,
	}
	if filter.ExamID != "" {
		if _, ok := parseUUIDParam(w, filter.ExamID, "exam_id"); !ok {
			return
		}
	}
	scores, total, err := a.store.ListScores(r.Context(), scopeFrom(r.Context()), filter)
	if err != nil {
		a.storeError(w, r, err, "成绩不存在")
		return
	}
	listData(w, scores, page, pageSize, total)
}

func (a *API) handleGetScore(w http.ResponseWriter, r *http.Request) {
	attemptID, ok := parseUUIDParam(w, pathParam(r, "attemptId"), "答卷 ID")
	if !ok {
		return
	}
	score, err := a.store.GetScoreRecord(r.Context(), scopeFrom(r.Context()), attemptID, false)
	if err != nil {
		a.storeError(w, r, err, "成绩不存在")
		return
	}
	data(w, http.StatusOK, score)
}

// handleMyScoreRecord lets a candidate read their own published score detail.
func (a *API) handleMyScoreRecord(w http.ResponseWriter, r *http.Request) {
	attemptID, ok := parseUUIDParam(w, pathParam(r, "attemptId"), "答卷 ID")
	if !ok {
		return
	}
	score, err := a.store.GetScoreRecord(r.Context(), scopeFrom(r.Context()), attemptID, true)
	if err != nil {
		a.storeError(w, r, err, "成绩不存在或未发布")
		return
	}
	data(w, http.StatusOK, score)
}

type publishScoresRequest struct {
	ExamID string `json:"exam_id"`
}

func (a *API) handlePublishScores(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req publishScoresRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, ok := validateUUIDField(w, req.ExamID, "exam_id"); !ok {
		return
	}
	published, err := a.store.PublishScores(r.Context(), claims.OrgID, req.ExamID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "score.published",
		TargetType: "exam", TargetID: req.ExamID, Detail: map[string]any{"published": published},
	})
	data(w, http.StatusOK, map[string]any{"published": published})
}

func (a *API) handleExamAnalytics(w http.ResponseWriter, r *http.Request) {
	examID, ok := parseUUIDParam(w, pathParam(r, "examId"), "考试 ID")
	if !ok {
		return
	}
	analytics, err := a.store.GetExamAnalytics(r.Context(), scopeFrom(r.Context()), examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	data(w, http.StatusOK, analytics)
}

func (a *API) handleMyScores(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	scores, err := a.store.ListMyScores(r.Context(), claims.OrgID, claims.Subject)
	if err != nil {
		a.storeError(w, r, err, "暂无成绩")
		return
	}
	data(w, http.StatusOK, scores)
}
