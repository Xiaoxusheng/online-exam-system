package httpapi

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"online-exam-system/server/internal/store"
)

func row(values ...string) []string {
	out := make([]string, len(questionImportColumns))
	copy(out, values)
	return out
}

func TestParseQuestionRowSingle(t *testing.T) {
	draft, err := parseQuestionRow(questionImportColumns, row("单选", "HTTP 404 表示什么？", "未找到", "服务器错误", "成功", "跳转", "", "", "A", "5", "简单", "HTTP"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if draft.Type != "single" || len(draft.Correct) != 1 || draft.Correct[0] != "A" {
		t.Fatalf("draft = %+v", draft)
	}
	if draft.Status != "草稿" && draft.Status != "draft" {
		t.Fatalf("status = %q", draft.Status)
	}
	content, answer, _ := buildQuestionPayload(draft)
	var contentMap map[string]any
	if err := json.Unmarshal(content, &contentMap); err != nil {
		t.Fatal(err)
	}
	options, _ := contentMap["options"].([]any)
	if len(options) != 4 {
		t.Fatalf("options = %d, want 4 (trailing blanks dropped)", len(options))
	}
	var answerMap map[string]any
	_ = json.Unmarshal(answer, &answerMap)
	if got := answerMap["correct"].([]any)[0]; got != "A" {
		t.Fatalf("correct = %v", got)
	}
}

func TestParseQuestionRowIgnoresColumnOrder(t *testing.T) {
	// excel.Parse hands the importer headers already normalized (required-star markers stripped),
	// so a reordered sheet must still resolve by header name.
	headers := []string{"分值", "题干", "难度", "题型", "正确答案"}
	draft, err := parseQuestionRow(headers, []string{"3", "地球的卫星是月球", "简单", "判断", "对"})
	if err != nil {
		t.Fatalf("reordered columns rejected: %v", err)
	}
	if draft.Type != "judge" || draft.Score != 3 || draft.Difficulty != "easy" || draft.Correct[0] != "true" {
		t.Fatalf("draft = %+v", draft)
	}
}

func TestParseQuestionRowMultipleVariants(t *testing.T) {
	for _, value := range []string{"ABD", "A,B,D", "A、B、D", "a b d", " A , B , D "} {
		draft, err := parseQuestionRow(questionImportColumns, row("多选", "哪些是质数？", "2", "3", "4", "5", "", "", value, "6", "中等"))
		if err != nil {
			t.Fatalf("%q: %v", value, err)
		}
		if strings.Join(draft.Correct, "") != "ABD" {
			t.Fatalf("%q parsed as %v", value, draft.Correct)
		}
	}
}

func TestParseQuestionRowRejects(t *testing.T) {
	cases := []struct {
		name    string
		columns []string
		values  []string
		want    string
	}{
		{"未知题型", questionImportColumns, row("听力", "题干", "", "", "", "", "", "", "A", "5"), "题型"},
		{"答案越界", questionImportColumns, row("单选", "题干", "甲", "乙", "", "", "", "", "C", "5"), "选项范围"},
		{"单选多答案", questionImportColumns, row("单选", "题干", "甲", "乙", "丙", "", "", "", "AB", "5"), "一个正确答案"},
		{"多选少答案", questionImportColumns, row("多选", "题干", "甲", "乙", "丙", "", "", "", "A", "5"), "两个正确答案"},
		{"选项有空洞", questionImportColumns, row("单选", "题干", "甲", "", "丙", "", "", "", "A", "5"), "不能为空"},
		{"判断无法识别", questionImportColumns, row("判断", "题干", "", "", "", "", "", "", "maybe", "5"), "判断题答案"},
		{"分值非数字", questionImportColumns, row("单选", "题干", "甲", "乙", "", "", "", "", "A", "五分"), "不是数字"},
		{"分值越界", questionImportColumns, row("单选", "题干", "甲", "乙", "", "", "", "", "A", "0"), "0.5"},
		{"难度不支持", questionImportColumns, row("单选", "题干", "甲", "乙", "", "", "", "", "A", "5", "地狱"), "难度"},
		{"题干为空", questionImportColumns, row("单选", "", "甲", "乙", "", "", "", "", "A", "5"), "题干"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := parseQuestionRow(item.columns, row(item.values...))
			if err == nil {
				t.Fatal("expected an error")
			}
			if !strings.Contains(err.Error(), item.want) {
				t.Fatalf("message = %q, want to contain %q", err.Error(), item.want)
			}
		})
	}
}

func TestParseQuestionRowFill(t *testing.T) {
	draft, err := parseQuestionRow(questionImportColumns, row("填空", "中国的首都是＿，省名是＿。", "", "", "", "", "", "", "北京/首都||江苏，江苏省", "8"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(draft.Blanks) != 2 {
		t.Fatalf("blanks = %v", draft.Blanks)
	}
	if strings.Join(draft.Blanks[0], "/") != "北京/首都" || strings.Join(draft.Blanks[1], "/") != "江苏/江苏省" {
		t.Fatalf("blanks = %v", draft.Blanks)
	}
	_, answer, rule := buildQuestionPayload(draft)
	var answerMap map[string]any
	_ = json.Unmarshal(answer, &answerMap)
	if len(answerMap["answers"].([]any)) != 2 {
		t.Fatalf("answer json = %s", answer)
	}
	var ruleMap map[string]any
	_ = json.Unmarshal(rule, &ruleMap)
	if ruleMap["ignore_case"] != true {
		t.Fatalf("score rule = %s", rule)
	}
}

func TestParseQuestionRowSubjectiveKeepsRubric(t *testing.T) {
	draft, err := parseQuestionRow(questionImportColumns, row("简答", "简述 TCP 三次握手。", "", "", "", "", "", "", "客户端发 SYN，服务端回 SYN+ACK，客户端再 ACK", "10", "困难", "网络", "要点1；要点2", "已发布"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if draft.Status != "published" {
		t.Fatalf("status = %q", draft.Status)
	}
	if len(draft.Rubric) != 2 {
		t.Fatalf("rubric = %v", draft.Rubric)
	}
	content, answer, _ := buildQuestionPayload(draft)
	if !isJSONObject(content) || !isJSONObject(answer) {
		t.Fatal("payload must be JSON objects")
	}
	if err := validateQuestionPayload(draft.Type, draft.Difficulty, content, answer, json.RawMessage(`{}`), draft.Score); err != nil {
		t.Fatalf("payload rejected: %v", err)
	}
}

func TestQuestionExportRoundTrip(t *testing.T) {
	draft, err := parseQuestionRow(questionImportColumns, row("多选", "下列哪些是关系数据库？", "MySQL", "Redis", "PostgreSQL", "MongoDB", "", "", "AC", "6", "中等", "数据库"))
	if err != nil {
		t.Fatal(err)
	}
	content, answer, rule := buildQuestionPayload(draft)
	question := storeQuestionFixture(t, content, answer, rule, draft)
	exported := draftFromQuestion(question, "水印")
	back := make([]string, 0, len(exported))
	for _, cell := range exported {
		back = append(back, stringify(cell))
	}
	parsed, err := parseQuestionRow(questionImportColumns, back)
	if err != nil {
		t.Fatalf("re-import failed: %v (row=%v)", err, back)
	}
	if parsed.Type != draft.Type || parsed.Stem != draft.Stem || strings.Join(parsed.Correct, "") != "AC" {
		t.Fatalf("round trip changed the question: %+v", parsed)
	}
	if parsed.KnowledgePoint != "数据库" || parsed.Score != 6 {
		t.Fatalf("metadata lost: %+v", parsed)
	}
}

func stringify(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	default:
		return ""
	}
}

// storeQuestionFixture packs the three JSON documents the way the store keeps them.
func storeQuestionFixture(t *testing.T, content, answer, rule json.RawMessage, draft questionDraft) store.Question {
	t.Helper()
	return store.Question{
		Type: draft.Type, Content: content, Answer: answer, ScoreRule: rule,
		DefaultScore: draft.Score, Difficulty: draft.Difficulty, KnowledgePoint: draft.KnowledgePoint,
		Status: draft.Status,
	}
}
