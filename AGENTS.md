# AGENTS.md

本文件是项目的工程约定，任何开发任务开始前必读。计划与进度只看 `docs/tasks/current.md`（唯一真相源）。

## 项目概况

在线考试系统（教育培训机构，单机构多校区），覆盖题库、组卷、考试、监考、阅卷、成绩、分析。
需求文档：`exam-requirements.md`；架构：`docs/architecture.md`；接口：`docs/api.md`。

## 技术栈

- 前端：React 19 + TypeScript + Vite + Ant Design 5 + React Router 7 + TanStack Query + Zustand
- 后端：Go 1.27 + chi v5 + pgx v5 + golang-jwt v5 + bcrypt + gorilla/websocket
- 数据库：PostgreSQL 16
- 单仓：`server/`（Go）+ `web/`（React），`docs/` 存放文档

## 目录约定

```text
server/
  cmd/api/           HTTP 服务入口
  cmd/migrate/       数据库迁移执行器
  cmd/seed/          初始数据（机构 + 管理员）
  internal/config/   环境变量配置
  internal/database/ 连接池、迁移（SQL 内嵌）
  internal/auth/     密码哈希、JWT
  internal/store/    数据访问（用户、审计）
  internal/httpapi/  路由、中间件、各模块 handler
web/
  src/api/           HTTP 客户端与接口封装
  src/app/           路由、布局、权限守卫
  src/pages/         页面（按模块分目录）
  src/stores/        Zustand 状态
  src/components/    通用组件
docs/                架构、接口、计划
```

## 本地环境与端口

- PostgreSQL：`127.0.0.1:5432`，用户 `postgres`，空密码，库 `online_exam`（复用本机 StockFlow 的 PG 实例，勿动其他库）
- 后端：`http://127.0.0.1:8081`（8080 被 StockFlow 占用）
- 前端：`http://127.0.0.1:5174`（5173 被 StockFlow 占用），Vite 代理 `/api` → 8081
- 默认管理员：`admin` / `Admin@123456`（仅开发种子，生产必须改）

## 常用命令

```bash
# 后端（在 server/ 下）
go run ./cmd/migrate            # 应用迁移（幂等）
go run ./cmd/seed               # 幂等创建默认机构与管理员
go run ./cmd/api                # 启动 API
go build ./... && go vet ./... && go test ./...

# 前端（在 web/ 下）
npm install
npm run dev                     # 开发服务器
npm run typecheck               # tsc 类型检查
npm run build                   # 生产构建
```

配置全部走环境变量（见 `server/.env.example`），禁止把密钥写入代码或提交 `.env`。

## 后端规范

- 响应统一：成功 `{"data": ...}`（列表带 `pagination`）；失败 `{"error":{"code","message"}}`，错误码大写下划线，如 `INVALID_CREDENTIALS`、`UNAUTHORIZED`、`INVALID_STATE`。
- 路由统一前缀 `/api/v1`；健康检查 `/healthz`、`/readyz` 不带前缀。
- 鉴权：Bearer JWT；角色 `org_admin | exam_admin | teacher | reviewer | proctor | student`，路由按角色分组挂中间件。
- 敏感操作（登录、改分、导出、删除）写 `audit_logs`。
- 迁移只新增文件（`internal/database/migrations/NNNN_xxx.sql`），不改已提交的历史迁移。
- SQL 一律参数化；禁止拼接用户输入。错误对外不泄露内部细节。
- 新增模块时：`internal/httpapi/<module>_handler.go` + `internal/store/<module>_store.go`，并在 `docs/api.md` 登记接口。

## 前端规范

- UI 遵循 Ant Design 5 + Design Token（`src/app/theme.ts`），主色飞书蓝 `#3370FF`，浅色 SaaS 风格；禁止随意引入第二套组件库。
- 页面必须覆盖 Loading / Empty / Error 状态；表格、表单使用 antd 组件。
- 全站中文文案；日期用 dayjs；金额/分数用数字格式化。
- 新增页面必须在 `src/app/routes.tsx` 与菜单 `src/app/navigation.tsx` 同步登记。
- API 调用统一走 `src/api/client.ts`，禁止页面里裸 fetch。
- 环境变量：`VITE_API_BASE_URL` 缺省走 Vite 代理。

## 开发流程（必须遵守）

1. 读本文件 + `docs/tasks/current.md`，检查 `git status`。
2. 复杂任务先在 `docs/tasks/current.md` 更新计划与范围（做什么 / 不做什么）。
3. 按依赖顺序实现：数据层 → 服务层 → API → 前端 → 测试。
4. 完成即验证：后端 `go build ./... && go vet ./... && go test ./...`；前端 `npm run typecheck && npm run build`；UI 改动必须实际打开页面检查。
5. 一个任务一个 commit，提交信息遵循 Conventional Commits（中文 subject 可）。
6. 不得擅自扩大范围、不得删除已有功能规避问题、测试失败不得声称完成。

## 已知边界（v0.5）

- 前端已全量接入真实接口：系统管理、题库、组卷、考试编排与发布、阅卷（双评/仲裁）、成绩发布与分析、监考中心（WebSocket 实时）、考生端作答与成绩；路由与侧栏按角色收敛，越权渲染 403 状态。
- 后端核心链路同 v0.4：组织账号、题库、组卷、考试发布、考生作答、自动判分、人工阅卷（分配/双评/仲裁）、成绩发布、统计、监考事件与 WebSocket、到期自动结束与缺考、站内通知、审计。
- 未实现：编程题隔离沙箱、Excel 导入导出、文件上传与抓拍存储（音视频题当前只收链接）、短信/邮件真实发送、人脸核验与 AI 行为检测。
- 单机构模型：表结构预留 `org_id`；监考考场范围与阅卷任务归属已强制，campus/class/self 细分范围未强制。
- 后台任务每 30 秒执行：先结束到期考试并标记未入场考生缺考，再自动提交超时答卷；交卷、阅卷提交、成绩发布均幂等或带状态校验。
- 编程题、音视频题走人工阅卷；单选、多选、判断、填空自动判分。
- 监考 WebSocket 用 `?token=` 传 JWT（浏览器无法为 WS 附加请求头），该路由不参与 Bearer 中间件；连接断开时前端降级为 15 秒轮询。
