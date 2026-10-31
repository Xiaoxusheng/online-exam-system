package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"online-exam-system/server/internal/store"
)

// watermarkColumn is appended to every exported sheet so a leaked file can be traced back
// to the account and moment that produced it.
const watermarkColumn = "导出水印"

func exportActor(ctx context.Context) store.User {
	actor, _ := ctx.Value(actorKey).(store.User)
	return actor
}

func watermarkText(ctx context.Context, scope store.Scope, rowCount int) string {
	actor := exportActor(ctx)
	name := actor.Name
	if name == "" {
		name = "未知用户"
	}
	return fmt.Sprintf("内部资料 · 导出人 %s（%s）· 数据范围 %s · %s · 共 %d 行",
		name, roleLabel(actor.Role), scopeLabel(scope.DataScope),
		time.Now().Format("2006-01-02 15:04:05"), rowCount)
}

func rowWatermark(ctx context.Context) string {
	actor := exportActor(ctx)
	return fmt.Sprintf("%s/%s %s", actor.Name, actor.Username, time.Now().Format("2006-01-02 15:04"))
}

func roleLabel(value string) string {
	switch value {
	case "org_admin":
		return "机构管理员"
	case "exam_admin":
		return "考务管理员"
	case "teacher":
		return "教师"
	case "reviewer":
		return "阅卷人"
	case "proctor":
		return "监考人"
	case "student":
		return "学员"
	default:
		return value
	}
}

func scopeLabel(value string) string {
	switch value {
	case "org":
		return "全机构"
	case "campus":
		return "本校区"
	case "class":
		return "本班"
	case "self":
		return "本人"
	default:
		return "未设置"
	}
}

func writeWorkbook(w http.ResponseWriter, filename string, content []byte) {
	safe := url.PathEscape(filename)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="export.xlsx"; filename*=UTF-8''`+safe)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}
