# 在线考试系统

面向教育培训机构的在线考试平台：题库 → 组卷 → 考试 → 监考 → 阅卷 → 成绩 → 分析。需求见 [exam-requirements.md](./exam-requirements.md)。

当前阶段：**v2.8**。题库 → 组卷 → 考试编排 → 考生作答 → 自动判分 → 人工阅卷（双评/仲裁/连续批阅）→ 成绩发布与分析 → 成绩更正与申诉 → Excel 导入导出 → 轻监考（切屏/全屏/水印/抓拍/监考报告/违规挂起成绩）→ 媒体上传与音视频作答 → 补考，全链路已接入真实接口并上线。未实现项见下方[已知限制](#已知限制v28)。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · TypeScript · Vite · Ant Design 5 · React Router 7 · TanStack Query · Zustand |
| 后端 | Go 1.27 · chi · pgx v5 · JWT · bcrypt · websocket · excelize（Excel 导入导出） |
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

## 全链路验收

```bash
cd server && go run ./cmd/api       # 先启动 API 并完成 migrate/seed
node scripts/e2e_backend.mjs        # 题库→组卷→考试→作答→阅卷→成绩→统计
```

> E2E 脚本面向开发库，会创建以 `E2E ` 为前缀的测试数据与临时考生账号。

## 文档

- [AGENTS.md](./AGENTS.md) — 工程约定与命令（每个任务开始前必读）
- [docs/tasks/current.md](./docs/tasks/current.md) — 唯一计划与进度文件
- [docs/architecture.md](./docs/architecture.md) — 架构与数据模型
- [docs/api.md](./docs/api.md) — 接口约定与路由清单
- [exam-requirements.md](./exam-requirements.md) — 需求文档

## 已知限制（v2.8）

- 轻监考而非严肃考试：已做切屏/失焦、强制全屏、禁复制、答题水印、定时抓拍、违规分级处置与挂起成绩、考后监考报告；**未做考前人脸核验与 AI 行为检测**（依赖外部 AI 服务选型）。
- 编程题无判题沙箱与考生端代码编辑器，一律人工阅卷（明确决定不做）。
- 短信/邮件只有通道抽象与投递台账，未绑定真实服务商；未配置时降级为站内 + 模拟投递。
- 媒体与抓拍落本地磁盘（`MEDIA_DIR`），未接对象存储；题干正文纯文本，无富文本与 LaTeX 公式渲染（题干配图支持）。
- 登录失败限流为单实例内存计数；到期收卷与自动交卷依赖 30 秒轮询（最大延迟约 30 秒）。
- 运维中心只有数据库计数派生的指标（在考答卷、进行中场次、24h 交卷/告警/登录失败/通知失败、存储用量），无 WS 连接数、接口延迟分位与错误率。
- 单机构模型（一机构多校区），固定 6 角色 RBAC + 四级数据范围，无自定义角色与 SaaS 自助开通。
- 未做：准考证号自定义规则、多场次编排、候考时间窗、练习模式与错题本、双人监考交接班、巡考视图、阅卷质检抽查、班级横向对比、证书与成绩验真、i18n、CI 与 Docker 编排。
- 完整缺口清单与推进计划见 [docs/tasks/current.md](./docs/tasks/current.md)。
