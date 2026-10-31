# 架构设计

> v0.1 · 2026-10-31 · 对应需求 `exam-requirements.md`

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
| 鉴权 | JWT（HS256）+ 角色中间件 | 无状态横向扩展；后续加刷新令牌与吊销表 |
| 迁移 | 内嵌 SQL + 版本表 | 无外部工具依赖，启动/CI 可执行 |
| 前端 | React 19 + antd 5 | 用户明确要求 React；antd 覆盖 B 端表格/表单 |
| 状态 | TanStack Query + Zustand | 服务端状态与全局会话分离，避免自造缓存层 |
| 实时 | WebSocket + 5s 轮询兜底 | 对应 M-09；断线重连由前端统一处理 |

## 5. 数据模型（v0.1 schema 全量建表）

| 实体 | 表 | 关键点 |
|---|---|---|
| 组织/校区/班级 | `organizations` `campuses` `classes` | 单机构，预留 org_id |
| 用户 | `users` | 统一账号；role 枚举 + data_scope；bcrypt |
| 题库/题目 | `question_banks` `questions` `question_assets` `question_revisions` | 题目 JSONB 内容；版本化 |
| 试卷 | `papers` `paper_questions` `paper_snapshots` | 随机规则 JSONB；发布快照 |
| 考试 | `exams` `exam_candidates` | 规则/监考配置 JSONB；状态机 |
| 答卷 | `attempts` `answers` | 答案 `(attempt_id, question_id)` 主键 + version 乐观锁 |
| 判题/阅卷 | `judge_results` `review_tasks` | 用例结果 JSONB；人工评分 |
| 监考 | `proctor_events` | 分级告警、关键帧、处置留痕 |
| 成绩 | `score_records` | 合成明细 JSONB、发布状态 |
| 系统 | `audit_logs` `notifications` `notification_templates` | 审计只追加；通知渠道 |

索引覆盖：用户登录、题目筛选、考试状态、答卷状态、监考事件时间线、审计时间。

## 6. 安全设计

- 全站 HTTPS（生产）；JWT 签名密钥仅走环境变量，release 模式缺失即拒绝启动。
- 密码 bcrypt（cost 12）；登录失败限流（后续接 Redis）；敏感操作审计。
- 权限校验分两层：角色路由（当前）+ 数据范围（org/campus/class/self，模块落地时实现）。
- 答案保存使用 `version` 乐观锁，拒绝过期写入（需求 6.3）。
- 判题沙箱与媒体访问走独立鉴权，开考前任何角色不可取答案（需求 6.4）。
- 对外错误统一文案，不泄露资源是否存在。

## 7. 部署形态

| 环境 | 形态 |
|---|---|
| 本地开发 | Go :8081 + Vite :5174 + 本机 PostgreSQL :5432 |
| 测试/生产 | Docker Compose：api + web(nginx) + postgres + redis；后续加 judge worker |
| 可观测 | 结构化日志（slog JSON）、/healthz、/readyz；后续接入指标与 Trace |
