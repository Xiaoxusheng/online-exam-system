package httpapi

import "net/http"

type roleDescriptor struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	DataScope   string `json:"data_scope"`
	Description string `json:"description"`
}

var roleMatrix = []roleDescriptor{
	{Code: "org_admin", Name: "机构管理员", DataScope: "org", Description: "组织、账号、权限、系统配置与品牌"},
	{Code: "exam_admin", Name: "考务管理员", DataScope: "org", Description: "考试计划、编排、监考配置、成绩发布"},
	{Code: "teacher", Name: "命题教师", DataScope: "class", Description: "题库维护、组卷、提交审核"},
	{Code: "reviewer", Name: "阅卷教师", DataScope: "class", Description: "主观题与音视频评分、编程题复核"},
	{Code: "proctor", Name: "监考员", DataScope: "class", Description: "实时监考、告警处置、违规记录"},
	{Code: "student", Name: "考生", DataScope: "self", Description: "参加考试、查看成绩与申诉"},
}

func (a *API) handleRoles(w http.ResponseWriter, _ *http.Request) {
	data(w, http.StatusOK, roleMatrix)
}
