package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/excel"
	"online-exam-system/server/internal/store"
)

// Excel column layout shared by the import template, the importer and the question export,
// so an exported workbook can be edited and imported back without re-mapping headers.
var questionImportColumns = []string{
	"题型", "题干", "选项A", "选项B", "选项C", "选项D", "选项E", "选项F",
	"正确答案", "分值", "难度", "知识点", "评分要点", "状态",
}

const (
	maxImportRows      = 1000
	maxUploadBytes int = 12 << 20
)

var questionTypeLabels = map[string]string{
	"单选题": "single", "单选": "single", "single": "single",
	"多选题": "multiple", "多选": "multiple", "multiple": "multiple",
	"判断题": "judge", "判断": "judge", "judge": "judge",
	"填空题": "fill", "填空": "fill", "fill": "fill",
	"简答题": "short", "简答": "short", "short": "short",
	"论述题": "essay", "论述": "essay", "essay": "essay",
	"编程题": "programming", "编程": "programming", "programming": "programming",
	"音视频题": "media", "音视频": "media", "media": "media",
}

var difficultyLabels = map[string]string{
	"简单": "easy", "容易": "easy", "易": "easy", "easy": "easy",
	"中等": "medium", "一般": "medium", "medium": "medium",
	"困难": "hard", "较难": "hard", "难": "hard", "hard": "hard",
}

var statusLabels = map[string]string{
	"草稿": "draft", "未发布": "draft", "draft": "draft",
	"待审核": "pending_review", "pending_review": "pending_review",
	"已发布": "published", "发布": "published", "published": "published",
	"归档": "archived", "archived": "archived",
}

var judgeLabels = map[string]string{
	"对": "true", "正确": "true", "是": "true", "√": "true", "✓": "true", "t": "true", "true": "true", "a": "true",
	"错": "false", "错误": "false", "否": "false", "×": "false", "✗": "false", "x": "false", "f": "false", "false": "false", "b": "false",
}

// questionDraft is one parsed and validated spreadsheet row.
type questionDraft struct {
	Type           string
	Stem           string
	Options        []string
	Correct        []string
	Blanks         [][]string
	Reference      string
	Rubric         []string
	Score          float64
	Difficulty     string
	KnowledgePoint string
	Status         string
}

func normalizeCell(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// headerIndex maps a header title to its column offset, or -1 when the column is absent.
func headerIndex(headers []string, title string) int {
	for i, header := range headers {
		if header == title {
			return i
		}
	}
	return -1
}

func cellAt(row []string, headers []string, title string) string {
	index := headerIndex(headers, title)
	if index < 0 || index >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[index])
}

// splitMultipleAnswers accepts "ABD", "A,B,D", "A、B D" and the mixed variants people type into Excel.
func splitMultipleAnswers(raw string) []string {
	upper := strings.ToUpper(strings.TrimSpace(raw))
	separator := strings.NewReplacer("，", ",", "、", ",", "；", ",", ";", ",", " ", ",", "\t", ",", "\n", ",")
	parts := strings.Split(separator.Replace(upper), ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if len(part) == 1 {
			out = append(out, part)
			continue
		}
		// "ABD" without separators: expand letter by letter.
		for _, letter := range part {
			if letter >= 'A' && letter <= 'Z' {
				out = append(out, string(letter))
			}
		}
	}
	seen := make(map[string]bool, len(out))
	unique := make([]string, 0, len(out))
	for _, key := range out {
		if seen[key] {
			continue
		}
		seen[key] = true
		unique = append(unique, key)
	}
	return unique
}

func splitList(raw string) []string {
	normalized := strings.NewReplacer("；", ";", "，", ",", "、", ",", "|", ";").Replace(raw)
	parts := strings.FieldsFunc(normalized, func(r rune) bool { return r == ';' || r == '\n' || r == '\r' })
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

// parseQuestionRow converts one workbook row into a validated draft.
func parseQuestionRow(headers []string, row []string) (questionDraft, error) {
	var draft questionDraft

	typeLabel := cellAt(row, headers, "题型")
	if typeLabel == "" {
		return draft, errors.New("题型不能为空")
	}
	questionType, ok := questionTypeLabels[normalizeCell(typeLabel)]
	if !ok {
		return draft, fmt.Errorf("题型「%s」不支持", typeLabel)
	}
	draft.Type = questionType

	draft.Stem = strings.TrimSpace(strings.ReplaceAll(cellAt(row, headers, "题干"), "\u3000", " "))
	if draft.Stem == "" {
		return draft, errors.New("题干不能为空")
	}
	if utf8.RuneCountInString(draft.Stem) > 2000 {
		return draft, errors.New("题干超过 2000 字")
	}

	options := make([]string, 0, 6)
	for _, letter := range []string{"A", "B", "C", "D", "E", "F"} {
		options = append(options, cellAt(row, headers, "选项"+letter))
	}
	for len(options) > 0 && options[len(options)-1] == "" {
		options = options[:len(options)-1]
	}
	draft.Options = options

	answer := cellAt(row, headers, "正确答案")
	switch questionType {
	case "single", "multiple":
		if len(options) < 2 {
			return draft, errors.New("选择题至少需要两个选项")
		}
		for i, option := range options {
			if option == "" {
				return draft, fmt.Errorf("选项%s 不能为空", string(rune('A'+i)))
			}
		}
		if answer == "" {
			return draft, errors.New("正确答案不能为空")
		}
		correct := splitMultipleAnswers(answer)
		if len(correct) == 0 {
			return draft, errors.New("正确答案不能为空")
		}
		lastKey := string(rune('A' + len(options) - 1))
		for _, key := range correct {
			if key[0] < 'A' || key[0] > 'Z' || int(key[0]-'A') >= len(options) {
				return draft, fmt.Errorf("正确答案「%s」不在选项范围内，可用 A~%s", key, lastKey)
			}
		}
		if questionType == "single" && len(correct) != 1 {
			return draft, errors.New("单选题只能有一个正确答案")
		}
		if questionType == "multiple" && len(correct) < 2 {
			return draft, errors.New("多选题至少需要两个正确答案")
		}
		draft.Correct = correct
	case "judge":
		if answer == "" {
			return draft, errors.New("判断题答案不能为空")
		}
		value, ok := judgeLabels[normalizeCell(answer)]
		if !ok {
			return draft, fmt.Errorf("判断题答案「%s」无法识别，请填写 对/错", answer)
		}
		draft.Correct = []string{value}
	case "fill":
		if answer == "" {
			return draft, errors.New("填空题答案不能为空")
		}
		blanks := strings.Split(strings.NewReplacer("｜", "||", "；", "||", ";", "||").Replace(answer), "||")
		parsed := make([][]string, 0, len(blanks))
		for _, blank := range blanks {
			accepted := strings.Split(strings.NewReplacer("，", "/", ",", "/", "、", "/").Replace(blank), "/")
			cleaned := make([]string, 0, len(accepted))
			for _, item := range accepted {
				item = strings.TrimSpace(item)
				if item != "" {
					cleaned = append(cleaned, item)
				}
			}
			if len(cleaned) == 0 {
				return draft, errors.New("填空题每个空至少要有一个可接受答案")
			}
			parsed = append(parsed, cleaned)
		}
		draft.Blanks = parsed
	default:
		draft.Reference = answer
		draft.Rubric = splitList(cellAt(row, headers, "评分要点"))
	}

	scoreLabel := cellAt(row, headers, "分值")
	if scoreLabel == "" {
		scoreLabel = "5"
	}
	score, err := strconv.ParseFloat(scoreLabel, 64)
	if err != nil {
		return draft, fmt.Errorf("分值「%s」不是数字", scoreLabel)
	}
	if score <= 0 || score > 100 {
		return draft, errors.New("分值必须在 0.5~100 之间")
	}
	draft.Score = math.Round(score*100) / 100

	difficultyLabel := cellAt(row, headers, "难度")
	if difficultyLabel == "" {
		difficultyLabel = "中等"
	}
	difficulty, ok := difficultyLabels[normalizeCell(difficultyLabel)]
	if !ok {
		return draft, fmt.Errorf("难度「%s」不支持，请填写 简单/中等/困难", difficultyLabel)
	}
	draft.Difficulty = difficulty

	draft.KnowledgePoint = cellAt(row, headers, "知识点")
	statusLabel := cellAt(row, headers, "状态")
	if statusLabel == "" {
		statusLabel = "草稿"
	}
	status, ok := statusLabels[normalizeCell(statusLabel)]
	if !ok {
		return draft, fmt.Errorf("状态「%s」不支持，请填写 草稿/已发布", statusLabel)
	}
	draft.Status = status
	return draft, nil
}

// buildQuestionPayload renders a draft into the content/answer/score_rule documents used by the UI.
func buildQuestionPayload(draft questionDraft) (json.RawMessage, json.RawMessage, json.RawMessage) {
	content := map[string]any{"stem": draft.Stem}
	answer := map[string]any{}
	rule := map[string]any{}

	switch draft.Type {
	case "single", "multiple":
		options := make([]map[string]string, 0, len(draft.Options))
		for i, text := range draft.Options {
			options = append(options, map[string]string{"key": string(rune('A' + i)), "text": text})
		}
		content["options"] = options
		answer["correct"] = draft.Correct
		if draft.Type == "multiple" {
			rule["partial"] = "ratio"
		}
	case "judge":
		answer["correct"] = draft.Correct
	case "fill":
		answer["answers"] = draft.Blanks
		rule["ignore_case"] = true
		rule["trim_space"] = true
	default:
		if draft.Reference != "" {
			answer["reference"] = draft.Reference
		}
		if len(draft.Rubric) > 0 {
			answer["rubric"] = draft.Rubric
		}
	}

	rawContent, _ := json.Marshal(content)
	rawAnswer, _ := json.Marshal(answer)
	rawRule, _ := json.Marshal(rule)
	return rawContent, rawAnswer, rawRule
}

// draftFromQuestion reverses buildQuestionPayload for the export sheet.
func draftFromQuestion(question store.Question, watermark string) []any {
	var content map[string]any
	_ = json.Unmarshal(question.Content, &content)
	var answer map[string]any
	_ = json.Unmarshal(question.Answer, &answer)

	stem, _ := content["stem"].(string)
	options := make([]string, 6)
	if raw, ok := content["options"].([]any); ok {
		for i, item := range raw {
			if i >= 6 {
				break
			}
			entry, _ := item.(map[string]any)
			options[i], _ = entry["text"].(string)
		}
	}

	correctText := ""
	switch question.Type {
	case "single", "multiple":
		correctText = strings.Join(toStringSlice(answer["correct"]), "")
	case "judge":
		for _, value := range toStringSlice(answer["correct"]) {
			if value == "true" {
				correctText = "对"
			} else {
				correctText = "错"
			}
		}
	case "fill":
		parts := make([]string, 0)
		if blanks, ok := answer["answers"].([]any); ok {
			for _, blank := range blanks {
				parts = append(parts, strings.Join(toStringSlice(blank), "/"))
			}
		}
		correctText = strings.Join(parts, "||")
	default:
		correctText, _ = answer["reference"].(string)
	}

	rubric := strings.Join(toStringSlice(answer["rubric"]), "；")
	return []any{
		questionTypeLabel(question.Type), stem,
		options[0], options[1], options[2], options[3], options[4], options[5],
		correctText, question.DefaultScore, questionDifficultyLabel(question.Difficulty),
		question.KnowledgePoint, rubric, questionStatusLabel(question.Status), watermark,
	}
}

func toStringSlice(value any) []string {
	list, _ := value.([]any)
	out := make([]string, 0, len(list))
	for _, item := range list {
		if text, ok := item.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func questionTypeLabel(value string) string {
	switch value {
	case "single":
		return "单选"
	case "multiple":
		return "多选"
	case "judge":
		return "判断"
	case "fill":
		return "填空"
	case "short":
		return "简答"
	case "essay":
		return "论述"
	case "programming":
		return "编程"
	case "media":
		return "音视频"
	default:
		return value
	}
}

func questionDifficultyLabel(value string) string {
	switch value {
	case "easy":
		return "简单"
	case "hard":
		return "困难"
	default:
		return "中等"
	}
}

func questionStatusLabel(value string) string {
	switch value {
	case "published":
		return "已发布"
	case "pending_review":
		return "待审核"
	case "archived":
		return "归档"
	default:
		return "草稿"
	}
}

func (a *API) handleQuestionImportTemplate(w http.ResponseWriter, r *http.Request) {
	headers := make([]string, 0, len(questionImportColumns))
	for _, title := range questionImportColumns {
		switch title {
		case "题型", "题干", "正确答案", "分值":
			headers = append(headers, title+"*")
		default:
			headers = append(headers, title)
		}
	}
	sample := []any{"单选", "下列哪一项是 HTTP 状态码「未找到」的取值？", "404", "500", "200", "301", "", "", "A", 5, "简单", "HTTP 协议", "", "草稿"}
	sheets := []excel.Sheet{
		{
			Name:    "题目导入",
			Title:   "第 2 行为表头，请勿修改列名；带 * 的列为必填。第 3 行起填写数据，示例行请删除后再上传。",
			Headers: headers,
			Rows:    [][]any{sample},
			Widths:  []float64{10, 46, 14, 14, 14, 14, 12, 12, 22, 8, 10, 16, 28, 10},
			Validations: []excel.Validation{
				{Columns: []int{1}, Options: []string{"单选", "多选", "判断", "填空", "简答", "论述", "编程", "音视频"}},
				{Columns: []int{11}, Options: []string{"简单", "中等", "困难"}},
				{Columns: []int{14}, Options: []string{"草稿", "已发布"}},
			},
			ValidationRows: maxImportRows,
		},
		{
			Name:    "填写说明",
			Headers: []string{"列名", "说明"},
			Widths:  []float64{16, 96},
			Rows: [][]any{
				{"题型", "单选 / 多选 / 判断 / 填空 / 简答 / 论述 / 编程 / 音视频"},
				{"题干", "必填，不超过 2000 字"},
				{"选项A~F", "单选、多选必填且至少两项；其它题型忽略"},
				{"正确答案", "单选填 A；多选填 ABD 或 A,B,D；判断填 对/错；填空多个空用 || 分隔，同一空的等价答案用 / 分隔；简答/论述填参考答案"},
				{"分值", "0.5~100，默认 5"},
				{"难度", "简单 / 中等 / 困难，默认 中等"},
				{"知识点", "用于知识点掌握度统计，建议填写"},
				{"评分要点", "仅主观题使用，多条用 分号 或 换行 分隔"},
				{"状态", "草稿 / 已发布；已发布题目才能被组卷抽到"},
				{"导入限制", fmt.Sprintf("单次最多 %d 行；题干与库内已有题目完全相同时自动跳过", maxImportRows)},
			},
		},
	}
	content, err := excel.Build(sheets)
	if err != nil {
		a.log.Error("build import template failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "模板生成失败")
		return
	}
	writeWorkbook(w, "题目导入模板.xlsx", content)
}

type importReportRow struct {
	Line    int    `json:"line"`
	Stem    string `json:"stem"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

func (a *API) handleQuestionImport(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	scope := scopeFrom(r.Context())
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "上传内容无法解析，请确认文件小于 8MB")
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck

	bankID := strings.TrimSpace(r.FormValue("bank_id"))
	bankName := strings.TrimSpace(r.FormValue("bank_name"))
	if bankID == "" && bankName == "" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请先选择题库")
		return
	}
	banks, err := a.store.ListQuestionBanks(r.Context(), scope)
	if err != nil {
		a.storeError(w, r, err, "题库不存在")
		return
	}
	target := store.QuestionBank{}
	for _, bank := range banks {
		if (bankID != "" && bank.ID == bankID) || (bankID == "" && bank.Name == bankName) {
			target = bank
			break
		}
	}
	if target.ID == "" {
		apiError(w, http.StatusBadRequest, "INVALID_BANK", "题库不存在或无权访问")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请上传 Excel 文件")
		return
	}
	defer file.Close() //nolint:errcheck
	content, err := io.ReadAll(io.LimitReader(file, int64(maxUploadBytes)+1))
	if err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "文件读取失败")
		return
	}
	if len(content) > maxUploadBytes {
		apiError(w, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "文件超过 12MB 限制")
		return
	}
	table, err := excel.Parse(content, []string{"题型", "题干"})
	if err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_WORKBOOK", err.Error())
		return
	}
	if len(table.Rows) == 0 {
		apiError(w, http.StatusBadRequest, "EMPTY_WORKBOOK", "文件中没有数据行")
		return
	}
	if len(table.Rows) > maxImportRows {
		apiError(w, http.StatusBadRequest, "TOO_MANY_ROWS", fmt.Sprintf("单次最多导入 %d 行，当前 %d 行", maxImportRows, len(table.Rows)))
		return
	}

	report := make([]importReportRow, 0, len(table.Rows))
	created := 0
	published := 0
	skipped := 0
	failed := 0
	seenStems := make(map[string]int, len(table.Rows))

	for index, row := range table.Rows {
		line := table.Header + index + 1
		draft, err := parseQuestionRow(table.Headers, row)
		if err != nil {
			failed++
			report = append(report, importReportRow{Line: line, Stem: firstText(cellAt(row, table.Headers, "题干")), Status: "failed", Message: err.Error()})
			continue
		}
		if previous, dup := seenStems[draft.Stem]; dup {
			skipped++
			report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "skipped", Message: fmt.Sprintf("与文件内第 %d 行重复", previous)})
			continue
		}
		seenStems[draft.Stem] = line

		exists, err := a.store.HasQuestionWithStem(r.Context(), target.ID, draft.Stem)
		if err != nil {
			failed++
			report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "failed", Message: "查重失败，请重试"})
			continue
		}
		if exists {
			skipped++
			report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "skipped", Message: "库内已存在相同题干"})
			continue
		}

		rawContent, rawAnswer, rawRule := buildQuestionPayload(draft)
		if err := validateQuestionPayload(draft.Type, draft.Difficulty, rawContent, rawAnswer, rawRule, draft.Score); err != nil {
			failed++
			report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "failed", Message: err.Error()})
			continue
		}
		question, err := a.store.CreateQuestion(r.Context(), scope, store.CreateQuestionParams{
			OrgID: claims.OrgID, BankID: target.ID, Type: draft.Type, KnowledgePoint: draft.KnowledgePoint,
			Difficulty: draft.Difficulty, Content: rawContent, Answer: rawAnswer, ScoreRule: rawRule,
			DefaultScore: draft.Score, CreatedBy: claims.Subject,
		})
		if err != nil {
			failed++
			report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "failed", Message: "写入失败，请重试"})
			continue
		}
		created++
		if draft.Status == "published" {
			if _, err := a.store.PublishQuestion(r.Context(), scope, question.ID, claims.Subject); err == nil {
				published++
			} else {
				report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "created", Message: "已导入，但自动发布失败，请手动发布"})
				continue
			}
		}
		report = append(report, importReportRow{Line: line, Stem: draft.Stem, Status: "created", Message: ""})
	}

	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "question.imported",
		TargetType: "question_bank", TargetID: target.ID,
		Detail: map[string]any{"total": len(table.Rows), "created": created, "skipped": skipped, "failed": failed},
	})
	data(w, http.StatusOK, map[string]any{
		"bank_id": target.ID, "bank_name": target.Name,
		"total": len(table.Rows), "created": created, "published": published,
		"skipped": skipped, "failed": failed, "report": report,
	})
}

func (a *API) handleQuestionExport(w http.ResponseWriter, r *http.Request) {
	scope := scopeFrom(r.Context())
	filter := store.QuestionFilter{
		BankID:     strings.TrimSpace(r.URL.Query().Get("bank_id")),
		Type:       strings.TrimSpace(r.URL.Query().Get("type")),
		Difficulty: strings.TrimSpace(r.URL.Query().Get("difficulty")),
		Status:     strings.TrimSpace(r.URL.Query().Get("status")),
		Keyword:    strings.TrimSpace(r.URL.Query().Get("keyword")),
	}
	questions, err := a.store.ListQuestionsForExport(r.Context(), scope, filter)
	if err != nil {
		a.storeError(w, r, err, "题目不存在")
		return
	}
	stamp := rowWatermark(r.Context())
	rows := make([][]any, 0, len(questions))
	for _, question := range questions {
		rows = append(rows, draftFromQuestion(question, stamp))
	}
	sheet := excel.Sheet{
		Name:    "题目",
		Title:   watermarkText(r.Context(), scope, len(rows)),
		Headers: append(append([]string{}, questionImportColumns...), watermarkColumn),
		Rows:    rows,
		Widths:  []float64{10, 46, 14, 14, 14, 14, 12, 12, 22, 8, 10, 16, 28, 10, 26},
	}
	content, err := excel.Build([]excel.Sheet{sheet})
	if err != nil {
		a.log.Error("build question export failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "导出失败")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: scope.OrgID, ActorID: exportActor(r.Context()).ID, Action: "question.exported",
		TargetType: "question", Detail: map[string]any{"count": len(rows), "bank_id": filter.BankID},
	})
	writeWorkbook(w, "题目导出.xlsx", content)
}

func firstText(value string) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > 40 {
		return string(runes[:40]) + "…"
	}
	return value
}
