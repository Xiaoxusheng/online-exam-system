# API 约定与路由清单

> v0.1 · 基础路径 `/api/v1` · 健康检查不带前缀

## 1. 通用约定

- 认证：`Authorization: Bearer <JWT>`；Token 有效期 8 小时。
- 请求/响应：`application/json; charset=utf-8`。
- 成功响应：
  - 单对象：`{"data": {...}}`
  - 列表：`{"data": [...], "pagination": {"page":1,"page_size":20,"total":0}}`
  - 无内容：`204 No Content`
- 错误响应：`{"error": {"code": "INVALID_CREDENTIALS", "message": "账号或密码错误"}}`
- 分页参数：`page`（默认 1）、`page_size`（默认 20，最大 100）。
- 时间：ISO 8601 UTC（`2026-10-31T08:00:00Z`）。
- 角色：`org_admin` 机构管理员、`exam_admin` 考务管理员、`teacher` 命题教师、`reviewer` 阅卷教师、`proctor` 监考员、`student` 考生。

### 错误码

| 码 | HTTP | 说明 |
|---|---|---|
| `INVALID_REQUEST` | 400 | 参数校验失败 |
| `UNAUTHORIZED` | 401 | 未登录或 Token 无效/过期 |
| `FORBIDDEN` | 403 | 角色或数据范围无权 |
| `NOT_FOUND` | 404 | 资源不存在（越权同样返回此码） |
| `INVALID_CREDENTIALS` | 401 | 账号或密码错误 |
| `ACCOUNT_DISABLED` | 403 | 账号已停用 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体超过大小限制（默认 1MB） |
| `METHOD_NOT_ALLOWED` | 405 | 请求方法不允许 |
| `NOT_IMPLEMENTED` | 501 | 骨架接口，功能未实现 |
| `INTERNAL` | 500 | 服务内部错误 |

## 2. 已实现接口

### POST /auth/login

公开。请求：

```json
{ "account": "admin", "password": "Admin@123456" }
```

`account` 支持用户名或手机号。响应：

```json
{
  "data": {
    "token": "<jwt>",
    "expires_at": "2026-10-31T16:00:00Z",
    "user": {
      "id": "uuid",
      "org_id": "uuid",
      "name": "系统管理员",
      "username": "admin",
      "phone": "13800000000",
      "role": "org_admin",
      "data_scope": "org",
      "status": "active"
    }
  }
}
```

登录成功/失败均写入 `audit_logs`。

### GET /auth/me

需要登录。返回当前用户（结构同上 `user`）。

### POST /auth/logout

需要登录。JWT 无状态，服务端仅记录审计；客户端丢弃 Token。返回 `204`。

### GET /dashboard/summary

需要登录。工作台汇总（骨架数据，全部为 0 或空数组）：

```json
{
  "data": {
    "stats": { "exams_in_progress": 0, "pending_review": 0, "pending_grading": 0, "students": 0 },
    "upcoming_exams": [],
    "recent_activity": []
  }
}
```

## 3. 骨架接口清单

下列接口已注册路由、鉴权与角色控制；**列表返回空数据，写操作返回 `501 NOT_IMPLEMENTED`**。实现时逐个替换 handler 并更新本节状态。

| 方法 | 路径 | 角色 | 说明 | 状态 |
|---|---|---|---|---|
| GET/POST | `/campuses` | org_admin | 校区列表/创建 | 骨架 |
| GET/POST | `/classes` | org_admin, exam_admin | 班级列表/创建 | 骨架 |
| GET/POST | `/users` | org_admin | 用户列表/创建 | 骨架 |
| PATCH | `/users/{id}` | org_admin | 用户更新/停用 | 骨架 |
| GET | `/roles` | org_admin | 角色与权限矩阵 | 骨架 |
| GET | `/audit-logs` | org_admin | 审计日志查询 | 骨架 |
| GET/POST | `/question-banks` | teacher, exam_admin | 题库列表/创建 | 骨架 |
| GET/POST | `/questions` | teacher, exam_admin | 题目列表/创建 | 骨架 |
| GET/PUT | `/questions/{id}` | teacher, exam_admin | 题目详情/更新 | 骨架 |
| POST | `/questions/{id}/publish` | teacher | 题目发布 | 骨架 |
| GET/POST | `/papers` | teacher, exam_admin | 试卷列表/创建 | 骨架 |
| GET | `/papers/{id}` | teacher, exam_admin | 试卷详情 | 骨架 |
| POST | `/papers/{id}/submit-review` | teacher | 提交试卷审核 | 骨架 |
| POST | `/papers/{id}/approve` | exam_admin | 审核通过并锁定 | 骨架 |
| GET/POST | `/exams` | exam_admin | 考试列表/创建 | 骨架 |
| GET | `/exams/{id}` | exam_admin | 考试详情 | 骨架 |
| POST | `/exams/{id}/publish` | exam_admin | 发布考试（生成快照） | 骨架 |
| GET | `/exams/{id}/candidates` | exam_admin | 考生编排列表 | 骨架 |
| GET | `/my/exams` | student | 我的待考/进行中考试 | 骨架 |
| POST | `/exams/{id}/attempts` | student | 开始答卷 | 骨架 |
| GET | `/attempts/{id}` | student | 答卷与题目（按题下发） | 骨架 |
| PUT | `/attempts/{id}/answers/{questionId}` | student | 保存单题答案（version 乐观锁） | 骨架 |
| POST | `/attempts/{id}/submit` | student | 交卷（幂等键） | 骨架 |
| GET | `/my/scores` | student | 我的成绩 | 骨架 |
| GET | `/proctor/exams/{examId}/overview` | proctor, exam_admin | 监考场次概览 | 骨架 |
| GET | `/proctor/exams/{examId}/events` | proctor, exam_admin | 告警事件队列 | 骨架 |
| POST | `/proctor/events/{eventId}/handle` | proctor, exam_admin | 告警处置 | 骨架 |
| GET | `/proctor/exams/{examId}/ws` | proctor, exam_admin | WebSocket 实时通道 | 未实现 |
| GET | `/review-tasks` | reviewer | 阅卷任务列表 | 骨架 |
| GET | `/review-tasks/{id}` | reviewer | 阅卷详情（答卷+标准答案） | 骨架 |
| POST | `/review-tasks/{id}/submit` | reviewer | 提交评分 | 骨架 |
| GET | `/scores` | exam_admin, teacher | 成绩汇总 | 骨架 |
| POST | `/scores/publish` | exam_admin | 发布成绩 | 骨架 |
| GET | `/analytics/exams/{examId}` | exam_admin, teacher | 考试统计与题目分析 | 骨架 |
| GET | `/notifications` | 所有角色 | 我的通知 | 骨架 |
| GET | `/notification-templates` | org_admin | 通知模板 | 骨架 |
| GET | `/system/overview` | org_admin | 系统监控概览 | 骨架 |
| GET | `/healthz` | 公开 | 存活检查 | 已实现 |
| GET | `/readyz` | 公开 | 就绪检查（DB ping） | 已实现 |
