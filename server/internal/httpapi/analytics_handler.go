package httpapi

import (
	"net/http"
	"strings"
)

// handleExamItemAnalytics answers GET /analytics/exams/{examId}/items.
func (a *API) handleExamItemAnalytics(w http.ResponseWriter, r *http.Request) {
	examID, ok := parseUUIDParam(w, pathParam(r, "examId"), "考试 ID")
	if !ok {
		return
	}
	analytics, err := a.store.GetExamItemAnalytics(r.Context(), scopeFrom(r.Context()), examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	data(w, http.StatusOK, analytics)
}

// handleKnowledgeAnalytics answers GET /analytics/knowledge-points, optionally scoped to one exam.
func (a *API) handleKnowledgeAnalytics(w http.ResponseWriter, r *http.Request) {
	scope := scopeFrom(r.Context())
	examID := strings.TrimSpace(r.URL.Query().Get("exam_id"))
	if examID != "" {
		if _, ok := parseUUIDParam(w, examID, "exam_id"); !ok {
			return
		}
	}
	analytics, err := a.store.GetKnowledgeAnalytics(r.Context(), scope, examID)
	if err != nil {
		a.storeError(w, r, err, "暂无知识点数据")
		return
	}
	data(w, http.StatusOK, analytics)
}
