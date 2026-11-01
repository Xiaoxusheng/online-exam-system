package httpapi

import (
	"fmt"
	"net/http"
	"path"
	"strings"
	"time"

	"online-exam-system/server/internal/excel"
	"online-exam-system/server/internal/store"
)

var scoreExportColumns = []string{
	"序号", "考生姓名", "登录账号", "校区", "班级", "准考证号", "试卷分组",
	"满分", "及格分", "得分", "是否及格", "成绩状态", "答卷状态",
	"开始时间", "交卷时间", "发布时间", "用时", watermarkColumn,
}

// handleScoreExport writes one exam's scores into an .xlsx workbook. Every row carries the
// exporter watermark and the sheet banner records scope and moment of the export.
func (a *API) handleScoreExport(w http.ResponseWriter, r *http.Request) {
	scope := scopeFrom(r.Context())
	examID := strings.TrimSpace(r.URL.Query().Get("exam_id"))
	if examID == "" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请先选择考试")
		return
	}
	if _, ok := parseUUIDParam(w, examID, "exam_id"); !ok {
		return
	}
	rows, meta, err := a.store.ListScoresForExport(r.Context(), scope, examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}

	stamp := rowWatermark(r.Context())
	values := make([][]any, 0, len(rows))
	for index, item := range rows {
		values = append(values, []any{
			index + 1, item.UserName, item.Username, item.CampusName, item.ClassName, item.TicketNo, item.Group,
			item.MaxScore, item.PassScore, item.Total, passLabel(item.Passed),
			scoreStatusLabel(item.ScoreStatus), attemptStatusLabel(item.AttemptState),
			item.StartedAt, item.SubmittedAt, item.PublishedAt, durationText(item.StartedAt, item.SubmittedAt), stamp,
		})
	}
	sheet := excel.Sheet{
		Name:    "成绩",
		Title:   fmt.Sprintf("%s · %s（满分 %.2f / 及格 %.2f）· %s", meta.ExamTitle, meta.PaperTitle, meta.TotalScore, meta.PassScore, watermarkText(r.Context(), scope, len(values))),
		Headers: scoreExportColumns,
		Rows:    values,
		Widths:  []float64{6, 14, 16, 14, 16, 18, 10, 8, 8, 8, 10, 12, 12, 18, 18, 18, 10, 26},
	}
	judged := judgedRows(rows)
	summary := excel.Sheet{
		Name:    "汇总",
		Headers: []string{"指标", "数值"},
		Widths:  []float64{20, 24},
		Rows: [][]any{
			{"考试", meta.ExamTitle},
			{"试卷", meta.PaperTitle},
			{"满分", meta.TotalScore},
			{"及格线", meta.PassScore},
			{"导出人数", len(values)},
			{"已判分人数", len(judged)},
			{"平均分", averageScore(judged)},
			{"最高分", extremeScore(judged, true)},
			{"最低分", extremeScore(judged, false)},
			{"及格人数", countPassed(judged)},
			{"导出时间", time.Now().Format("2006-01-02 15:04:05")},
			{"导出账号", exportActor(r.Context()).Username},
			{"说明", "统计口径仅含已判分答卷；本表由系统导出，仅供教学管理使用，请勿外传"},
		},
	}
	content, err := excel.Build([]excel.Sheet{sheet, summary})
	if err != nil {
		a.log.Error("build score export failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "导出失败")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: scope.OrgID, ActorID: scope.UserID, Action: "score.exported",
		TargetType: "exam", TargetID: examID, Detail: map[string]any{"count": len(values)},
	})
	writeWorkbook(w, safeFilename(fmt.Sprintf("成绩导出-%s.xlsx", meta.ExamTitle)), content)
}

func passLabel(passed bool) string {
	if passed {
		return "及格"
	}
	return "不及格"
}

func scoreStatusLabel(value string) string {
	switch value {
	case "published":
		return "已发布"
	case "corrected":
		return "已更正"
	case "withheld":
		return "暂扣"
	default:
		return "待发布"
	}
}

func attemptStatusLabel(value string) string {
	switch value {
	case "submitted":
		return "待阅"
	case "graded":
		return "已判分"
	case "published":
		return "已发布"
	case "voided":
		return "已作废"
	default:
		return value
	}
}

func durationText(startedAt time.Time, submittedAt *time.Time) string {
	if submittedAt == nil {
		return ""
	}
	elapsed := submittedAt.Sub(startedAt).Round(time.Second)
	if elapsed < 0 {
		return ""
	}
	hours := int(elapsed.Hours())
	minutes := int(elapsed.Minutes()) % 60
	seconds := int(elapsed.Seconds()) % 60
	if hours > 0 {
		return fmt.Sprintf("%d时%02d分%02d秒", hours, minutes, seconds)
	}
	return fmt.Sprintf("%d分%02d秒", minutes, seconds)
}

// judgedRows keeps only answer sheets that finished grading. A sheet still waiting for
// manual review only carries its objective score, so counting it would drag the average,
// the extremes and the pass count below their real values.
func judgedRows(rows []store.ScoreExportRow) []store.ScoreExportRow {
	judged := make([]store.ScoreExportRow, 0, len(rows))
	for _, item := range rows {
		if item.AttemptState == "graded" || item.AttemptState == "published" {
			judged = append(judged, item)
		}
	}
	return judged
}

func averageScore(rows []store.ScoreExportRow) float64 {
	if len(rows) == 0 {
		return 0
	}
	sum := 0.0
	for _, item := range rows {
		sum += item.Total
	}
	return round2(sum / float64(len(rows)))
}

func extremeScore(rows []store.ScoreExportRow, highest bool) float64 {
	if len(rows) == 0 {
		return 0
	}
	value := rows[0].Total
	for _, item := range rows {
		if (highest && item.Total > value) || (!highest && item.Total < value) {
			value = item.Total
		}
	}
	return round2(value)
}

func countPassed(rows []store.ScoreExportRow) int {
	count := 0
	for _, item := range rows {
		if item.Passed {
			count++
		}
	}
	return count
}

func round2(value float64) float64 {
	return float64(int64(value*100+0.5)) / 100
}

// safeFilename strips separators so an exam title can never escape the download path.
func safeFilename(name string) string {
	replacer := strings.NewReplacer("/", "-", "\\", "-", "..", "-", ":", "-", "*", "-", "?", "-", `"`, "'", "<", "-", ">", "-", "|", "-")
	cleaned := strings.TrimSpace(replacer.Replace(name))
	cleaned = path.Clean("/" + cleaned)[1:]
	if cleaned == "" || cleaned == "." {
		return "导出.xlsx"
	}
	runes := []rune(cleaned)
	if len(runes) > 90 {
		return string(runes[:90])
	}
	return cleaned
}
