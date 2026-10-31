# API 约定与路由清单

> v0.3 · 基础路径 `/api/v1` · 健康检查 `/healthz`、`/readyz` 不带前缀 · 2026-10-31

## 1. 通用约定

- 认证：`Authorization: Bearer <JWT>`；Token 有效期 8 小时。
- 角色：`org_admin`、`exam_admin`、`teacher`、`reviewer`、`proctor`、`student`。`org_admin` 为机构超管，可访问所有业务接口。
- 请求/响应：`application/json; charset=utf-8`。单对象 `{"data": {...}}`；列表 `{"data": [...], "pagination": {"page":1,"page_size":20,"total":0}}`；无内容 `204`。
- 错误：`{"error": {"code": "INVALID_REQUEST", "message": "..."}}`。
- 分页：`page` 默认 1，`page_size` 默认 20、最大 100。
- 时间：ISO 8601（`2026-10-31T08:00:00Z`）；考试计时以服务端时间为准。
- 所有资源 ID 为 UUID；AB 分组取值为 `A` / `B`。

### 错误码

| 码 | HTTP | 说明 |
|---|---|---|
| `INVALID_REQUEST` | 400 | 参数/枚举/JSON 结构校验失败 |
| `UNAUTHORIZED` | 401 | 未登录或 Token 失效 |
| `INVALID_CREDENTIALS` | 401 | 账号或密码错误 |
| `ACCOUNT_DISABLED` | 403 | 账号已停用 |
| `FORBIDDEN` | 403 | 角色或数据范围无权 |
| `NOT_FOUND` | 404 | 资源不存在（越权同样返回此码） |
| `METHOD_NOT_ALLOWED` | 405 | 请求方法不允许 |
| `CONFLICT` | 409 | 唯一约束冲突、答案版本冲突 |
| `INVALID_STATE` | 409 | 当前状态不允许该操作（如已交卷后改答案） |
| `EXAM_NOT_STARTED` | 409 | 考试尚未开始 |
| `EXAM_EXPIRED` | 409 | 考试已结束或答卷已超时 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体或单题答案超过限制 |
| `INSUFFICIENT_QUESTIONS` | 422 | 随机抽题时符合条件的题目不足 |
| `INTERNAL` | 500 | 服务内部错误 |
| `NOT_IMPLEMENTED` | 501 | 明确未实现（当前仅 WebSocket） |

## 2. 已实现接口

### 2.1 认证与工作台

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | `/auth/login` | 公开 | 用户名/手机号 + 密码登录，返回 JWT 与用户 |
| GET | `/auth/me` | 登录用户 | 当前用户信息 |
| POST | `/auth/logout` | 登录用户 | 记录审计；JWT 由客户端丢弃 |
| GET | `/dashboard/summary` | 登录用户 | 学员数、进行中考试、待阅卷、待审核 + 待开始考试 + 最近动态 |

### 2.2 组织与账号（org_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET / POST | `/campuses` | 校区列表 / 创建 |
| GET / POST | `/classes` | 班级列表（可按 `campus_id` 过滤）/ 创建 |
| GET | `/users` | 用户列表；支持 `role`、`status`、`keyword`、`campus_id`、`class_id`、分页 |
| POST | `/users` | 创建用户（姓名、用户名、手机号、初始密码、角色、数据范围、班级/校区） |
| PATCH | `/users/{id}` | 更新姓名/手机号/邮箱/角色/数据范围/状态/班级/校区/重置密码；不能停用自己 |
| GET | `/roles` | 角色矩阵 |
| GET | `/audit-logs` | 审计查询；支持 `action`、`target_type`、`keyword`、`from`、`to`、分页 |
| GET | `/notification-templates` | 通知模板列表 |
| GET | `/system/overview` | 系统概览（用户、题库、试卷、考试、在线答卷等计数） |

### 2.3 题库（teacher / exam_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET / POST | `/question-banks` | 题库列表 / 创建 |
| GET | `/questions` | 题目列表；支持 `bank_id`、`type`、`difficulty`、`status`、`keyword`、分页 |
| POST | `/questions` | 创建题目（自动写入版本 1） |
| GET | `/questions/{id}` | 题目详情（含答案，教师端） |
| PUT | `/questions/{id}` | 更新题目，版本号 +1，写入 `question_revisions` |
| POST | `/questions/{id}/publish` | 发布题目（draft/pending_review → published） |

### 2.4 试卷（teacher / exam_admin；审核通过仅 exam_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/papers` | 列表；支持 `status`、`type`、`keyword`、分页 |
| POST | `/papers` | 创建固定卷 / AB 卷 / 随机卷 |
| GET | `/papers/{id}` | 试卷详情（固定/AB 卷返回题目编排） |
| PUT | `/papers/{id}` | 更新草稿试卷，版本 +1 |
| POST | `/papers/{id}/submit-review` | 草稿 → 待审核 |
| POST | `/papers/{id}/approve` | 待审核 → 已通过（exam_admin） |

固定卷 / AB 卷请求：

```json
{
  "type": "fixed",
  "title": "2026 秋季期中卷",
  "questions": [
    { "question_id": "<uuid>", "section": "一、客观题", "score": 2, "paper_group": "A" }
  ],
  "rules": {}
}
```

随机卷请求：

```json
{
  "type": "random",
  "title": "随机练习卷",
  "rules": {
    "sections": [
      { "name": "随机单选", "bank_id": "<uuid>", "type": "single", "difficulty": "easy", "count": 10, "score": 2 }
    ]
  }
}
```

> 随机卷在**发布考试**时按 `rules.sections` 抽题并固化到快照；抽题不足返回 `INSUFFICIENT_QUESTIONS`。固定卷/AB 卷只能引用已发布题目。

### 2.5 考试与编排（exam_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET / POST | `/exams` | 考试列表 / 创建（含考生编排、班级编排） |
| GET | `/exams/{id}` | 考试详情 |
| POST | `/exams/{id}/publish` | 校验试卷已通过、考生非空，生成试卷快照并进入待开考 |
| GET | `/exams/{id}/candidates` | 考生编排列表 |
| POST | `/exams/{id}/candidates` | 追加考生（用户或班级） |

创建考试请求：

```json
{
  "paper_id": "<uuid>",
  "title": "2026 秋季期中考试",
  "start_at": "2026-11-01T01:00:00Z",
  "end_at": "2026-11-01T03:00:00Z",
  "duration_minutes": 60,
  "rules": { "pass_score": 60, "anonymous_review": true, "show_score": true },
  "proctor_config": { "level": "basic" },
  "candidates": [
    { "user_id": "<uuid>", "paper_group": "A" }
  ],
  "class_ids": []
}
```

- 试卷必须为 `approved`；考生必须是本机构启用状态的 `student`。
- AB 卷按考生 `paper_group` 下发对应题目；未指定时默认 A，班级编排在 AB 卷下自动交替 A/B。

### 2.6 考生作答（student）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/my/exams` | 我的考试（含编排、答卷 ID、成绩状态） |
| POST | `/exams/{id}/attempts` | 开考（幂等）；返回答卷状态与题目 |
| GET | `/attempts/{id}` | 答卷状态；考试中返回题目、已保存答案与剩余秒数；交卷后不返回题目 |
| PUT | `/attempts/{id}/answers/{questionId}` | 保存单题答案，版本乐观锁 |
| POST | `/attempts/{id}/submit` | 交卷（幂等），返回自动判分总分与待阅卷数 |
| POST | `/attempts/{id}/events` | 上报监考事件（切屏、失焦等） |
| GET | `/my/scores` | 已发布成绩 |

答卷状态响应（节选）：

```json
{
  "attempt_id": "<uuid>",
  "exam_id": "<uuid>",
  "status": "in_progress",
  "paper_group": "A",
  "started_at": "2026-11-01T01:00:00Z",
  "deadline": "2026-11-01T02:00:00Z",
  "server_time": "2026-11-01T01:10:00Z",
  "remaining_seconds": 3000,
  "total_score": 10,
  "questions": [
    {
      "question_id": "<uuid>",
      "type": "single",
      "section": "一、客观题",
      "paper_group": "A",
      "content": { "stem": "..." },
      "score": 2,
      "saved_answer": { "value": "A" },
      "answer_version": 1
    }
  ],
  "score": null,
  "pending_review": 0
}
```

保存答案请求：`{"content": {"value": "A"}, "version": 1}`；首次保存 `version` 传 0 并返回 1。过期版本返回 `CONFLICT`。

交卷结果：`{"attempt_id":"...","status":"submitted|graded","total_score":5.5,"score_visible":true,"pending_review":1,"submitted_at":"..."}`。

- 截止时间 = min(个人开考 + 时长, 场次结束)；到时后台任务每 30 秒自动交卷。
- 交卷后答案只读；重复交卷返回同一结果。
- `rules.show_score=false` 时，`total_score` 为 `null`、`score_visible=false`，成绩发布后才可见。
- 全部考生交卷（或标记缺考）后考试自动进入 `ended`。

### 2.7 阅卷（reviewer）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/review-tasks` | 阅卷任务；支持 `status`、`exam_id`、分页 |
| GET | `/review-tasks/{id}` | 任务详情：题目、参考答案、考生答案、满分、是否匿名 |
| POST | `/review-tasks/{id}/submit` | 提交评分与评语，合成答卷总分 |

评分请求：`{"score": 2.5, "comment": "要点完整"}`。分数必须在 `0..题目满分` 之间；全部任务完成后答卷状态转为 `graded`。

### 2.8 成绩与统计（exam_admin / teacher；发布仅 exam_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/scores` | 成绩汇总；支持 `exam_id`、`status`、`keyword`、分页 |
| GET | `/scores/{attemptId}` | 成绩明细（逐题得分、是否需要人工复核） |
| POST | `/scores/publish` | 按考试发布已判分成绩；请求 `{"exam_id":"<uuid>"}` |
| GET | `/analytics/exams/{examId}` | 参考人数、已判分数、平均/最高/最低、及格率、分数段分布 |

统计响应（节选）：

```json
{
  "exam_title": "2026 秋季期中考试",
  "total_score": 100,
  "pass_score": 60,
  "candidate_count": 100,
  "graded_count": 98,
  "average": 76.5,
  "highest": 98,
  "lowest": 32,
  "pass_rate": 88.78,
  "distribution": [
    { "label": "0-59", "count": 11 },
    { "label": "60-69", "count": 22 }
  ]
}
```

未发布成绩对考生不可见；`/my/exams` 中的 `score` 仅在成绩发布后返回，否则为 `null`。

### 2.9 监考（proctor / exam_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/proctor/exams/{examId}/overview` | 候考/考试中/已交卷/缺考、在线数、未处置告警 |
| GET | `/proctor/exams/{examId}/events` | 事件列表；支持 `level`、`handled`、分页 |
| POST | `/proctor/events/{eventId}/handle` | 处置事件；请求 `{"action":"warning","note":"..."}` |
| GET | `/proctor/exams/{examId}/ws` | **未实现，返回 501**（前端可先轮询） |

考生上报事件：`POST /attempts/{id}/events`，请求：

```json
{ "type": "tab_switch", "level": "warning", "snapshot_url": "" }
```

### 2.10 通知与系统

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/notifications` | 登录用户 | 我的通知（分页） |
| PATCH | `/notifications/{id}/read` | 登录用户 | 标记已读 |
| GET | `/notification-templates` | org_admin | 模板列表 |

## 3. 题目 JSON 约定

`questions.content` / `answer` / `score_rule` 均为 JSON 对象。前端渲染与判分按以下结构：

| 题型 | content | answer（标准答案） | 考生答案 | 判分 |
|---|---|---|---|---|
| `single` 单选 | `{"stem":"题干","options":[{"key":"A","text":"..."}]}` | `{"correct":["A"]}` | `{"value":"A"}` | 自动 |
| `multiple` 多选 | 同上 | `{"correct":["A","C"]}` | `{"values":["A","C"]}` | 自动；`score_rule.partial="ratio"` 时少选按比例，有错选 0 分 |
| `judge` 判断 | `{"stem":"题干"}` | `{"correct":["true"]}` | `{"value":"true"}` | 自动 |
| `fill` 填空 | `{"stem":"题干 ____"}` | `{"answers":[["北京","Beijing"],["上海"]],"ignore_case":true,"trim_space":true}` | `{"values":["北京","上海"]}` | 自动；未命中转人工 |
| `short` / `essay` | `{"stem":"题干"}` | `{"reference":"参考答案","rubric":["要点"]}` | `{"text":"作答"}` | 人工 |
| `programming` | `{"stem":"题干","languages":["go"],"starter_code":{},"cases":[{"input":"","output":"","hidden":false}]}` | `{"reference":"..."}` | `{"language":"go","code":"..."}` | 人工（沙箱未实现）；隐藏用例下发时会剔除 |
| `media` | `{"stem":"题干","mode":"audio|video"}` | `{"reference":"..."}` | `{"url":"..."}` | 人工（文件上传未实现） |

> 题型、难度（`easy|medium|hard`）、默认分值与答案结构在创建/更新题目时校验；主观题参考答案允许为空。

## 4. 关键行为

1. **去答案下发**：考生拿到的题目仅包含 `content` 与考生已保存答案；标准答案只存在于快照和阅卷接口。
2. **快照**：发布考试时固化题目内容、答案、分值与分组；后续题库修改不影响已发布考试。
3. **版本冲突**：单题答案使用 `version` 乐观锁，过期版本返回 409，不覆盖新答案。
4. **幂等**：开考、交卷、阅卷提交、成绩发布均按状态/唯一约束保证重复请求安全。
5. **自动收卷**：服务每 30 秒扫描超过个人截止时间的进行中答卷并自动交卷；考试结束状态按考生提交情况推进。
6. **成绩发布**：仅 `graded` 答卷可发布；学生只能看到 `published` 成绩。
7. **审计**：用户变更、题目/试卷审核发布、考试发布、交卷、阅卷、成绩发布、监考处置均写入 `audit_logs`。

## 5. 明确未实现

- WebSocket 监考实时推送（接口保留 501）。
- 编程题隔离沙箱执行与用例判题；当前编程题只走人工阅卷。
- Excel 批量导入/导出、文件上传/抓拍存储。
- 短信/邮件真实发送、通知模板编辑。
- 人脸核验、AI 行为检测、双机位、证书与申诉。
- 阅卷任务按教师分配、双评与仲裁。
- 刷新令牌、登录限流、细分数据范围（campus/class/self）强制。
