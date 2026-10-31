package httpapi

import "net/http"

func (a *API) handleDashboard(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFrom(r.Context())
	if !ok {
		apiError(w, http.StatusUnauthorized, "UNAUTHORIZED", "请先登录")
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
