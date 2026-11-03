package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
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

// handleNotificationChannels reports which outbound channels are wired so the
// settings page can show real status instead of hopeful labels.
func (a *API) handleNotificationChannels(w http.ResponseWriter, _ *http.Request) {
	email := map[string]any{"configured": false}
	sms := map[string]any{"configured": false, "mode": "none"}
	if a.notifier != nil {
		email["configured"] = a.notifier.EmailConfigured()
		sms["configured"] = true
		if a.notifier.SMSConfigured() {
			sms["mode"] = "gateway"
		} else {
			sms["mode"] = "simulated"
		}
	}
	data(w, http.StatusOK, map[string]any{"email": email, "sms": sms})
}

type testChannelRequest struct {
	Channel   string `json:"channel"`
	Code      string `json:"code"`
	Recipient string `json:"recipient"`
}

// handleTestNotificationChannel renders one template with sample vars and
// delivers it to the given mailbox/phone. Audit-logged like every send.
func (a *API) handleTestNotificationChannel(w http.ResponseWriter, r *http.Request) {
	claims, actor, ok := a.resolveAuth(w, r)
	if !ok {
		return
	}
	var req testChannelRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !validOneOf(req.Channel, "email", "sms") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "channel 仅支持 email 或 sms")
		return
	}
	recipient := strings.TrimSpace(req.Recipient)
	if recipient == "" {
		if req.Channel == "email" {
			recipient = actor.Email
		} else {
			recipient = actor.Phone
		}
	}
	if recipient == "" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "请填写测试接收邮箱或手机号")
		return
	}

	code := strings.TrimSpace(req.Code)
	if code == "" {
		code = "exam_publish"
	}
	vars := map[string]string{
		"exam": "测试考试", "start_at": "2026-01-01 09:00", "end_at": "2026-01-01 11:00",
		"duration": "120", "total": "88.5", "before": "80", "verdict": "已通过", "note": "测试",
		"count": "1",
	}
	title, content, sendable := a.store.RenderChannelTemplate(r.Context(), claims.OrgID, req.Channel, code,
		"测试通知", "这是一条测试通知。", vars)
	if !sendable {
		apiError(w, http.StatusBadRequest, "TEMPLATE_DISABLED", "该通道的模板未启用或不存在，请先在模板列表中启用")
		return
	}

	status, err := a.notifier.Send(r.Context(), req.Channel, recipient, title, content)
	if err != nil {
		data(w, http.StatusOK, map[string]any{"status": "failed", "detail": err.Error(), "recipient": recipient})
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: actor.ID, Action: "notification.test_sent",
		TargetType: "notification_template", TargetID: code,
		Detail: map[string]any{"channel": req.Channel, "recipient": recipient, "status": status, "at": time.Now().Format(time.RFC3339)},
	})
	data(w, http.StatusOK, map[string]any{"status": status, "recipient": recipient})
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

// handleMonitorStats 运行监控（A-08）。
func (a *API) handleMonitorStats(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	stats, err := a.store.GetMonitorStats(r.Context(), claims.OrgID)
	if err != nil {
		a.storeError(w, r, err, "监控数据不可用")
		return
	}
	data(w, http.StatusOK, stats)
}

// handleStorageStats 媒体用量统计（A-06）。
func (a *API) handleStorageStats(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	buckets, activeCount, deletedCount, err := a.store.StorageStats(r.Context(), claims.OrgID)
	if err != nil {
		a.storeError(w, r, err, "存储统计不可用")
		return
	}
	data(w, http.StatusOK, map[string]any{
		"buckets": buckets, "active_count": activeCount, "deleted_pending": deletedCount,
	})
}

// handleStorageCleanup 物理清理软删媒体：删磁盘文件（MEDIA_DIR/key），再删元数据行（A-06）。
func (a *API) handleStorageCleanup(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	const batchLimit = 500
	keys, err := a.store.DeletedMediaKeys(r.Context(), claims.OrgID, batchLimit)
	if err != nil {
		a.storeError(w, r, err, "存储清理不可用")
		return
	}
	purged := int64(0)
	if len(keys) > 0 {
		for _, key := range keys {
			// storage_key 由服务端生成（org/purpose/date/rand.ext），无客户端可控成分；
			// 文件不存在视为已清理，跳过即可。
			_ = os.Remove(filepath.Join(a.cfg.MediaDir, filepath.FromSlash(key)))
		}
		purged, err = a.store.PurgeDeletedMedia(r.Context(), claims.OrgID, keys)
		if err != nil {
			a.storeError(w, r, err, "存储清理不可用")
			return
		}
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "storage.cleaned",
		TargetType: "media", Detail: map[string]any{"candidates": len(keys), "purged": purged},
	})
	data(w, http.StatusOK, map[string]any{"candidates": len(keys), "purged": purged})
}

// handleExportUserData 个人数据导出（A-07）。
func (a *API) handleExportUserData(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	userID, ok := parseUUIDParam(w, pathParam(r, "id"), "用户 ID")
	if !ok {
		return
	}
	exportData, err := a.store.ExportUserData(r.Context(), claims.OrgID, userID)
	if err != nil {
		a.storeError(w, r, err, "用户数据导出失败")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "compliance.user_exported",
		TargetType: "user", TargetID: userID,
	})
	payload, err := json.Marshal(exportData)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL", "导出数据序列化失败")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=user-%s-export.json", userID))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

// handleAnonymizeUser 个人数据注销（A-07）：脱敏 + 停用，考试成绩记录保留。
func (a *API) handleAnonymizeUser(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	userID, ok := parseUUIDParam(w, pathParam(r, "id"), "用户 ID")
	if !ok {
		return
	}
	if userID == claims.Subject {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "不能对自己执行注销操作")
		return
	}
	if err := a.store.AnonymizeUser(r.Context(), claims.OrgID, userID, claims.Subject); err != nil {
		a.storeError(w, r, err, "注销操作失败")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "compliance.user_anonymized",
		TargetType: "user", TargetID: userID,
	})
	data(w, http.StatusOK, map[string]any{"anonymized": true})
}
