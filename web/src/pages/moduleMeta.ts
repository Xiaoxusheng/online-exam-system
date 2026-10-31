export interface ModuleFeature {
  title: string
  description: string
}

export interface ModuleMeta {
  title: string
  subtitle: string
  milestone: string
  features: ModuleFeature[]
}

export const moduleMeta: Record<string, ModuleMeta> = {
  questions: {
    title: '题库管理',
    subtitle: '维护题目、知识点与版本，支撑组卷与考试内容供给。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '题型与属性', description: '单选、多选、判断、填空、简答、论述、编程与音视频题；知识点、难度、标签与解析。' },
      { title: '富文本与媒体', description: '题干与选项支持富文本、图片、音频与视频，Formula 公式按里程碑接入。' },
      { title: '批量导入', description: '按 Excel 模板导入，图片命名匹配，导入前校验并输出错误报告。' },
      { title: '审核与版本', description: '草稿、审核、发布全流程；已发布题目修改生成新版本，不影响历史试卷。' },
      { title: '题目检索', description: '按关键词、知识点、难度、题型、标签与使用次数组合筛选。' },
      { title: '受控导出', description: '授权角色导出，记录审计日志并叠加机构水印（P1）。' },
    ],
  },
  papers: {
    title: '试卷与组卷',
    subtitle: '固定卷、随机卷与 AB 卷，构建可审核、可快照的试卷资产。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '三种试卷类型', description: '固定卷指定题目，随机卷按规则抽题，AB 卷分流防作弊。' },
      { title: '随机抽题规则', description: '按题型、知识点与难度设置数量分值，抽题去重并校验总分比例。' },
      { title: '稳定随机', description: '以「场次 + 考生」为种子生成题序与选项顺序，刷新重连保持不变。' },
      { title: '试卷结构', description: '大题小节、题目顺序、选项乱序开关与考试说明。' },
      { title: '审核与快照', description: '提交审核、锁定与发布快照，已发布考试不受题库变化影响。' },
      { title: '分值规则', description: '每题分值、多选部分分规则（全对/少选比例/错选零分）可配置。' },
    ],
  },
  exams: {
    title: '考试管理',
    subtitle: '规划考试时间窗、编排考生、配置规则与监考策略。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '考试计划', description: '名称、试卷、时间窗、时长与考试说明，覆盖多场次与考场编排（P1）。' },
      { title: '考生编排', description: '按班级选择、名单导入与条件筛选，去重并校验账号有效性。' },
      { title: '考试规则', description: '迟到、提前交卷、考试次数、补考、成绩与答案可见性。' },
      { title: '监考配置', description: '防作弊等级、抓拍频率、人脸核验、终端限制与切屏处置动作。' },
      { title: '设备检测与试考', description: '考前模拟场完成摄像头、麦克风、网络与全屏能力检测。' },
      { title: '考务变更与通知', description: '开考前变更并通知考生，开考后统一延时留痕；多时间点提醒。' },
    ],
  },
  proctor: {
    title: '监考中心',
    subtitle: '实时掌握考生状态，接收分级告警并完成处置留痕。',
    milestone: 'M3 严格监考',
    features: [
      { title: '切屏与失焦检测', description: '记录切屏次数与时长，达阈值弹窗警告并推送监考员。' },
      { title: '作答环境限制', description: '强制全屏、禁用复制粘贴与快捷键，离开页面提示。' },
      { title: '内容水印', description: '答题页叠加姓名、考号与时间水印，用于截图溯源。' },
      { title: '人脸核验与抓拍', description: '考前比对报名照，考中按频率与异常事件抓拍并加密存储。' },
      { title: 'AI 行为检测', description: '人脸缺失、多人脸、离座、手机使用与遮挡摄像头等分级告警。' },
      { title: '告警处置与报告', description: '警告、标记疑似违规、强制交卷与备注，考后生成监考报告。' },
    ],
  },
  review: {
    title: '阅卷中心',
    subtitle: '自动判分与人工阅卷协同，支持编程题判题与音视频评分。',
    milestone: 'M2 阅卷与分析',
    features: [
      { title: '自动判分', description: '客观题按规则判分，填空题多答案匹配，未命中转人工。' },
      { title: '编程题判题', description: '隔离沙箱执行，按用例通过比例给分，编译失败零分。' },
      { title: '阅卷任务分配', description: '按题目、场次或指定教师分配，展示任务量与完成进度。' },
      { title: '阅卷界面', description: '匿名阅卷、参考答案、评分点、快捷分值与上一份/下一份。' },
      { title: '音视频评分', description: '在线播放、倍速与按维度加权打分。' },
      { title: '双评与仲裁', description: '双评差值超阈值触发三评或仲裁（P1）。' },
    ],
  },
  scores: {
    title: '成绩管理',
    subtitle: '成绩合成、发布、复核与导出，异常成绩默认挂起。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '成绩汇总', description: '按考试、班级与考生查看成绩、状态、用时与异常标记。' },
      { title: '成绩合成', description: '客观、主观与人工调整合成，人工调整必须填写理由并留痕。' },
      { title: '发布控制', description: '自动或手动发布；存在待复核违规时默认挂起成绩。' },
      { title: '导出与审计', description: '导出 Excel 带水印，记录操作审计日志。' },
      { title: '成绩更正', description: '发布后更正保留历史版本并通知考生（P1）。' },
      { title: '补考管理', description: '补考名单、关联原考试与补考场次（P1）。' },
    ],
  },
  analytics: {
    title: '数据分析',
    subtitle: '从分数、题目与知识点三个视角评估教学与考试质量。',
    milestone: 'M2 阅卷与分析',
    features: [
      { title: '考试统计', description: '参考率、平均分、最高最低分、及格率与分数段分布。' },
      { title: '题目分析', description: '每题正确率、平均得分、选项分布与区分度。' },
      { title: '知识点掌握度', description: '按知识点聚合得分率，输出薄弱知识点。' },
      { title: '趋势对比', description: '班级与学员历次成绩趋势对比。' },
      { title: '巡考视图', description: '跨场次总览与异常排名（P1）。' },
    ],
  },
  users: {
    title: '账号与角色',
    subtitle: '统一账号体系，RBAC 与数据范围双重控制。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '用户管理', description: '学员、教师与管理员账号创建、批量导入与停用。' },
      { title: '角色权限', description: '机构管理员、考务、命题、阅卷、监考与考生六类角色。' },
      { title: '数据范围', description: '全机构、校区、班级与本人四级数据范围。' },
      { title: '登录安全', description: '登录失败限流、验证码与异常登录检测（后续任务）。' },
    ],
  },
  orgs: {
    title: '组织架构',
    subtitle: '维护校区与班级，支撑考生编排与数据范围。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '校区管理', description: '多校区信息维护与启停。' },
      { title: '班级管理', description: '班级、年级与校区归属，支持批量导入。' },
      { title: '组织预留', description: '表结构预留 org_id，为未来多租户演进留出空间。' },
    ],
  },
  auditLogs: {
    title: '审计日志',
    subtitle: '关键操作全量留痕，满足合规与追责要求。',
    milestone: 'M1 基础闭环',
    features: [
      { title: '登录日志', description: '记录登录成功、失败原因、IP 与设备信息。' },
      { title: '关键操作', description: '组卷、发布、改分、导出、删除等操作留痕。' },
      { title: '查询与留存', description: '按时间、操作者与动作检索，日志保留不少于一年。' },
    ],
  },
  notifications: {
    title: '通知配置',
    subtitle: '站内、短信与邮件模板管理，覆盖考前提醒与成绩通知。',
    milestone: 'M2 阅卷与分析',
    features: [
      { title: '多渠道通知', description: '站内消息、短信与邮件统一编排。' },
      { title: '模板管理', description: '按场景维护模板，支持启停与变量占位。' },
      { title: '发送记录', description: '记录发送状态与失败原因，支持重试。' },
    ],
  },
}
