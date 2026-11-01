package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/store"
)

// trimName normalises a short display field before validation.
func trimName(value string) string {
	return strings.TrimSpace(value)
}

// handleGetBranding is public: the login page renders it before any session
// exists. It only exposes the display name, slogan and logo URL.
func (a *API) handleGetBranding(w http.ResponseWriter, r *http.Request) {
	branding, err := a.store.GetBranding(r.Context())
	if err != nil {
		a.storeError(w, r, err, "品牌信息不可用")
		return
	}
	data(w, http.StatusOK, branding)
}

type updateBrandingRequest struct {
	Name        *string `json:"name"`
	Slogan      *string `json:"slogan"`
	LogoMediaID *string `json:"logo_media_id"`
}

func (a *API) handleUpdateBranding(w http.ResponseWriter, r *http.Request) {
	claims, actor, ok := a.resolveAuth(w, r)
	if !ok {
		return
	}
	var req updateBrandingRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	branding, err := a.store.GetBranding(r.Context())
	if err != nil {
		a.storeError(w, r, err, "品牌信息不可用")
		return
	}
	name, slogan, logo := branding.Name, branding.Slogan, branding.LogoMediaID
	if req.Name != nil {
		name = trimName(*req.Name)
	}
	if req.Slogan != nil {
		slogan = trimName(*req.Slogan)
	}
	if req.LogoMediaID != nil {
		logo = trimName(*req.LogoMediaID)
		if logo != "" {
			media, mediaErr := a.store.GetMediaFile(r.Context(), claims.OrgID, logo)
			if mediaErr != nil {
				a.storeError(w, r, mediaErr, "Logo 文件不存在")
				return
			}
			if media.Purpose != "branding" {
				apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "Logo 必须使用品牌用途上传的文件")
				return
			}
		}
	}
	if name == "" || utf8.RuneCountInString(name) > 60 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "机构名称不能为空且不超过 60 字")
		return
	}
	if utf8.RuneCountInString(slogan) > 80 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "标语不超过 80 字")
		return
	}

	updated, err := a.store.UpdateBranding(r.Context(), claims.OrgID, name, slogan, logo)
	if err != nil {
		a.storeError(w, r, err, "品牌信息不可用")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: actor.ID, Action: "branding.updated",
		TargetType: "organization", TargetID: claims.OrgID,
		Detail: map[string]any{"name": name, "logo": logo},
	})
	data(w, http.StatusOK, updated)
}
