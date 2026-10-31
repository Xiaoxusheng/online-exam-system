package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"online-exam-system/server/internal/auth"
	"online-exam-system/server/internal/store"
)

var (
	validRoles      = []string{"org_admin", "exam_admin", "teacher", "reviewer", "proctor", "student"}
	validDataScopes = []string{"org", "campus", "class", "self"}
	validStatuses   = []string{"active", "disabled"}
)

func (a *API) handleListCampuses(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	campuses, err := a.store.ListCampuses(r.Context(), claims.OrgID)
	if err != nil {
		a.storeError(w, r, err, "校区不存在")
		return
	}
	data(w, http.StatusOK, campuses)
}

type campusRequest struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

func (a *API) handleCreateCampus(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req campusRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || utf8.RuneCountInString(req.Name) > 64 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "校区名称不能为空且不超过 64 个字符")
		return
	}
	campus, err := a.store.CreateCampus(r.Context(), claims.OrgID, req.Name, strings.TrimSpace(req.Address))
	if err != nil {
		a.storeError(w, r, err, "校区不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "org.campus_created",
		TargetType: "campus", TargetID: campus.ID, Detail: map[string]any{"name": campus.Name},
	})
	data(w, http.StatusCreated, campus)
}

func (a *API) handleListClasses(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	campusID := strings.TrimSpace(r.URL.Query().Get("campus_id"))
	if campusID != "" {
		if _, ok := parseUUIDParam(w, campusID, "campus_id"); !ok {
			return
		}
	}
	classes, err := a.store.ListClasses(r.Context(), claims.OrgID, campusID)
	if err != nil {
		a.storeError(w, r, err, "班级不存在")
		return
	}
	data(w, http.StatusOK, classes)
}

type classRequest struct {
	Name     string `json:"name"`
	Grade    string `json:"grade"`
	CampusID string `json:"campus_id"`
}

func (a *API) handleCreateClass(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req classRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || utf8.RuneCountInString(req.Name) > 64 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "班级名称不能为空且不超过 64 个字符")
		return
	}
	if req.CampusID != "" {
		if _, ok := validateUUIDField(w, req.CampusID, "campus_id"); !ok {
			return
		}
	}
	class, err := a.store.CreateClass(r.Context(), claims.OrgID, req.CampusID, req.Name, strings.TrimSpace(req.Grade))
	if err != nil {
		a.storeError(w, r, err, "校区不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "org.class_created",
		TargetType: "class", TargetID: class.ID, Detail: map[string]any{"name": class.Name},
	})
	data(w, http.StatusCreated, class)
}

func (a *API) handleListUsers(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination(r)
	filter := store.UserFilter{
		Role:     strings.TrimSpace(r.URL.Query().Get("role")),
		Status:   strings.TrimSpace(r.URL.Query().Get("status")),
		Keyword:  strings.TrimSpace(r.URL.Query().Get("keyword")),
		CampusID: strings.TrimSpace(r.URL.Query().Get("campus_id")),
		ClassID:  strings.TrimSpace(r.URL.Query().Get("class_id")),
		Page:     page,
		PageSize: pageSize,
	}
	if filter.Role != "" && !validOneOf(filter.Role, validRoles...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "角色不正确")
		return
	}
	users, total, err := a.store.ListUsers(r.Context(), scopeFrom(r.Context()), filter)
	if err != nil {
		a.storeError(w, r, err, "用户不存在")
		return
	}
	items := make([]userDTO, 0, len(users))
	for _, user := range users {
		items = append(items, toUserDTO(user))
	}
	listData(w, items, page, pageSize, total)
}

type createUserRequest struct {
	Name      string `json:"name"`
	Username  string `json:"username"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	Role      string `json:"role"`
	DataScope string `json:"data_scope"`
	Status    string `json:"status"`
	CampusID  string `json:"campus_id"`
	ClassID   string `json:"class_id"`
}

func (a *API) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	var req createUserRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Username = strings.TrimSpace(req.Username)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Email = strings.TrimSpace(req.Email)
	if req.Name == "" || req.Username == "" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "姓名与用户名不能为空")
		return
	}
	if utf8.RuneCountInString(req.Username) < 3 || utf8.RuneCountInString(req.Username) > 32 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "用户名长度需为 3-32 个字符")
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 72 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "密码长度需为 8-72 个字符")
		return
	}
	if !validOneOf(req.Role, validRoles...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "角色不正确")
		return
	}
	if req.DataScope == "" {
		req.DataScope = "self"
	}
	if !validOneOf(req.DataScope, validDataScopes...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "数据范围不正确")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}
	if !validOneOf(req.Status, validStatuses...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "账号状态不正确")
		return
	}
	if req.CampusID != "" {
		if _, ok := validateUUIDField(w, req.CampusID, "campus_id"); !ok {
			return
		}
	}
	if req.ClassID != "" {
		if _, ok := validateUUIDField(w, req.ClassID, "class_id"); !ok {
			return
		}
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		a.log.Error("hash user password failed", "error", err)
		apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
		return
	}
	user, err := a.store.CreateUser(r.Context(), store.CreateUserParams{
		OrgID: claims.OrgID, Name: req.Name, Username: req.Username, Phone: req.Phone, Email: req.Email,
		PasswordHash: hash, Role: req.Role, DataScope: req.DataScope, Status: req.Status,
		CampusID: req.CampusID, ClassID: req.ClassID,
	})
	if err != nil {
		a.storeError(w, r, err, "校区或班级不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "org.user_created",
		TargetType: "user", TargetID: user.ID, Detail: map[string]any{"username": user.Username, "role": user.Role},
	})
	data(w, http.StatusCreated, toUserDTO(user))
}

type updateUserRequest struct {
	Name      *string `json:"name"`
	Phone     *string `json:"phone"`
	Email     *string `json:"email"`
	Role      *string `json:"role"`
	DataScope *string `json:"data_scope"`
	Status    *string `json:"status"`
	CampusID  *string `json:"campus_id"`
	ClassID   *string `json:"class_id"`
	Password  *string `json:"password"`
}

func (a *API) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFrom(r.Context())
	userID, ok := parseUUIDParam(w, pathParam(r, "id"), "用户 ID")
	if !ok {
		return
	}
	var req updateUserRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name != nil {
		value := strings.TrimSpace(*req.Name)
		if value == "" {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "姓名不能为空")
			return
		}
		req.Name = &value
	}
	if req.Phone != nil {
		value := strings.TrimSpace(*req.Phone)
		req.Phone = &value
	}
	if req.Email != nil {
		value := strings.TrimSpace(*req.Email)
		req.Email = &value
	}
	if req.Role != nil && !validOneOf(*req.Role, validRoles...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "角色不正确")
		return
	}
	if req.DataScope != nil && !validOneOf(*req.DataScope, validDataScopes...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "数据范围不正确")
		return
	}
	if req.Status != nil && !validOneOf(*req.Status, validStatuses...) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "账号状态不正确")
		return
	}
	if userID == claims.Subject && req.Status != nil && *req.Status != "active" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "不能停用自己的账号")
		return
	}
	if userID == claims.Subject && req.Role != nil && *req.Role != "org_admin" {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "不能修改自己的管理员角色")
		return
	}
	if req.CampusID != nil && *req.CampusID != "" {
		if _, ok := validateUUIDField(w, *req.CampusID, "campus_id"); !ok {
			return
		}
	}
	if req.ClassID != nil && *req.ClassID != "" {
		if _, ok := validateUUIDField(w, *req.ClassID, "class_id"); !ok {
			return
		}
	}

	params := store.UpdateUserParams{
		Name: req.Name, Phone: req.Phone, Email: req.Email, Role: req.Role,
		DataScope: req.DataScope, Status: req.Status, CampusID: req.CampusID, ClassID: req.ClassID,
	}
	if req.Password != nil {
		if len(*req.Password) < 8 || len(*req.Password) > 72 {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST", "密码长度需为 8-72 个字符")
			return
		}
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			a.log.Error("hash user password failed", "error", err)
			apiError(w, http.StatusInternalServerError, "INTERNAL", "服务内部错误")
			return
		}
		params.PasswordHash = &hash
	}

	user, err := a.store.UpdateUser(r.Context(), claims.OrgID, userID, params)
	if err != nil {
		a.storeError(w, r, err, "用户不存在")
		return
	}
	a.audit(r, store.AuditEntry{
		OrgID: claims.OrgID, ActorID: claims.Subject, Action: "org.user_updated",
		TargetType: "user", TargetID: user.ID,
	})
	data(w, http.StatusOK, toUserDTO(user))
}
