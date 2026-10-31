package excel

import "testing"

func TestBuildThenParseRoundTrip(t *testing.T) {
	content, err := Build([]Sheet{{
		Name:    "题目导入",
		Title:   "第 2 行为表头",
		Headers: []string{"题型", "题干", "正确答案"},
		Rows: [][]any{
			{"单选", "1+1=?", "B"},
			{"判断", "地球是平的", "错"},
		},
		Widths: []float64{10, 40, 12},
	}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	table, err := Parse(content, []string{"题型", "题干"})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if table.Header != 2 {
		t.Errorf("header row = %d, want 2 (title row shifts it)", table.Header)
	}
	if len(table.Rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(table.Rows))
	}
	if got := cellAtForTest(table, 0, "正确答案"); got != "B" {
		t.Errorf("first answer = %q, want B", got)
	}
	if got := cellAtForTest(table, 1, "题干"); got != "地球是平的" {
		t.Errorf("second stem = %q", got)
	}
}

func TestParseRejectsMissingHeader(t *testing.T) {
	content, err := Build([]Sheet{{Name: "空白", Headers: []string{"姓名"}, Rows: [][]any{{"张三"}}}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if _, err := Parse(content, []string{"题型", "题干"}); err == nil {
		t.Fatal("expected an error when the header row is absent")
	}
}

func TestParseTolerateBlankAndShortRows(t *testing.T) {
	content, err := Build([]Sheet{{
		Name:    "S",
		Headers: []string{"题型", "题干", "分值"},
		Rows: [][]any{
			{"单选", "题干一", 5},
			{"", "", ""},
			{"填空", "题干二"},
		},
	}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	table, err := Parse(content, []string{"题型", "题干"})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(table.Rows) != 2 {
		t.Fatalf("rows = %d, want 2 (blank row removed)", len(table.Rows))
	}
	if len(table.Rows[1]) != len(table.Headers) {
		t.Errorf("short row not padded: %v", table.Rows[1])
	}
}

func TestParseStripsRequiredStarFromHeaders(t *testing.T) {
	content, err := Build([]Sheet{{
		Name:    "题目导入",
		Title:   "带 * 的列为必填",
		Headers: []string{"题型*", "题干*", "选项A", "正确答案*", "分值*"},
		Rows:    [][]any{{"判断", "月球绕着地球转", "", "对", "2"}},
	}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	table, err := Parse(content, []string{"题型", "题干"})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	for _, want := range []string{"题型", "题干", "选项A", "正确答案", "分值"} {
		if indexOfHeader(table.Headers, want) < 0 {
			t.Fatalf("header %q missing after normalization: %v", want, table.Headers)
		}
	}
	if table.Header != 2 {
		t.Errorf("header row = %d, want 2", table.Header)
	}
}

func indexOfHeader(headers []string, title string) int {
	for i, header := range headers {
		if header == title {
			return i
		}
	}
	return -1
}

func cellAtForTest(table Table, rowIndex int, header string) string {
	index := -1
	for i, item := range table.Headers {
		if item == header {
			index = i
			break
		}
	}
	if index < 0 || index >= len(table.Rows[rowIndex]) {
		return ""
	}
	return table.Rows[rowIndex][index]
}
