package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

var (
	validQuestionTypes = []string{"single", "multiple", "judge", "fill", "short", "essay", "programming", "media"}
	validDifficulties  = []string{"easy", "medium", "hard"}
)

func validateQuestionPayload(questionType, difficulty string, content, answer, scoreRule json.RawMessage, defaultScore float64) error {
	if !validOneOf(questionType, validQuestionTypes...) {
		return errors.New("题型不正确")
	}
	if !validOneOf(difficulty, validDifficulties...) {
		return errors.New("难度不正确")
	}
	if defaultScore < 0 {
		return errors.New("默认分值不能为负数")
	}
	if !isJSONObject(content) {
		return errors.New("题干内容必须是 JSON 对象")
	}
	var contentMap map[string]any
	if err := json.Unmarshal(content, &contentMap); err != nil {
		return errors.New("题干内容格式不正确")
	}
	stem, _ := contentMap["stem"].(string)
	if strings.TrimSpace(stem) == "" {
		return errors.New("题干不能为空")
	}
	if len(scoreRule) > 0 && !isJSONObject(scoreRule) {
		return errors.New("评分规则必须是 JSON 对象")
	}

	switch questionType {
	case "single", "judge":
		var correct struct {
			Correct []string `json:"correct"`
		}
		if err := json.Unmarshal(answer, &correct); err != nil || len(correct.Correct) != 1 || strings.TrimSpace(correct.Correct[0]) == "" {
			return errors.New("单选题/判断题必须提供一个正确答案")
		}
	case "multiple":
		var correct struct {
			Correct []string `json:"correct"`
		}
		if err := json.Unmarshal(answer, &correct); err != nil || len(correct.Correct) < 1 {
			return errors.New("多选题必须提供正确答案")
		}
	case "fill":
		var correct struct {
			Answers [][]string `json:"answers"`
		}
		if err := json.Unmarshal(answer, &correct); err != nil || len(correct.Answers) == 0 {
			return errors.New("填空题必须提供答案")
		}
		for _, accepted := range correct.Answers {
			if len(accepted) == 0 {
				return errors.New("填空题每个空至少需要一个可接受答案")
			}
		}
	case "short", "essay", "programming", "media":
		if len(answer) > 0 && !isJSONObject(answer) {
			return errors.New("参考答案必须是 JSON 对象")
		}
	}
	return nil
}

func (a *API) handleListQuestionBanks(w http.ResponseWriter, r *http.Request) {
	banks, err := a.store.ListQuestionBanks(r.Context(), scopeFrom(r.Context()))
	if err != nil {
		a.storeError(w, r, err, "题库不存在")
		return
	}
	data(w, http.StatusOK, banks)
}

type questionBankRequest struct {
	Name  string `json:"name"`
	Scope string `json:"scope"`
}

func (a *API) handleCreateQuestionBank(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req questionBankRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || utf8.RuneCountInString(req.Name) > 80 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "题库名称不能为空且不超过 80 个字符")
		return
	}
	if req.Scope == "" {
		req.Scope = "org"
	}
	if !validOneOf(req.Scope, "org", "campus", "personal") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "题库范围不正确")
		return
	}
	bank, err := a.store.CreateQuestionBank(r.Context(), claims.OrgID, claims.Subject, req.Name, req.Scope)
	if err != nil {
		a.storeError(w, r, err, "题库不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "question.bank_created",
		TargetType: "question_bank", TargetID: bank.ID, Detail: map[string]any{"name": bank.Name},
	})
	data(w, http.StatusCreated, bank)
}

func (a *API) handleListQuestions(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination(r)
	filter := store.QuestionFilter{
		BankID:     strings.TrimSpace(r.URL.Query().Get("bank_id")),
		Type:       strings.TrimSpace(r.URL.Query().Get("type")),
		Difficulty: strings.TrimSpace(r.URL.Query().Get("difficulty")),
		Status:     strings.TrimSpace(r.URL.Query().Get("status")),
		Keyword:    strings.TrimSpace(r.URL.Query().Get("keyword")),
		Page:       page,
		PageSize:   pageSize,
	}
	if filter.BankID != "" {
		if _, ok := parseUUIDParam(w, filter.BankID, "bank_id"); !ok {
			return
		}
	}
	if filter.Type != "" && !validOneOf(filter.Type, validQuestionTypes...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "题型不正确")
		return
	}
	questions, total, err := a.store.ListQuestions(r.Context(), scopeFrom(r.Context()), filter)
	if err != nil {
		a.storeError(w, r, err, "题目不存在")
		return
	}
	listData(w, questions, page, pageSize, total)
}

type createQuestionRequest struct {
	BankID         string          `json:"bank_id"`
	Type           string          `json:"type"`
	KnowledgePoint string          `json:"knowledge_point"`
	Difficulty     string          `json:"difficulty"`
	Content        json.RawMessage `json:"content"`
	Answer         json.RawMessage `json:"answer"`
	ScoreRule      json.RawMessage `json:"score_rule"`
	DefaultScore   float64         `json:"default_score"`
}

func (a *API) handleCreateQuestion(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req createQuestionRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, ok := validateUUIDField(w, req.BankID, "bank_id"); !ok {
		return
	}
	if req.Difficulty == "" {
		req.Difficulty = "medium"
	}
	if err := validateQuestionPayload(req.Type, req.Difficulty, req.Content, req.Answer, req.ScoreRule, req.DefaultScore); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}
	question, err := a.store.CreateQuestion(r.Context(), store.CreateQuestionParams{
		OrgID: claims.OrgID, BankID: req.BankID, Type: req.Type,
		KnowledgePoint: strings.TrimSpace(req.KnowledgePoint), Difficulty: req.Difficulty,
		Content: req.Content, Answer: req.Answer, ScoreRule: req.ScoreRule,
		DefaultScore: req.DefaultScore, CreatedBy: claims.Subject,
	})
	if err != nil {
		a.storeError(w, r, err, "题库不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "question.created",
		TargetType: "question", TargetID: question.ID, Detail: map[string]any{"type": question.Type},
	})
	data(w, http.StatusCreated, question)
}

func (a *API) handleGetQuestion(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	questionID, ok := parseUUIDParam(w, pathParam(r, "id"), "题目 ID")
	if !ok {
		return
	}
	question, err := a.store.GetQuestion(r.Context(), claims.OrgID, questionID)
	if err != nil {
		a.storeError(w, r, err, "题目不存在")
		return
	}
	data(w, http.StatusOK, question)
}

type updateQuestionRequest struct {
	Type           *string          `json:"type"`
	KnowledgePoint *string          `json:"knowledge_point"`
	Difficulty     *string          `json:"difficulty"`
	Content        *json.RawMessage `json:"content"`
	Answer         *json.RawMessage `json:"answer"`
	ScoreRule      *json.RawMessage `json:"score_rule"`
	DefaultScore   *float64         `json:"default_score"`
}

func (a *API) handleUpdateQuestion(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	questionID, ok := parseUUIDParam(w, pathParam(r, "id"), "题目 ID")
	if !ok {
		return
	}
	var req updateQuestionRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	existing, err := a.store.GetQuestion(r.Context(), claims.OrgID, questionID)
	if err != nil {
		a.storeError(w, r, err, "题目不存在")
		return
	}
	effectiveType := existing.Type
	if req.Type != nil {
		effectiveType = *req.Type
	}
	effectiveDifficulty := existing.Difficulty
	if req.Difficulty != nil {
		effectiveDifficulty = *req.Difficulty
	}
	effectiveContent := existing.Content
	if req.Content != nil {
		effectiveContent = *req.Content
	}
	effectiveAnswer := existing.Answer
	if req.Answer != nil {
		effectiveAnswer = *req.Answer
	}
	effectiveRule := existing.ScoreRule
	if req.ScoreRule != nil {
		effectiveRule = *req.ScoreRule
	}
	effectiveScore := existing.DefaultScore
	if req.DefaultScore != nil {
		effectiveScore = *req.DefaultScore
	}
	if err := validateQuestionPayload(effectiveType, effectiveDifficulty, effectiveContent, effectiveAnswer, effectiveRule, effectiveScore); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	params := store.UpdateQuestionParams{
		Type: req.Type, Difficulty: req.Difficulty, Content: req.Content, Answer: req.Answer,
		ScoreRule: req.ScoreRule, DefaultScore: req.DefaultScore, ActorID: claims.Subject,
	}
	if req.KnowledgePoint != nil {
		value := strings.TrimSpace(*req.KnowledgePoint)
		params.KnowledgePoint = &value
	}
	question, err := a.store.UpdateQuestion(r.Context(), claims.OrgID, questionID, params)
	if err != nil {
		a.storeError(w, r, err, "题目不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "question.updated",
		TargetType: "question", TargetID: question.ID, Detail: map[string]any{"version": question.Version},
	})
	data(w, http.StatusOK, question)
}

func (a *API) handlePublishQuestion(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	questionID, ok := parseUUIDParam(w, pathParam(r, "id"), "题目 ID")
	if !ok {
		return
	}
	question, err := a.store.PublishQuestion(r.Context(), claims.OrgID, questionID, claims.Subject)
	if err != nil {
		a.storeError(w, r, err, "题目不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "question.published",
		TargetType: "question", TargetID: question.ID,
	})
	data(w, http.StatusOK, question)
}
