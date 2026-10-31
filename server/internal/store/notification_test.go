package store

import "testing"

func TestExpandPlaceholders(t *testing.T) {
	cases := []struct {
		name string
		text string
		vars map[string]string
		want string
	}{
		{"fills known keys", "《{exam}》得分 {total} 分", map[string]string{"exam": "期中测验", "total": "86.50"}, "《期中测验》得分 86.50 分"},
		{"drops unknown keys", "成绩申诉{verdict}｜{nothing}", map[string]string{"verdict": "已通过"}, "成绩申诉已通过｜"},
		{"empty text stays empty", "", map[string]string{"exam": "x"}, ""},
		{"no vars leaves plain text", "固定文案", nil, "固定文案"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			if got := expandPlaceholders(item.text, item.vars); got != item.want {
				t.Fatalf("got %q, want %q", got, item.want)
			}
		})
	}
}

func TestMasteryLevelBands(t *testing.T) {
	cases := []struct {
		rate float64
		want string
	}{
		{100, "优秀"}, {85, "优秀"}, {84.9, "良好"}, {70, "良好"}, {69, "待巩固"}, {49, "待提升"}, {0, "待提升"},
	}
	for _, item := range cases {
		if got := masteryLevel(item.rate); got != item.want {
			t.Fatalf("rate %.1f => %q, want %q", item.rate, got, item.want)
		}
	}
}
