package httpapi

import (
	"net/http"
	"strings"

	"online-exam-system/server/internal/store"
)

func (a *API) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	page, pageSize := pagination(r)
	items, total, err := a.store.ListNotifications(r.Context(), claims.Subject, page, pageSize)
	if err != nil {
		a.storeError(w, r, err, "通知不存在")
		return
	}
	listData(w, items, page, pageSize, total)
}

func (a *API) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	notificationID, ok := parseUUIDParam(w, pathParam(r, "id"), "通知 ID")
	if !ok {
		return
	}
	if err := a.store.MarkNotificationRead(r.Context(), claims.Subject, notificationID); err != nil {
		a.storeError(w, r, err, "通知不存在")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleListNotificationTemplates(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	templates, err := a.store.ListNotificationTemplates(r.Context(), claims.OrgID)
	if err != nil {
		a.storeError(w, r, err, "通知模板不存在")
		return
	}
	data(w, http.StatusOK, templates)
}

func (a *API) handleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	page, pageSize := pagination(r)
	from, ok := parseTimeQuery(w, r, "from")
	if !ok {
		return
	}
	to, ok := parseTimeQuery(w, r, "to")
	if !ok {
		return
	}
	filter := store.AuditFilter{
		Action:     strings.TrimSpace(r.URL.Query().Get("action")),
		TargetType: strings.TrimSpace(r.URL.Query().Get("target_type")),
		Keyword:    strings.TrimSpace(r.URL.Query().Get("keyword")),
		From:       from,
		To:         to,
		Page:       page,
		PageSize:   pageSize,
	}
	logs, total, err := a.store.ListAuditLogs(r.Context(), claims.OrgID, filter)
	if err != nil {
		a.storeError(w, r, err, "审计日志不存在")
		return
	}
	listData(w, logs, page, pageSize, total)
}

func (a *API) handleSystemOverview(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	overview, err := a.store.GetSystemOverview(r.Context(), claims.OrgID)
	if err != nil {
		a.storeError(w, r, err, "系统概览不可用")
		return
	}
	data(w, http.StatusOK, overview)
}
