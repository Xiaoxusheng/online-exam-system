# 在线考试系统

面向教育培训机构的在线考试平台：题库 → 组卷 → 考试 → 监考 → 阅卷 → 成绩 → 分析。需求见 [exam-requirements.md](./exam-requirements.md)。

当前阶段：**v0.1 工程骨架 + 登录闭环**（全模块路由与页面骨架已就绪，业务功能按 M1–M4 逐步填充）。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · TypeScript · Vite · Ant Design 5 · React Router 7 · TanStack Query · Zustand |
| 后端 | Go 1.27 · chi · pgx v5 · JWT · bcrypt |
| 数据库 | PostgreSQL 16 |
| 工程 | 单仓：`server/` + `web/`，文档在 `docs/` |

## 本地启动

前置：Go 1.27+、Node 22+、PostgreSQL 16（本机可用连接见 `AGENTS.md`）。

```bash
# 1. 建库（仅首次）
createdb -h 127.0.0.1 -U postgres online_exam

# 2. 后端
cd server
go run ./cmd/migrate
go run ./cmd/seed          # 创建默认机构与管理员 admin / Admin@123456（仅开发）
go run ./cmd/api           # http://127.0.0.1:8081

# 3. 前端
cd web
npm install
npm run dev                # http://127.0.0.1:5174
```

默认管理员：`admin` / `Admin@123456`（可用环境变量 `SEED_ADMIN_PASSWORD` 覆盖，生产必须修改）。

## 文档

- [AGENTS.md](./AGENTS.md) — 工程约定与命令（每个任务开始前必读）
- [docs/tasks/current.md](./docs/tasks/current.md) — 唯一计划与进度文件
- [docs/architecture.md](./docs/architecture.md) — 架构与数据模型
- [docs/api.md](./docs/api.md) — 接口约定与路由清单
- [exam-requirements.md](./exam-requirements.md) — 需求文档
