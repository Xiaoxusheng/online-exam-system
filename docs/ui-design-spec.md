# UI 设计规范 v3.0 — Light SaaS Dashboard + Soft Mint + Clean Enterprise Admin

> 适用范围：`web/` 全站（管理端 16 页 + 考生端 4 页 + 6 个浮层）。
> 约束：继续用 React 19 + antd 5.29 + Design Token，**不引入第二套 UI 框架**；结构由 antd 组件承担，`design-v2.css` 只做外壳精修。
> 主色保留亮蓝 `#2175FF`；薄荷绿只做辅助（成功、在线、完成度、hover 极浅底），不做主色。
> 侧边栏改近黑 `#0A0A0C`（层级描边，不平涂死黑）。

## 0. 一句话执行提示词（复制这段给任意 agent 即可）

```
在现有 React 19 + Ant Design 5 项目上做全站换肤，风格 = Light SaaS Dashboard + Soft Mint UI + Clean Enterprise Admin。
只改主题 token 与样式层，不改业务逻辑、路由、接口、权限。

1) 中性层：画布 #F4F6FA，卡片 #FFFFFF，抬升层 #FFFFFF + 1px #E6EAF1 描边，浮层阴影 0 12px 32px -16px rgba(16,24,40,.18)。
2) 品牌层：主色 #2175FF（按钮/选中/链接/进度）；薄荷 #17A67C 仅用于成功态、在线点、完成度、hover 极浅底 #F1FAF6；
   警告 #E8930C、危险 #DC4B4B、信息 #2F6FE0；中性文字 #111A2E / #5B6579 / #8C96A9。
3) 侧边栏：近黑 #0A0A0C + 右 1px #1C1D22 分隔，不投影；菜单项 36px 高、圆角 8、左右外边距 10；
   默认文字 #A7ADBA、图标 16px 置于 22px 盒内；hover 背景 rgba(255,255,255,.055) 且文字 #EAECF0；
   选中 背景 rgba(33,117,255,.18) + 左侧 3px #4C8DFF 指示条 + 文字 #FFFFFF；分组标题 11px #5C6270 + 字距 .08em。
4) 圆角分级：控件 7、卡片 10、浮层 12、徽标 6、胶囊 999；禁止万物大圆角。
5) 间距只用 4/8/12/16/20/24/32；页面左右 padding 24（≥1440 用 28），卡片内边距 16，卡片间距 12，区块间距 20。
6) 字号：页标题 19/650、区块标题 14/600、正文 13、次要 12、说明 11.5；所有数字 tabular-nums。
7) 动画只用：入场 translateY(6px)+opacity 240ms cubic-bezier(.22,.61,.36,1)；卡片 hover translateY(-2px)+边框变深 160ms；
   按钮按下 scale(.985) 90ms；进行中呼吸点 1.8s；prefers-reduced-motion 下只保留 opacity。禁止飞入、漂浮、发光。
8) 交互：表格整行可点进详情抽屉（行 hover 只变底色不变形）；工具栏一行内最多一个主按钮；
   选中行后浮出批量条；加载用 Skeleton 不用整页 spinner；空态 = 图标 + 标题 + 一句说明 + 一个动作按钮；
   错误态说清「发生了什么 / 为什么 / 下一步」。
9) 暗黑模式重新设计而非反色：画布 #0B0F16、卡片 #131A25、抬升 #18212E、描边 #232B3A、
   文字 #E6EAF2/#9AA5B8/#6F7A8D，主色提亮为 #6D9AFF，薄荷 #34C79A，侧栏仍 #0A0A0C（描边改 #23252C）。
10) 覆盖全部页面（含考生端与移动端 390px），逐页按 docs/ui-design-spec.md 第 3 节的尺寸表执行，
    完成后用无头浏览器截图 + getComputedStyle 量化验收，不允许只看代码就说改完。
```

## 1. 设计判断（先定原则，再谈像素）

- **页面类型决定布局**：工作台 = Dashboard（状态优先，不做四张均质小卡平铺）；题库/试卷/考试/成绩/账号 = List（Toolbar → Filter → Table → Pagination）；考试详情/试卷预览 = Detail（Header 身份+状态+操作 → Summary → 主内容 + 侧信息）；品牌/通知配置 = Settings（分类 + 内容 + 保存态）；监考中心 = 实时看板（考场卡片网格 → 进入后指标 + 事件流）；作答页 = 专注模式（无侧栏、单栏、题卡流）。
- **视觉层级**：一眼是「当前页要办的事」，二眼是关键数字，三眼才是明细。Level 1 每页只有一个。
- **颜色比例**：中性 90%，蓝 6%，薄荷/语义 4%。页面不能变彩虹。
- **卡片存在理由**：只有独立信息/独立操作/独立状态才用卡片；同一区块内禁止卡片套卡片。

## 2. 全局 Token（亮色）

```
/* 中性层 */
--app-canvas        #F4F6FA   页面画布（比现在的 #FAFBFC 深一档，让白卡真正"浮"起来）
--app-surface       #FFFFFF   卡片 / 面板
--app-surface-alt   #FAFBFD   表头、斑马纹、次级容器
--app-surface-hover #F5F8FE   行/卡 hover 底
--app-border        #E6EAF1   主描边
--app-border-soft   #EEF1F6   内部分隔线
--app-border-strong #D7DEE9   输入框/需要强调的描边

/* 文字 */
--app-text          #111A2E
--app-text-secondary #5B6579
--app-text-tertiary #8C96A9
--app-text-inverse  #FFFFFF

/* 品牌与语义 */
--app-primary       #2175FF
--app-primary-hover #1B5FE0
--app-primary-soft  #EAF2FF
--app-primary-line  #BFD8FF
--app-mint          #17A67C   成功 / 在线 / 完成
--app-mint-soft     #EAF7F2
--app-mint-line     #BFE4D6
--app-warning       #E8930C   --app-warning-soft #FDF3E2
--app-danger        #DC4B4B   --app-danger-soft  #FCEBEB
--app-violet        #6D5AE0   仅用于「仲裁/三评」等特殊状态，全站不超过 2 处

/* 形状与阴影 */
--app-radius-sm 6 / --app-radius 7 / --app-radius-lg 10 / --app-radius-pop 12 / pill 999
--app-shadow-none  none
--app-shadow-card  0 1px 2px rgba(16,24,40,.04)
--app-shadow-lift  0 6px 18px -10px rgba(16,24,40,.14)   卡片 hover
--app-shadow-pop   0 12px 32px -16px rgba(16,24,40,.18)  抽屉/弹窗/下拉

/* 动效 */
--app-ease   cubic-bezier(.22,.61,.36,1)
--app-fast   120ms  按钮按下、图标、开关
--app-base   160ms  hover、边框、底色
--app-enter  240ms  入场、抽屉内容、标签切换
--app-slow   300ms  抽屉/弹窗外壳
```

**antd token 映射**：`colorBgLayout=#F4F6FA`、`colorBgContainer=#FFFFFF`、`colorBorder=#E6EAF1`、`colorBorderSecondary=#EEF1F6`、`borderRadius=7`、`borderRadiusLG=10`、`controlHeight=32`、`fontSize=13`。

## 3. 逐页尺寸表（执行时逐条对照）

### 3.1 外壳（AppLayout，全站）

| 元素 | 规格 |
|---|---|
| 侧栏展开宽 | 248px；折叠 64px；背景 `#0A0A0C`；右 1px `#1C1D22`；无阴影 |
| 品牌行 | 高 56px，padding `0 14px`；Logo 32×32 圆角 8；机构名 13.5/600 `#F2F4F7`，副标语 10.5 `#5C6270` 单行截断 |
| 分组标题 | 11px `#5C6270`，字距 .08em，高 28px，padding `0 20px`，上边距 8 |
| 菜单项 | 高 36、圆角 8、左右外边距 10、内距 `0 10px`、图标 16 置于 22×22 盒、文字 13/500 |
| 菜单态 | 默认 `#A7ADBA`；hover 底 `rgba(255,255,255,.055)` 文字 `#EAECF0` 位移 x+1px 160ms；选中 底 `rgba(33,117,255,.18)` + 左 3px `#4C8DFF` 圆头条 + 文字 `#FFFFFF` + 图标 `#7FA9FF` |
| 侧栏底部 | 高 44：版本 chip（11px、圆角 6、底 `rgba(255,255,255,.06)`、文字 `#8A9099`）+ 服务状态点（6px，正常 `#34C79A`，异常 `#DC4B4B`） |
| 顶栏 | 高 56、白底、下 1px `#E6EAF1`；面包屑 12px；右侧图标按钮 32×32 圆角 8，hover 底 `#F1F4F9` |
| 内容区 | padding `20px 24px 32px`（≥1440 时 `24px 28px 40px`）；最大宽 1560 居中 |
| 移动端 | 侧栏 → Drawer（宽 272，同近黑配色）；顶栏 52；内容 padding 16 |

### 3.2 页面头（PageHeader，所有页）

高 64（含下边距 20）；标题 19/650 `#111A2E`，下方说明 12.5 `#8C96A9`（最多一行）；右侧操作区一行，**最多一个 primary**，按钮 32 高、圆角 7、图标 15、间距 8；标题左侧可放 24×24 图标盒（仅考生端与运维页）。

### 3.3 工作台（Dashboard，`/`）

- **Level 1 状态带**：一张 `panel-card`（宽 100%、内距 16、圆角 10）内含 4 个指标格，格间 1px 竖分隔；格子高 76；图标 28×28 圆角 8（`--app-primary-soft` 底）；数值 26/650 tabular-nums；标签 12 `#5B6579`；副说明 11.5 `#8C96A9`。**不做四张独立小卡平铺**。
- **Level 2 主区**：左 2fr「待办与场次」+ 右 1fr「最近动态」，列间距 16。
- 待办列表行高 52，左侧 3px 状态色条（待阅卷 `#E8930C`、待审核 `#2175FF`、异常 `#DC4B4B`），右侧数量 15/600 tabular-nums。
- 最近动态用 antd `Timeline`，条目 12.5，时间 11.5 `#8C96A9`，圆点 8px 白底主色描边。
- 快捷入口：4 列栅格，格子高 72、圆角 10、图标 32 圆角 9、标题 13/600、说明 11.5；hover 只加 `--app-shadow-lift` + 边框变 `--app-primary-line`，**不位移**（避免与指标带抢戏）。

### 3.4 List 页（题库 / 试卷 / 考试 / 成绩 / 账号 / 审计）

- 结构：`filter-bar`（白卡，内距 12 16，圆角 10，控件间距 8，右对齐按钮组）→ `panel-card` 表格卡（内距 0，圆角 10，overflow hidden）。
- 表头 40px 高、`#FAFBFD` 底、12/600 `#5B6579`、无上边框、下 1px `#EEF1F6`。
- 行高：单行表 48（`cellPaddingBlock: 13`）；带缩略信息的双行表（题库 / 试卷）实测 60–66，属正常，不为凑数砍信息。单元格 padding `0 16`，行间 1px `#EEF1F6`。
- 行 hover 底 `#F5F8FE`，**不变形不加阴影**；整行可点（cursor pointer）→ 详情抽屉；行内操作收进「查看 / 更多(Dropdown)」，最多 2 个可见按钮。
- 数字/分数/时间列一律 `tabular-nums` 右对齐或等宽左对齐。
- 分页：底栏 56，右对齐，与表格间 1px 分隔。
- 批量：勾选后表头上方浮出批量条（高 44、底 `#EAF2FF`、文字 `#1B5FE0`、圆角 8、淡入 160ms）。

### 3.5 监考中心（`/proctor`）

- 考场选择：卡片网格 `repeat(auto-fill, minmax(320px,1fr))`，间距 12；卡片高 132、内距 14、圆角 10。
- 卡片头：考场名 14/600 + 状态 tag；进行中：左 3px `#34C79A` 竖条 + 6px 呼吸点（1.8s）；未分配：`#8C96A9`。
- 卡内指标 3 列（在考/已交/告警），数字 18/650 tabular-nums，标签 11.5。
- 进入考场后：指标带（同 3.3 规格，8 格）→ 告警与事件表（List 规格）；连接状态 chip 在页头右侧：实时=薄荷点 + `#17A67C` 文字，断开=灰点 + 12px。

### 3.6 阅卷工作台（`/review/workbench`）

三栏：左队列 280px（固定）+ 中作答区 1fr + 右评分面板 320px；栏间距 12；整体最小高 `calc(100vh - 168px)`。
- 队列项高 60、圆角 8、选中底 `#EAF2FF` + 左 3px 主色条；未读点 6px `#E8930C`。
- 中栏：题卡（内距 16、圆角 12、卡间距 12）；题干 14/1.75；**选项两列网格**（`grid-template-columns: repeat(2, minmax(0,1fr))`，gap 8，行高 44、圆角 8、描边 `#EEF1F6`、选中主色描边 + `#EAF2FF` 底、字母徽标 22×22 圆角 6；≤640px 回落单列，判断题正好一行两列）。
- 右栏 sticky：得分输入 40 高、快捷给分按钮 32×40 圆角 7、评语模板 chip 高 26。
- 键盘提示条：底部 32px、`#FAFBFD` 底、11.5 `#8C96A9`。

### 3.7 数据分析 / 运维中心

- 顶部指标带同 3.3。
- 图表卡高 ≥320，内距 16；图例 12；坐标轴文字 11.5 `#8C96A9`；网格线 `#EEF1F6`；主色柱 `#2175FF`，第二序列用薄荷 `#17A67C`，第三序列用 `#8C96A9`（禁止彩虹配色）。
- 掌握度/正确率用 `Progress`（线高 6、圆角 3、轨道 `#EEF1F6`），达标 `#17A67C`、临界 `#E8930C`、落后 `#DC4B4B`。
- 运维中心三个页签内容区 padding 16；监控指标格高 84；存储桶条高 8。

### 3.8 考生端

- **登录页**：左右分栏（表单 380px + 品牌预览区），≥1024 时预览区显示；移动端只留表单 + 顶部品牌。输入框 40 高、圆角 8、focus ring `0 0 0 3px rgba(33,117,255,.10)`。
- **我的考试/我的成绩**：List 规格；状态 tag 用点 + 文字（未开始灰、进行中薄荷、已结束蓝、异常红）。
- **作答页**：无侧栏无顶栏（除考试信息条 56px：考试名 13.5/600 + 倒计时 16/650 tabular-nums + 交卷按钮）；题卡最大宽 860 居中、内距 20、圆角 12、卡间距 12；题号 13/600 + 分值 chip；选项行高 48；答题卡抽屉宽 320；水印层不动。
- **移动端 390**：题卡 padding 16；表格全部转 List Item（高 64、左右 padding 12）；批量条转底部吸顶栏；抽屉宽度 100%。

### 3.9 浮层

| 浮层 | 规格 |
|---|---|
| 试卷预览抽屉 | 宽 720（≥1600 时 760）；内距 16 20；题卡同 3.6；卡间距 12 |
| 题目预览与试答弹窗 | 宽 640；圆角 12；内距 20 |
| Excel 导入弹窗 | 宽 680；Dragger 高 148；结果摘要区 `#FAFBFD` 底圆角 8 |
| 设备自检弹窗 | 宽 560；检测项行高 48，通过=薄荷勾，未通过=红叉 |
| 监考报告抽屉 | 宽 860；时间轴 + 汇总表；表头 40 |
| 通知/下拉浮层 | 圆角 12、`--app-shadow-pop`、内距 8 |

## 4. 动画与交互清单（只允许这些）

| 场景 | 动效 |
|---|---|
| 页面/区块入场 | `opacity 0→1` + `translateY(6px→0)`，240ms `--app-ease`；卡片按 40ms 递增，最多 5 张参与 |
| 卡片 hover | 边框 `#E6EAF1→#D7DEE9` + `shadow-card→shadow-lift`，160ms；指标带格子 hover 位移 `translateY(-2px)`，仅此一处位移 |
| 按钮 | hover 底色/边框变化 120ms；按下 `scale(.985)` 90ms；loading 用 antd 内置 |
| 表格行 | hover 变底色 120ms；选中行左 3px 主色条宽度过渡 160ms |
| 抽屉/弹窗 | antd 默认 300ms；内容再延迟 120ms 淡入 |
| 页签切换 | 内容淡入 200ms，ink bar 滑动用 antd 默认 |
| 进行中呼吸点 | 6px 圆点 `#34C79A`，1.8s ease-in-out infinite（透明度 .35↔1） |
| 数字变化 | 计数动画 400ms，只在首次加载与刷新时跑 |
| 降级 | `prefers-reduced-motion: reduce` → 全部只保留 opacity，位移/缩放/呼吸点关闭 |

禁止：整页飞入、卡片无限漂浮、按钮巨大缩放、发光/毛玻璃做大面积背景、粒子、渐变铺满卡片。

## 5. 暗黑模式（重新设计，不是反色）

```
--app-canvas #0B0F16 / --app-surface #131A25 / --app-surface-alt #101722 / --app-surface-hover #18212E
--app-border #232B3A / --app-border-soft #1B2230 / --app-border-strong #2E384A
--app-text #E6EAF2 / --app-text-secondary #9AA5B8 / --app-text-tertiary #6F7A8D
--app-primary #6D9AFF / --app-primary-soft rgba(109,154,255,.14) / --app-primary-line rgba(109,154,255,.34)
--app-mint #34C79A / --app-mint-soft rgba(52,199,154,.14)
--app-warning #F5B04C / --app-danger #F87A7A
阴影：卡片 0 1px 2px rgba(0,0,0,.4)；浮层 0 16px 40px -20px rgba(0,0,0,.8)
侧栏：仍 #0A0A0C，右描边改 #23252C，选中底 rgba(109,154,255,.20)，hover rgba(255,255,255,.06)
```
要点：暗色下**靠描边与亮度分层，不靠阴影**；语义色降饱和但保持可辨；表格表头比行略亮一档（`#101722` vs `#131A25`）；图表网格线 `#1B2230`；禁用纯白文字大面积出现（用 `#E6EAF2`）。

## 6. 落地顺序与验收

1. `theme.ts`：baseToken / darkTheme / components 全量替换为第 2、5 节值。
2. `design-v2.css` 顶部 token 块（`:root` 与 `[data-theme='dark']`）同步；新增 `--app-canvas`、`--app-mint*`、时长变量。
3. `AppLayout.tsx` 侧栏近黑（antd `Layout.siderBg` + Menu 暗色主题 `theme="dark"` 或 token 覆写），折叠态、移动端 Drawer 同步。
4. 外壳层：内容区画布、页面头、工作页签、筛选栏、表格、卡片、指标带、空态、浮层、动效层。
5. 逐页核对第 3 节（31 个页面文件），只调容器/间距/层级，不动数据逻辑与接口。
6. 考生端 + 登录页 + 作答页 + 6 个浮层。
7. 验收矩阵（无头浏览器，逐格截图 + `getComputedStyle` 断言）：
   `{亮色, 暗色} × {1600, 1180, 390} × {工作台, 题库, 试卷+预览抽屉, 考试, 监考选择, 监考看板, 阅卷工作台, 成绩, 分析, 运维, 账号, 登录, 我的考试, 作答页}`
   断言项：侧栏底色/菜单选中色、卡片圆角与内距、画布色、表头高、行高、字号、动画时长与 `prefers-reduced-motion` 降级、无横向溢出、控制台 0 报错。
8. `npm run typecheck && npm run build && npm run smoke` 全绿后才算完成。

## 7. 不做

不改路由与权限模型；不引入 Tailwind/styled-components/新组件库；不删任何既有业务功能与页面；不改接口契约；不做营销式 Hero 区；不加插画与装饰图形；不改字体族（沿用 Inter + 系统中文字体栈）。
