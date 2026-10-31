package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

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

type updateNotificationTemplateRequest struct {
	TitleTpl   *string `json:"title_tpl"`
	ContentTpl *string `json:"content_tpl"`
	Enabled    *bool   `json:"enabled"`
}

func (a *API) handleUpdateNotificationTemplate(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	templateID, ok := parseUUIDParam(w, pathParam(r, "id"), "模板 ID")
	if !ok {
		return
	}
	var req updateNotificationTemplateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	existing, err := a.store.ListNotificationTemplates(r.Context(), claims.OrgID)
	if err != nil {
		a.storeError(w, r, err, "通知模板不存在")
		return
	}
	title, content, enabled := "", "", false
	found := false
	for _, item := range existing {
		if item.ID != templateID {
			continue
		}
		title, content, enabled, found = item.TitleTpl, item.ContentTpl, item.Enabled, true
	}
	if !found {
		apiError(w, http.StatusNotFound, "NOT_FOUND", "通知模板不存在")
		return
	}
	if req.TitleTpl != nil {
		title = strings.TrimSpace(*req.TitleTpl)
	}
	if req.ContentTpl != nil {
		content = strings.TrimSpace(*req.ContentTpl)
	}
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if title == "" || utf8.RuneCountInString(title) > 80 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "标题模板不能为空且不超过 80 字")
		return
	}
	if utf8.RuneCountInString(content) > 1000 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "正文模板不能超过 1000 字")
		return
	}
	template, err := a.store.UpdateNotificationTemplate(r.Context(), claims.OrgID, templateID, title, content, enabled)
	if err != nil {
		a.storeError(w, r, err, "通知模板不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "notification.template_updated",
		TargetType: "notification_template", TargetID: template.ID,
		Detail: map[string]any{"code": template.Code, "enabled": template.Enabled},
	})
	data(w, http.StatusOK, template)
}

func (a *API) handleListNotificationLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	page, pageSize := pagination(r)
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !validOneOf(status, "pending", "sent", "failed", "read") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "通知状态不正确")
		return
	}
	items, total, err := a.store.ListNotificationLogs(r.Context(), claims.OrgID, status,
		strings.TrimSpace(r.URL.Query().Get("keyword")), page, pageSize)
	if err != nil {
		a.storeError(w, r, err, "暂无发送记录")
		return
	}
	listData(w, items, page, pageSize, total)
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
