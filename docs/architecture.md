# 架构设计

> v0.3 · 2026-10-31 · 对应需求 `exam-requirements.md`

## 1. 总体结构

```text
Browser (React SPA)
   │ HTTPS / JSON + WebSocket(后续)
   ▼
Nginx / Vite dev proxy
   ▼
Go API (chi)  ── PostgreSQL 16
   │
   ├── 判题沙箱（M4，独立进程/容器，隔离执行）
   ├── 媒体存储（本地磁盘 → OSS，后续）
   └── WebSocket 推送（M3，监考实时通道）
```

单仓单服务起步，按模块垂直拆分代码；M3 起 WebSocket 与判题 Worker 独立部署。

## 2. 后端分层

```text
cmd/                 进程入口（api / migrate / seed）
internal/config      环境变量配置
internal/database    pgx 连接池 + 内嵌 SQL 迁移
internal/auth        密码哈希、JWT 签发与校验
internal/store       数据访问（当前：用户、审计；后续按模块扩展）
internal/httpapi     路由、中间件、各模块 handler
```

请求链路：`RequestID → Logger → Recover → CORS → BodyLimit → Auth(JWT) → RequireRoles → Handler`。
每个模块遵循 Handler（参数/响应）→ Store（SQL）→ 领域规则逐步落地，不引入 ORM。

## 3. 模块划分

| 模块 | 职责 | 对应需求 |
|---|---|---|
| auth | 登录、当前用户、登出、登录审计 | C-01 |
| org | 校区、班级、用户、角色数据范围 | A-01/A-02 |
| question | 题库、题目、版本、导入导出、审核 | 5.1 |
| paper | 固定/随机/AB 卷、组卷、快照、审核 | 5.2 |
| exam | 考试计划、考生编排、规则、发布 | 5.3 |
| attempt | 开考、答案保存、交卷、断线恢复 | 5.4 / 6.1 / 6.3 |
| proctor | 设备检测、人脸核验、抓拍、AI 告警、监考台、WebSocket | 5.5 |
| review | 自动判分、编程判题、人工阅卷、双评仲裁 | 5.6 |
| score | 成绩合成、发布、更正、统计与分析 | 5.7 |
| system | 通知、审计查询、存储、监控、合规 | 5.8 |

## 4. 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 语言 | Go | 单二进制部署、并发与 WebSocket 友好，用户技术偏好 |
| Web 框架 | chi | 轻量、标准 `net/http` 兼容、路由分组适合 RBAC |
| 数据访问 | pgx + 手写 SQL | 高频答案写入需要可控 SQL；避免 ORM 黑盒 |
| 数据库 | PostgreSQL 16 | JSONB 承载试卷快照/规则/配置；并发写入与统计强 |
| 鉴权 | JWT（HS256）+ 刷新令牌轮换 | 访问令牌短、刷新令牌可吊销；旧刷新令牌重放触发全家桶吊销 |
| 数据范围 | 请求级加载账号 + SQL 谓词注入 | `peopleFilter`/`bankVisibility` 生成参数化谓词，未知范围按拒绝处理 |
| 迁移 | 内嵌 SQL + 版本表 | 无外部工具依赖，启动/CI 可执行 |
| 前端 | React 19 + antd 5 | 用户明确要求 React；antd 覆盖 B 端表格/表单 |
| 状态 | TanStack Query + Zustand | 服务端状态与全局会话分离，避免自造缓存层 |
| 实时 | WebSocket 房间广播（gorilla/websocket） | 对应 M-09；按考试建房间，心跳 + 慢消费者断开，前端仍可轮询兜底 |
| 实时事件通道 | store 定义 `RealtimePublisher` 接口，由 httpapi 的房间 Hub 实现 | Store 不依赖 HTTP 包，依赖方向保持单向；事件在事务提交后发出 |
| 考试生命周期 | 30s ticker 先结束到期考试并标记缺考，再自动收卷 | 与自动交卷共用一个后台任务，状态推进幂等 |
| 阅卷轮次 | `review_tasks.round`（1-3）+ `(attempt_id, question_id, round)` 唯一索引 | 双评/仲裁可按轮次幂等创建，重复交卷不产生脏任务 |
| 自动收卷 | 服务内 30s ticker | 扫描超过个人截止时间的答卷并幂等交卷 |
| 判分 | 纯函数包 `internal/grading` | 客观题自动判分；主观题生成阅卷任务 |

### 4.1 考试主链路（v0.3 已实现）

1. 命题：题目创建即版本 1，更新递增版本并写 `question_revisions`；发布后才能被固定卷/AB 卷引用。
2. 组卷：固定卷/AB 卷写入 `paper_questions`；随机卷保存 `rules.sections`，在考试发布时抽题。
3. 发布考试：校验试卷 `approved`、考生非空，将题目内容/答案/分值/分组固化到 `paper_snapshots`，考试进入待开考。
4. 开考：校验考生身份与时间窗，创建 `attempts`（含 AB 分组）；答案以 `version` 乐观锁保存。
5. 交卷：按快照自动判分客观题，主观题创建 `review_tasks`（第 1 轮，按考试阅卷教师自动分配）；逐题得分写入 `score_records.detail`。
6. 阅卷：轮次完成后把最终分合并到成绩明细，全部任务完成后答卷转 `graded`。
7. 发布成绩：仅发布 `graded` 答卷；考生只能看到 `published` 成绩。
8. 后台任务：每 30 秒先结束到期考试（未入场考生标记缺考），再自动提交超时答卷；全部考生交卷/缺考后考试转 `ended`。

### 4.2 监考实时化与阅卷协同（v0.4 已实现）

1. 名单配置：`exam_proctors` / `exam_reviewers` 由考务按考试维护（全量覆盖，角色与机构归属校验）。
2. 考场范围：名单为空 → 全机构监考员可进入；名单非空 → 仅名单内可查房间、事件与处置。考务/超管不受限。
3. 事件流：业务写入（开考、交卷、告警、处置、发布、结束）在事务提交后经 `RealtimePublisher` 广播到该考试的房间；无人订阅时为一次 map 查找，无额外开销。
4. 连接治理：`?token=` 鉴权 + Origin 白名单 + 60s ping/75s pong 超时 + 每房间 64 连接上限 + 发送缓冲满即断开慢消费者。
5. 双评：`rules.review_mode=double` 时一评只记录不定分，系统按「待评任务最少 + 排除前一轮教师」自动创建二评；分差在阈值内取平均，超阈值生成三评仲裁，仲裁分即最终分。
6. 兜底：未配置阅卷教师时任务留在公共池（`reviewer_id` 为空）由任意阅卷教师认领，认领后任务归属该教师，他人打开/提交返回 403。
7. 通知：考试发布通知全体考生、成绩发布通知对应考生，`(user_id, source_type, source_id)` 唯一约束保证重复发布不重复发送。

## 5. 数据模型（v0.4 schema）

| 实体 | 表 | 关键点 |
|---|---|---|
| 组织/校区/班级 | `organizations` `campuses` `classes` | 单机构，预留 org_id |
| 用户 | `users` | 统一账号；role 枚举 + data_scope；campus/class 归属；bcrypt |
| 题库/题目 | `question_banks` `questions` `question_assets` `question_revisions` | 题目 JSONB 内容；版本化 |
| 试卷 | `papers` `paper_questions` `paper_snapshots` | 随机规则 JSONB；发布快照 |
| 考试 | `exams` `exam_candidates` `exam_proctors` `exam_reviewers` | 规则/监考配置 JSONB；考生 AB 分组；状态机；考场与阅卷名单 |
| 答卷 | `attempts` `answers` | 答卷 AB 分组；答案 `(attempt_id, question_id)` 主键 + version 乐观锁 |
| 判题/阅卷 | `judge_results` `review_tasks` | 用例结果 JSONB；人工评分按 `round`（1 一评 / 2 二评 / 3 仲裁）唯一 |
| 监考 | `proctor_events` | 分级告警、关键帧、处置留痕 |
| 成绩 | `score_records` | 合成明细 JSONB、发布状态 |
| 系统 | `audit_logs` `notifications` `notification_templates` | 审计只追加；通知带 `source_type`/`source_id` 去重 |

索引覆盖：用户登录、题目筛选、考试状态、答卷状态、监考事件时间线、审计时间。

## 6. 安全设计

- 全站 HTTPS（生产）；JWT 签名密钥仅走环境变量，release 模式缺失即拒绝启动。
- 密码 bcrypt（cost 12）；登录失败限流（后续接 Redis）；敏感操作审计。
- 权限校验分两层：角色路由（org_admin 为超管）+ 数据范围。数据范围已强制：账号目录、成绩列表/明细、考试分析按调用者 `data_scope`（org/campus/class/self）过滤，未知范围一律拒绝；监考按 `exam_proctors` 考场名单、阅卷按任务归属收敛；题库按 `scope`（org/personal/campus）可见性过滤。
- 每次请求按令牌重新加载账号，停用账号或调整角色/范围立即生效（不再等令牌过期）。
- 登录失败限流：账号 5 次、IP 60 次 / 15 分钟（`LOGIN_ACCOUNT_LIMIT`、`LOGIN_IP_LIMIT`、`LOGIN_BLOCK`），单实例内存计数，多副本需换 Redis。
- 刷新令牌轮换与重用检测：`refresh_tokens` 只存哈希，旧令牌重放吊销该用户全部刷新令牌。
- WebSocket 握手前校验 Token、角色与考场名单，并校验 `Origin` 白名单；Token 通过查询参数传递是浏览器限制下的折中，日志不记录查询串。
- 答案保存使用 `version` 乐观锁，拒绝过期写入（需求 6.3）。
- 考生取卷接口剔除标准答案与编程题隐藏用例；快照答案仅服务端与阅卷接口可见（需求 6.4）。
- 匿名阅卷开启时，阅卷任务列表与详情都不返回考生真实姓名（`user_name` 一并按「匿名考生」下发）。
- 交卷/阅卷/成绩发布使用状态校验与幂等路径；自动收卷与到期结束重复执行安全。
- 对外错误统一文案，不泄露资源是否存在。

## 7. 部署形态

| 环境 | 形态 |
|---|---|
| 本地开发 | Go :8081 + Vite :5174 + 本机 PostgreSQL :5432 |
| 测试/生产 | Docker Compose：api + web(nginx) + postgres + redis；后续加 judge worker |
| 可观测 | 结构化日志（slog JSON）、/healthz、/readyz；后续接入指标与 Trace |
