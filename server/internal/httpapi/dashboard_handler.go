package httpapi

import "net/http"

func (a *API) handleDashboard(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFrom(r.Context())
	if !ok {
		apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "请先登录")
		return
	}
	// 管理端概览（学员数/待阅/待审/机构动态）不面向考生；
	// 考生工作台走 /my/exams 与 /my/scores 的数据。
	if actor, ok := actorFrom(r.Context()); ok && actor.Role == "student" {
		apiError(w, http.StatusForbidden, "FORBIDDEN", "考生无管理概览访问权限")
		return
	}

	summary, err := a.store.DashboardSummary(r.Context(), claims.OrgID)
	if err != nil {
		a.log.Error("load dashboard summary failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	data(w, http.StatusOK, summary)
}
