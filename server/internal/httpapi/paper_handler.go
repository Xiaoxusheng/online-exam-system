package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"online-exam-system/server/internal/store"
)

var validPaperTypes = []string{"fixed", "random", "ab"}

type paperRequest struct {
	Type      string                     `json:"type"`
	Title     string                     `json:"title"`
	Rules     json.RawMessage            `json:"rules"`
	Questions []store.PaperQuestionInput `json:"questions"`
}

func validatePaperRequest(req paperRequest) error {
	if !validOneOf(req.Type, validPaperTypes...) {
		return errors.New("试卷类型不正确")
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || utf8.RuneCountInString(req.Title) > 120 {
		return errors.New("试卷标题不能为空且不超过 120 个字符")
	}
	if req.Type == "random" {
		rules, err := store.ParseRandomRules(req.Rules)
		if err != nil {
			return errors.New("随机卷抽题规则不正确：" + err.Error())
		}
		for _, section := range rules.Sections {
			if !validOneOf(section.Type, validQuestionTypes...) {
				return errors.New("随机卷抽题规则包含不支持的题型")
			}
			if section.Difficulty != "" && !validOneOf(section.Difficulty, validDifficulties...) {
				return errors.New("随机卷抽题规则包含不支持的难度")
			}
			if section.BankID != "" {
				if _, err := uuid.Parse(section.BankID); err != nil {
					return errors.New("随机卷抽题规则的题库 ID 不正确")
				}
			}
		}
		return nil
	}
	if len(req.Questions) == 0 {
		return errors.New("固定卷/AB 卷至少需要一道题")
	}
	for _, question := range req.Questions {
		if _, err := uuid.Parse(question.QuestionID); err != nil {
			return errors.New("题目 ID 格式不正确")
		}
		if question.Score <= 0 {
			return errors.New("题目分值必须大于 0")
		}
		if question.PaperGroup != "" && question.PaperGroup != "A" && question.PaperGroup != "B" {
			return errors.New("AB 分组只能是 A 或 B")
		}
	}
	return nil
}

func (a *API) handleListPapers(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	page, pageSize := pagination(r)
	filter := store.PaperFilter{
		Status:   strings.TrimSpace(r.URL.Query().Get("status")),
		Type:     strings.TrimSpace(r.URL.Query().Get("type")),
		Keyword:  strings.TrimSpace(r.URL.Query().Get("keyword")),
		Page:     page,
		PageSize: pageSize,
	}
	if filter.Type != "" && !validOneOf(filter.Type, validPaperTypes...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "试卷类型不正确")
		return
	}
	papers, total, err := a.store.ListPapers(r.Context(), claims.OrgID, filter)
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	listData(w, papers, page, pageSize, total)
}

func (a *API) handleCreatePaper(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req paperRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := validatePaperRequest(req); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}
	paper, err := a.store.CreatePaper(r.Context(), store.CreatePaperParams{
		OrgID: claims.OrgID, Type: req.Type, Title: strings.TrimSpace(req.Title),
		Rules: req.Rules, Questions: req.Questions, CreatedBy: claims.Subject,
	})
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "paper.created",
		TargetType: "paper", TargetID: paper.ID, Detail: map[string]any{"type": paper.Type, "total_score": paper.TotalScore},
	})
	data(w, http.StatusCreated, paper)
}

func (a *API) handleGetPaper(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	paperID, ok := parseUUIDParam(w, pathParam(r, "id"), "试卷 ID")
	if !ok {
		return
	}
	paper, err := a.store.GetPaper(r.Context(), claims.OrgID, paperID)
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	data(w, http.StatusOK, paper)
}

func (a *API) handleUpdatePaper(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	paperID, ok := parseUUIDParam(w, pathParam(r, "id"), "试卷 ID")
	if !ok {
		return
	}
	var req paperRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := validatePaperRequest(req); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}
	paper, err := a.store.UpdatePaper(r.Context(), claims.OrgID, paperID, store.CreatePaperParams{
		OrgID: claims.OrgID, Type: req.Type, Title: strings.TrimSpace(req.Title),
		Rules: req.Rules, Questions: req.Questions, CreatedBy: claims.Subject,
	})
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "paper.updated",
		TargetType: "paper", TargetID: paper.ID, Detail: map[string]any{"version": paper.Version},
	})
	data(w, http.StatusOK, paper)
}

func (a *API) handleSubmitPaperReview(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	paperID, ok := parseUUIDParam(w, pathParam(r, "id"), "试卷 ID")
	if !ok {
		return
	}
	paper, err := a.store.SubmitPaperReview(r.Context(), claims.OrgID, paperID)
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "paper.submitted_review",
		TargetType: "paper", TargetID: paper.ID,
	})
	data(w, http.StatusOK, paper)
}

func (a *API) handleApprovePaper(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	paperID, ok := parseUUIDParam(w, pathParam(r, "id"), "试卷 ID")
	if !ok {
		return
	}
	paper, err := a.store.ApprovePaper(r.Context(), claims.OrgID, paperID)
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "paper.approved",
		TargetType: "paper", TargetID: paper.ID,
	})
	data(w, http.StatusOK, paper)
}

func (a *API) handleRejectPaper(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	paperID, ok := parseUUIDParam(w, pathParam(r, "id"), "试卷 ID")
	if !ok {
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" || utf8.RuneCountInString(req.Reason) > 500 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "驳回理由不能为空且不超过 500 个字符")
		return
	}
	paper, err := a.store.RejectPaper(r.Context(), claims.OrgID, paperID, req.Reason)
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "paper.rejected",
		TargetType: "paper", TargetID: paper.ID, Detail: map[string]any{"reason": req.Reason},
	})
	data(w, http.StatusOK, paper)
}

func (a *API) handleCopyPaper(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	paperID, ok := parseUUIDParam(w, pathParam(r, "id"), "试卷 ID")
	if !ok {
		return
	}
	paper, err := a.store.CopyPaper(r.Context(), claims.OrgID, paperID, claims.Subject)
	if err != nil {
		a.storeError(w, r, err, "试卷不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "paper.copied",
		TargetType: "paper", TargetID: paper.ID, Detail: map[string]any{"source_id": paperID},
	})
	data(w, http.StatusCreated, paper)
}
