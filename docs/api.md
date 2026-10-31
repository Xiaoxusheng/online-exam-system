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

## 2. 已实现接口

### 2.1 认证与工作台

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | `/auth/login` | 公开 | 用户名/手机号 + 密码登录，返回 JWT 与用户 |
| GET | `/auth/me` | 登录用户 | 当前用户信息 |
| POST | `/auth/logout` | 登录用户 | 记录审计；JWT 由客户端丢弃 |
| GET | `/dashboard/summary` | 登录用户 | 学员数、进行中考试、待阅卷、待审核 + 待开始考试 + 最近动态 |

### 2.2 组织与账号（org_admin；用户列表对 exam_admin 只读开放）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET / POST | `/campuses` | 校区列表 / 创建 |
| GET / POST | `/classes` | 班级列表（可按 `campus_id` 过滤）/ 创建 |
| GET | `/users` | 用户列表（org_admin / exam_admin）；支持 `role`、`status`、`keyword`、`campus_id`、`class_id`、分页。考务编排考生需要只读名册 |
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
| GET / PUT | `/exams/{id}/proctors` | 监考员名单（PUT 全量覆盖，`{"user_ids":[...]}`，空数组即清空） |
| GET / PUT | `/exams/{id}/reviewers` | 阅卷教师名单（PUT 全量覆盖） |

创建考试请求：

```json
{
  "paper_id": "<uuid>",
  "title": "2026 秋季期中考试",
  "start_at": "2026-11-01T01:00:00Z",
  "end_at": "2026-11-01T03:00:00Z",
  "duration_minutes": 60,
  "rules": { "pass_score": 60, "anonymous_review": true, "show_score": true, "review_mode": "double", "review_threshold": 2 },
  "proctor_config": { "level": "basic" },
  "candidates": [
    { "user_id": "<uuid>", "paper_group": "A" }
  ],
  "class_ids": []
}
```

- 试卷必须为 `approved`；考生必须是本机构启用状态的 `student`。
- AB 卷按考生 `paper_group` 下发对应题目；未指定时默认 A，班级编排在 AB 卷下自动交替 A/B。
- `rules.review_mode` 只接受 `single`（默认）与 `double`，其他值返回 `INVALID_REQUEST`；`review_threshold`、`pass_score` 不得为负。
- 监考员名单只接受本机构启用状态的 `proctor`，阅卷教师名单只接受 `reviewer`；角色不符返回 `INVALID_STATE`(409)。一次最多 50 人，重复 ID 自动去重。

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

### 2.7 阅卷（reviewer / exam_admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/review-tasks` | 阅卷任务；支持 `status`、`exam_id`、分页。阅卷教师只返回分配给自己的任务与待认领任务 |
| GET | `/review-tasks/{id}` | 任务详情：题目、参考答案、考生答案、满分、是否匿名、全部轮次 |
| POST | `/review-tasks/{id}/submit` | 提交评分与评语，按轮次规则合成答卷总分 |

评分请求：`{"score": 2.5, "comment": "要点完整"}`。分数必须在 `0..题目满分` 之间；全部轮次完成后答卷状态转为 `graded`。

提交响应（节选）：

```json
{
  "task_id": "<uuid>",
  "round": 2,
  "score": 3,
  "finalized": true,
  "final_score": 2.5,
  "arbitration": false,
  "next_task_id": "<uuid>",
  "attempt_total": 4.5,
  "pending_review": 1
}
```

轮次规则（`exams.rules.review_mode` / `review_threshold`）：

1. `single`：一评得分即为该题最终得分。
2. `double`：一评不即时定分，系统自动创建二评任务；二评分差 `|一评 - 二评| ≤ 阈值` 时取两者平均值。
3. 分差超过阈值：创建三评（仲裁）任务，仲裁分即为最终分；`arbitration` 标记本次提交触发了仲裁。
4. 阈值未配置或 ≤ 0 时按该题满分的 20% 计算。
5. 轮次任务在考试配置了阅卷教师时自动分配：优先待评任务最少的教师，并排除同一题前一轮的教师；未配置教师时任务留在公共池（`reviewer_id` 为空），任何阅卷教师都可打开并提交，提交后任务归属该教师。
6. 任务一旦有归属，其他阅卷教师打开或提交返回 `FORBIDDEN`(403)；匿名阅卷开启时列表与详情均不返回考生真实姓名。

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
| GET | `/proctor/exams/{examId}/ws` | 监考实时房间（WebSocket） |

监考数据范围：`exam_proctors` 为空时该考场对本机构所有监考员开放；一旦配置名单，只有名单内的监考员可以打开房间与查询事件，越权返回 `FORBIDDEN`(403)。`exam_admin`、`org_admin` 不受名单限制。

### 2.9.1 监考 WebSocket 协议

连接：`ws://<host>/api/v1/proctor/exams/{examId}/ws?token=<JWT>`

- 浏览器无法为 WebSocket 请求附加 `Authorization` 头，因此该路由不参与 Bearer 中间件，改用 `?token=` 查询参数鉴权；也接受 `Authorization` 头（非浏览器客户端）。
- 握手前校验：`Origin` 必须在 `CORS_ORIGINS` 白名单内（无 `Origin` 的非浏览器客户端放行）；Token 无效返回 401，角色不是 `proctor`/`exam_admin`/`org_admin` 或不在考场名单内返回 403。
- 心跳：服务端每 60 秒发送 ping 帧，75 秒内无 pong 即断开；客户端也可发送 `{"type":"ping"}`，服务端回 `{"type":"pong"}`。
- 房间上限 64 个连接，超出以 `CloseTryAgainLater` 拒绝；发送缓冲满（慢消费者）直接断开该连接，不阻塞其他监考台。

连接成功后第一帧：

```json
{ "type": "connected", "data": { "exam_id": "<uuid>", "exam_title": "...", "exam_status": "in_progress", "online": 2, "server_time": "..." } }
```

后续事件帧为扁平结构（`exam_id` 用于前端过滤房间）：

| `type` | 触发时机 | 主要字段 |
|---|---|---|
| `attempt_started` | 考生开考 | `attempt_id`、`user_id`、`user_name`、`detail.paper_group` |
| `attempt_submitted` | 考生交卷（含自动收卷） | `attempt_id`、`user_name`、`detail.pending_review`、`detail.auto_graded` |
| `proctor_event` | 考生端上报违规/异常 | `attempt_id`、`user_name`、`detail.event_id`、`detail.event_type`、`detail.level` |
| `proctor_event_handled` | 其他监考台处置了告警 | `detail.event_id`、`detail.action` |
| `exam_published` | 考试发布（快照生成、通知已发） | `detail.exam_title`、`detail.candidate_count`、`detail.start_at` |
| `exam_closed` | 考试结束（自动收卷后无人作答，或到期自动结束） | `detail.reason`、`detail.absent`、`detail.candidates` |

考生上报事件：`POST /attempts/{id}/events`，请求：

```json
{ "type": "tab_switch", "level": "warning", "snapshot_url": "" }
```

### 2.10 通知与系统

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/notifications` | 登录用户 | 我的通知（分页）；`source_type`/`source_id` 用于前端跳转 |
| PATCH | `/notifications/{id}/read` | 登录用户 | 标记已读 |
| GET | `/notification-templates` | org_admin | 模板列表 |

站内通知自动生成，无需前端调用：

| 事件 | 接收人 | `source_type` | 标题 |
|---|---|---|---|
| 考试发布 | 该考试全部考生 | `exam_publish` | `考试发布：<考试名>`，正文含考试起止时间与时长 |
| 成绩发布 | 该次发布对应的考生 | `score_publish` | `成绩发布`，正文含《考试名》与得分 |

`(user_id, source_type, source_id)` 唯一：同一考试重复发布成绩不会重复发送。新通知 `status='sent'`，已读后为 `read`。

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
5. **自动收卷**：服务每 30 秒扫描超过个人截止时间（`开始时间 + duration` 与考试 `end_at` 取较早者）的进行中答卷并自动交卷，交卷逻辑与手动一致且幂等。
6. **到期自动结束**：同一轮巡检先结束已过考试窗口（`pending_start`/`in_progress`）的考试——从未开场的考生标记 `absent`；仍有人作答时不提前结束，等自动收卷完成后的下一轮再结束。全员交卷或缺考时考试进入 `ended`。
7. **成绩发布**：仅 `graded` 答卷可发布；学生只能看到 `published` 成绩。重复发布只处理新增的已判分答卷，没有可发布内容且此前无发布记录时返回 `INVALID_STATE`(409)。
8. **实时事件**：开考、交卷、监考事件与处置、考试发布/结束在事务提交后广播到对应考场；发布失败不影响业务写入。
9. **审计**：用户变更、题目/试卷审核发布、考试发布、监考/阅卷名单变更、交卷、阅卷、成绩发布、监考处置均写入 `audit_logs`。

## 5. 明确未实现

- 编程题隔离沙箱执行与用例判题；当前编程题只走人工阅卷。
- Excel 批量导入/导出、文件上传/抓拍存储（`snapshot_url` 仅接受前端传入的字符串）。
- 短信/邮件真实发送、通知模板编辑（站内通知已自动生成）。
- 人脸核验、AI 行为检测、双机位、证书与申诉。
- 校区/班级级数据范围强制（当前只实现监考考场范围与阅卷任务范围）。
- 刷新令牌、登录限流。
- 前端页面接真实接口（当前 `web/` 仍为 UI 骨架）。
