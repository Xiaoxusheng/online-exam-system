package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

// canWatchExam enforces the proctor data scope: exam administrators see every exam of
// the organization, proctors only the rooms they were assigned to. The account passed in
// is the one reloaded for this request, never the role baked into the token.
func (a *API) canWatchExam(w http.ResponseWriter, r *http.Request, actor store.User, examID string) bool {
	switch actor.Role {
	case "org_admin", "exam_admin":
		return true
	case "proctor":
	default:
		apiError(w, http.StatusForbidden, "FORBIDDEN", "无权访问该考场")
		return false
	}
	allowed, err := a.store.CanProctorExam(r.Context(), actor.OrgID, examID, actor.ID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return false
	}
	if !allowed {
		apiError(w, http.StatusForbidden, "FORBIDDEN", "仅可查看分配给你的考试")
		return false
	}
	return true
}

func (a *API) handleProctorRooms(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFrom(r.Context())
	rooms, err := a.store.ListProctorRooms(r.Context(), actor.OrgID, actor.ID, actor.Role != "proctor")
	if err != nil {
		a.storeError(w, r, err, "暂无可监考的考试")
		return
	}
	data(w, http.StatusOK, rooms)
}

func (a *API) handleProctorOverview(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	actor, _ := actorFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "examId"), "考试 ID")
	if !ok {
		return
	}
	if !a.canWatchExam(w, r, actor, examID) {
		return
	}
	overview, err := a.store.GetProctorOverview(r.Context(), claims.OrgID, examID)
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	data(w, http.StatusOK, overview)
}

func (a *API) handleListProctorEvents(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	actor, _ := actorFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "examId"), "考试 ID")
	if !ok {
		return
	}
	if !a.canWatchExam(w, r, actor, examID) {
		return
	}
	page, pageSize := pagination(r)
	events, total, err := a.store.ListProctorEvents(r.Context(), claims.OrgID, examID, store.ProctorEventFilter{
		Level:    strings.TrimSpace(r.URL.Query().Get("level")),
		Handled:  strings.TrimSpace(r.URL.Query().Get("handled")),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		a.storeError(w, r, err, "监考事件不存在")
		return
	}
	listData(w, events, page, pageSize, total)
}

type handleProctorEventRequest struct {
	Action string `json:"action"`
	Note   string `json:"note"`
}

func (a *API) handleHandleProctorEvent(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	actor, _ := actorFrom(r.Context())
	eventID, err := strconv.ParseInt(pathParam(r, "eventId"), 10, 64)
	if err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "事件 ID 格式不正确")
		return
	}
	examID, err := a.store.ProctorEventExam(r.Context(), claims.OrgID, eventID)
	if err != nil {
		a.storeError(w, r, err, "监考事件不存在")
		return
	}
	if !a.canWatchExam(w, r, actor, examID) {
		return
	}
	var req handleProctorEventRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Action = strings.TrimSpace(req.Action)
	req.Note = strings.TrimSpace(req.Note)
	if req.Action == "" || utf8.RuneCountInString(req.Action) > 64 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "处置动作不能为空且不超过 64 个字符")
		return
	}
	if utf8.RuneCountInString(req.Note) > 1000 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "备注不能超过 1000 个字符")
		return
	}
	event, err := a.store.HandleProctorEvent(r.Context(), claims.OrgID, eventID, claims.Subject, req.Action, req.Note)
	if err != nil {
		a.storeError(w, r, err, "监考事件不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "proctor.event_handled",
		TargetType: "proctor_event", TargetID: strconv.FormatInt(eventID, 10),
		Detail: map[string]any{"action": req.Action},
	})
	data(w, http.StatusOK, event)
}
