package httpapi

import (
	"net/http"

	"online-exam-system/server/internal/store"
)

const maxExamStaff = 50

type setExamStaffRequest struct {
	UserIDs []string `json:"user_ids"`
}

func (a *API) handleListExamProctors(w http.ResponseWriter, r *http.Request) {
	a.writeExamStaff(w, r, "proctor")
}

func (a *API) handleListExamReviewers(w http.ResponseWriter, r *http.Request) {
	a.writeExamStaff(w, r, "reviewer")
}

func (a *API) writeExamStaff(w http.ResponseWriter, r *http.Request, kind string) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	var (
		staff []store.ExamStaff
		err   error
	)
	if kind == "proctor" {
		staff, err = a.store.ListExamProctors(r.Context(), claims.OrgID, examID)
	} else {
		staff, err = a.store.ListExamReviewers(r.Context(), claims.OrgID, examID)
	}
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	data(w, http.StatusOK, staff)
}

func (a *API) handleSetExamProctors(w http.ResponseWriter, r *http.Request) {
	a.replaceExamStaff(w, r, "proctor")
}

func (a *API) handleSetExamReviewers(w http.ResponseWriter, r *http.Request) {
	a.replaceExamStaff(w, r, "reviewer")
}

func (a *API) replaceExamStaff(w http.ResponseWriter, r *http.Request, kind string) {
	claims, _ := claimsFrom(r.Context())
	examID, ok := parseUUIDParam(w, pathParam(r, "id"), "考试 ID")
	if !ok {
		return
	}
	var req setExamStaffRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.UserIDs) > maxExamStaff {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "一次最多分配 50 名教师")
		return
	}
	for _, userID := range req.UserIDs {
		if _, ok := parseUUIDParam(w, userID, "教师 ID"); !ok {
			return
		}
	}

	var (
		staff []store.ExamStaff
		err   error
	)
	if kind == "proctor" {
		staff, err = a.store.SetExamProctors(r.Context(), claims.OrgID, examID, req.UserIDs)
	} else {
		staff, err = a.store.SetExamReviewers(r.Context(), claims.OrgID, examID, req.UserIDs)
	}
	if err != nil {
		a.storeError(w, r, err, "考试不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "exam." + kind + "s_assigned",
		TargetType: "exam", TargetID: examID,
		Detail: map[string]any{"count": len(staff)},
	})
	data(w, http.StatusOK, staff)
}
