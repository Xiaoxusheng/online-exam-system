package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

type createExamRequest struct {
	PaperID         string                 `json:"paper_id"`
	Title           string                 `json:"title"`
	StartAt         time.Time              `json:"start_at"`
	EndAt           time.Time              `json:"end_at"`
	DurationMinutes int                    `json:"duration_minutes"`
	Rules           json.RawMessage        `json:"rules"`
	ProctorConfig   json.RawMessage        `json:"proctor_config"`
	Candidates      []store.CandidateInput `json:"candidates"`
	ClassIDs        []string               `json:"class_ids"`
	RetakeOf        string                 `json:"retake_of"`
}

func validateCandidateInputs(w http.ResponseWriter, candidates []store.CandidateInput, classIDs []string) bool {
	for _, candidate := range candidates {
		if _, ok := parseUUIDParam(w, candidate.UserID, "考生 ID"); !ok {
			return false
		}
		if candidate.PaperGroup != "" && candidate.PaperGroup != "A" && candidate.PaperGroup != "B" {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "AB 分组只能是 A 或 B")
			return false
		}
	}
	for _, classID := range classIDs {
		if _, ok := parseUUIDParam(w, classID, "班级 ID"); !ok {
			return false
		}
	}
	return true
}

func validateExamRules(w http.ResponseWriter, raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	var rules struct {
		ReviewMode      *string  `json:"review_mode"`
		ReviewThreshold *float64 `json:"review_threshold"`
		PassScore       *float64 `json:"pass_score"`
	}
	if err := json.Unmarshal(raw, &rules); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "考试规则字段类型不正确")
		return false
	}
	if rules.ReviewMode != nil && *rules.ReviewMode != "single" && *rules.ReviewMode != "double" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "review_mode 只能是 single 或 double")
		return false
	}
	if rules.ReviewThreshold != nil && *rules.ReviewThreshold < 0 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "review_threshold 不能为负数")
		return false
	}
	if rules.PassScore != nil && *rules.PassScore < 0 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "pass_score 不能为负数")
		return false
	}
	return true
}

func (a *API) handleCreateExam(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req createExamRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, ok := validateUUIDField(w, req.PaperID, "paper_id"); !ok {
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || utf8.RuneCountInString(req.Title) > 120 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "考试名称不能为空且不超过 120 个字符")
		return
	}
	if req.StartAt.IsZero() || req.EndAt.IsZero() || !req.EndAt.After(req.StartAt) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "考试时间窗不正确")
		return
	}
	if req.DurationMinutes <= 0 || req.DurationMinutes > 24*60 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "考试时长需在 1-1440 分钟之间")
		return
	}
	if len(req.Rules) > 0 && !isJSONObject(req.Rules) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "考试规则必须是 JSON 对象")
		return
	}
	if !validateExamRules(w, req.Rules) {
		return
	}
	if len(req.ProctorConfig) > 0 && !isJSONObject(req.ProctorConfig) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "监考配置必须是 JSON 对象")
		return
	}
	if !validateCandidateInputs(w, req.Candidates, req.ClassIDs) {
		return
	}
	if req.RetakeOf != "" {
		if _, ok := parseUUIDParam(w, req.RetakeOf, "关联的原考试 ID"); !ok {
			return
		}
	}

	exam, err := a.store.CreateExam(r.Context(), store.CreateExamParams{
		OrgID: claims.OrgID, PaperID: req.PaperID, Title: req.Title,
		StartAt: req.StartAt, EndAt: req.EndAt, DurationMinutes: req.DurationMinutes,
		Rules: req.Rules, ProctorConfig: req.ProctorConfig,
		Candidates: req.Candidates, ClassIDs: req.ClassIDs, CreatedBy: claims.Subject,
		RetakeOf: req.RetakeOf,
	})
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "exam.created",
		TargetType: "exam", TargetID: exam.ID,
		Detail: map[string]any{"title": exam.Title, "retake_of": req.RetakeOf},
	})
	data(w, http.StatusCreated, exam)
}

func (a *API) handleListExams(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	page, pageSize := pagination(r)
	exams, total, err := a.store.ListExams(r.Context(), claims.OrgID, store.ExamFilter{
		Status:   strings.TrimSpace(r.URL.Query().Get("status")),
		Keyword:  strings.TrimSpace(r.URL.Query().Get("keyword")),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	listData(w, exams, page, pageSize, total)
}

func (a *API) handleGetExam(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	exam, err := a.store.GetExam(r.Context(), claims.OrgID, examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	data(w, http.StatusOK, exam)
}

func (a *API) handlePublishExam(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	exam, err := a.store.PublishExam(r.Context(), claims.OrgID, examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "exam.published",
		TargetType: "exam", TargetID: exam.ID,
	})
	data(w, http.StatusOK, exam)
}

func (a *API) handleRescheduleExam(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	var req struct {
		StartAt time.Time `json:"start_at"`
		EndAt   time.Time `json:"end_at"`
		Reason  string    `json:"reason"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.StartAt.IsZero() || req.EndAt.IsZero() {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请提供新的开始与结束时间")
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if utf8.RuneCountInString(req.Reason) > 500 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "调整原因不超过 500 个字符")
		return
	}
	exam, err := a.store.RescheduleExam(r.Context(), claims.OrgID, examID, store.RescheduleExamParams{
		StartAt: req.StartAt, EndAt: req.EndAt, Reason: req.Reason,
	})
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "exam.rescheduled",
		TargetType: "exam", TargetID: exam.ID,
		Detail: map[string]any{"start_at": req.StartAt, "end_at": req.EndAt, "reason": req.Reason},
	})
	data(w, http.StatusOK, exam)
}

func (a *API) handleListExamCandidates(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	page, pageSize := pagination(r)
	candidates, total, err := a.store.ListExamCandidates(r.Context(), claims.OrgID, examID, page, pageSize)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	listData(w, candidates, page, pageSize, total)
}

// handleListRetakeCandidates 补考候选名单（E-03/S-06）。
func (a *API) handleListRetakeCandidates(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	candidates, err := a.store.ListRetakeCandidates(r.Context(), claims.OrgID, examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	data(w, http.StatusOK, candidates)
}

type addCandidatesRequest struct {
	Candidates []store.CandidateInput `json:"candidates"`
	ClassIDs   []string               `json:"class_ids"`
}

func (a *API) handleAddExamCandidates(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	var req addCandidatesRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !validateCandidateInputs(w, req.Candidates, req.ClassIDs) {
		return
	}
	added, err := a.store.AddExamCandidates(r.Context(), store.AddCandidatesParams{
		OrgID: claims.OrgID, ExamID: examID, Candidates: req.Candidates, ClassIDs: req.ClassIDs,
	})
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "exam.candidates_added",
		TargetType: "exam", TargetID: examID, Detail: map[string]any{"added": added},
	})
	data(w, http.StatusOK, map[string]any{"added": added})
}

func (a *API) handleMyExams(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	exams, err := a.store.ListMyExams(r.Context(), claims.OrgID, claims.Subject)
	if err != nil {
		a.storeError(w, r, err, "暂无考试")
		return
	}
	data(w, http.StatusOK, exams)
}

func (a *API) handleStartAttempt(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	attemptID, err := a.store.StartAttempt(r.Context(), claims.OrgID, claims.Subject, examID)
	if err != nil {
		a.storeError(w, r, err, "考试或考生编排不存在")
		return
	}
	state, err := a.store.GetAttemptState(r.Context(), claims.Subject, attemptID)
	if err != nil {
		a.storeError(w, r, err, "答卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "attempt.started",
		TargetType: "attempt", TargetID: attemptID, Detail: map[string]any{"exam_id": examID},
	})
	data(w, http.StatusCreated, state)
}
