// 演示数据填充：走 API 造一套真实感数据（中文校区/班级/人名/题目/试卷/考试/成绩）。
// 前置：本地 API :8081、种子管理员 admin / Admin@123456。数据可重复执行（按名称幂等）。
// 用法：node scripts/seed-demo.mjs
const BASE = process.env.DEMO_BASE ?? 'http://127.0.0.1:8081/api/v1'
const STUDENT_PWD = 'Student@123456'
const STAFF_PWD = 'Staff@123456'

const results = []
function check(ok, label, detail) {
  if (!ok) {
    console.error(`FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300))
    process.exit(1)
  }
  results.push(label)
  console.log(`ok - ${label}`)
}

async function api(method, path, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  return { status: res.status, json }
}
function expect(res, status, label) {
  check(res.status === status, `${label}`, res.json)
  return res.json?.data
}
async function login(account, password) {
  const res = await api('POST', '/auth/login', { body: { account, password } })
  return expect(res, 200, `login ${account}`).token
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (ms) => new Date(ms).toISOString()
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]
const chance = (p) => Math.random() < p

// ---------------------------------------------------------------- 基础数据
const campuses = [
  { name: '本部校区', address: '海淀区学院路 12 号' },
  { name: '西城校区', address: '西城区育才街 88 号' },
]
const classes = [
  { name: '高三（1）班', grade: '2026', campus: '本部校区' },
  { name: '高三（2）班', grade: '2026', campus: '本部校区' },
  { name: '高二（3）班', grade: '2027', campus: '西城校区' },
  { name: '高二（4）班', grade: '2027', campus: '西城校区' },
]
const staff = [
  { name: '王建国', username: 'demo_teacher_wang', role: 'teacher', scope: 'org' },
  { name: '李雪梅', username: 'demo_teacher_li', role: 'teacher', scope: 'org' },
  { name: '陈志强', username: 'demo_teacher_chen', role: 'teacher', scope: 'org' },
  { name: '赵婷婷', username: 'demo_reviewer_zhao', role: 'reviewer', scope: 'org' },
  { name: '孙明浩', username: 'demo_reviewer_sun', role: 'reviewer', scope: 'org' },
  { name: '周  平', username: 'demo_proctor_zhou', role: 'proctor', scope: 'org' },
  { name: '吴桂芳', username: 'demo_proctor_wu', role: 'proctor', scope: 'org' },
]
const studentNames = [
  '刘畅', '张一鸣', '王思远', '李嘉琪', '赵子轩', '陈雨桐', '杨  洋', '周诗涵', '吴俊杰',
  '徐静怡', '孙浩然', '马欣悦', '朱天宇', '胡梦琪', '郭鹏飞', '林晓雯', '何志远', '高雨欣',
  '罗文轩', '郑晓彤', '梁家辉', '谢雨薇', '宋佳明', '唐雪莹', '许博文', '韩  冰', '冯天琪',
  '曹  颖', '邓超群', '肖  晗', '程一鸣', '罗  兰', '任  飞', '杜  鹃', '蒋一帆', '苗  苗',
]

// ---------------------------------------------------------------- 题目
const M = '高中数学', P = '高中物理', E = '高中英语'
const banks = [M, P, E]

const mathQuestions = [
  { t: 'single', kp: '集合', d: 'easy', s: 5, stem: '已知集合 A = {1, 2, 3}，B = {2, 3, 4}，则 A ∩ B 等于（　　）',
    opts: [['A', '{1, 2}'], ['B', '{2, 3}'], ['C', '{3, 4}'], ['D', '{1, 4}']], ans: ['B'] },
  { t: 'single', kp: '二次函数', d: 'easy', s: 5, stem: '函数 f(x) = x² - 2x 的最小值为（　　）',
    opts: [['A', '0'], ['B', '-1'], ['C', '1'], ['D', '-2']], ans: ['B'] },
  { t: 'single', kp: '等差数列', d: 'medium', s: 5, stem: '等差数列 {aₙ} 中，a₁ = 1，公差 d = 2，则 a₁₀ =（　　）',
    opts: [['A', '19'], ['B', '20'], ['C', '21'], ['D', '18']], ans: ['A'] },
  { t: 'single', kp: '三角函数', d: 'easy', s: 5, stem: 'sin 30° 的值为（　　）',
    opts: [['A', '√3/2'], ['B', '√2/2'], ['C', '1'], ['D', '1/2']], ans: ['D'] },
  { t: 'multiple', kp: '函数性质', d: 'medium', s: 6, stem: '下列函数中，是偶函数的有（　　）',
    opts: [['A', 'y = x²'], ['B', 'y = x³'], ['C', 'y = |x|'], ['D', 'y = cos x']], ans: ['A', 'C', 'D'] },
  { t: 'multiple', kp: '解三角形', d: 'medium', s: 6, stem: '下列各组数中，能作为三角形三边长的是（　　）',
    opts: [['A', '3, 4, 5'], ['B', '5, 12, 13'], ['C', '1, 2, 3'], ['D', '6, 8, 10']], ans: ['A', 'B', 'D'] },
  { t: 'judge', kp: '绝对值', d: 'easy', s: 4, stem: '任何实数的绝对值都是非负数。', ans: ['true'] },
  { t: 'judge', kp: '无理数', d: 'medium', s: 4, stem: '两个无理数的积一定是无理数。', ans: ['false'] },
  { t: 'fill', kp: '不等式', d: 'easy', s: 5, stem: '不等式 2x - 4 > 0 的解集为 ____。',
    ans: { answers: [['x > 2', 'x>2', '（2，+∞）']] } },
  { t: 'fill', kp: '圆的方程', d: 'easy', s: 5, stem: '圆 x² + y² = 4 的半径为 ____。', ans: { answers: [['2', 'r=2']] } },
  { t: 'short', kp: '二次函数最值', d: 'hard', s: 25, stem: '求函数 f(x) = x² - 4x + 3 在区间 [0, 3] 上的最大值与最小值。',
    ref: 'f(x) = (x-2)² - 1，顶点 x = 2 在区间内，f(2) = -1 为最小值；f(0) = 3，f(3) = 0，故最大值为 3，最小值为 -1。' },
  { t: 'short', kp: '等差数列性质', d: 'hard', s: 25, stem: '等差数列 {aₙ} 中，已知 a₃ + a₇ = 16，求 a₅ 的值，并说明理由。',
    ref: '由等差数列性质 a₃ + a₇ = 2a₅，故 a₅ = 8。' },
]
const physicsQuestions = [
  { t: 'single', kp: '牛顿定律', d: 'easy', s: 10, stem: '质量 2 kg 的物体在 3 m/s² 的加速度下运动，所受合外力为（　　）',
    opts: [['A', '6 N'], ['B', '1.5 N'], ['C', '5 N'], ['D', '0.67 N']], ans: ['A'] },
  { t: 'single', kp: '声学', d: 'easy', s: 10, stem: '常温下声音在空气中的传播速度约为（　　）',
    opts: [['A', '1500 m/s'], ['B', '340 m/s'], ['C', '3×10⁸ m/s'], ['D', '30 m/s']], ans: ['B'] },
  { t: 'single', kp: '电能', d: 'medium', s: 10, stem: '1 度电等于（　　）',
    opts: [['A', '3.6×10³ J'], ['B', '3.6×10⁵ J'], ['C', '3.6×10⁶ J'], ['D', '1×10⁶ J']], ans: ['C'] },
  { t: 'single', kp: '光学', d: 'easy', s: 10, stem: '光在真空中的传播速度为（　　）',
    opts: [['A', '340 m/s'], ['B', '3×10⁶ m/s'], ['C', '3×10⁸ km/s'], ['D', '3×10⁸ m/s']], ans: ['D'] },
  { t: 'judge', kp: '摩擦力', d: 'medium', s: 10, stem: '摩擦力的方向总是与物体运动方向相反。', ans: ['false'] },
  { t: 'judge', kp: '重力', d: 'easy', s: 10, stem: '重力的方向总是竖直向下的。', ans: ['true'] },
  { t: 'fill', kp: '电学单位', d: 'easy', s: 20, stem: '电压的国际单位是 ____（填写中文名称或符号）。', ans: { answers: [['伏特', 'V', '伏']] } },
  { t: 'fill', kp: '电功', d: 'medium', s: 20, stem: '功率 100 W 的灯泡正常工作 10 s，消耗的电能为 ____ J。', ans: { answers: [['1000', '1×10³']] } },
]
const englishQuestions = [
  { t: 'single', kp: '一般现在时', d: 'easy', s: 14, stem: 'He ____ to school every day.',
    opts: [['A', 'go'], ['B', 'goes'], ['C', 'going'], ['D', 'gone']], ans: ['B'] },
  { t: 'single', kp: '词汇拼写', d: 'easy', s: 14, stem: 'Choose the correct spelling:',
    opts: [['A', 'beautiful'], ['B', 'beatiful'], ['C', 'beautful'], ['D', 'beautifull']], ans: ['A'] },
  { t: 'single', kp: '冠词', d: 'easy', s: 14, stem: 'I have ____ apple and two bananas.',
    opts: [['A', 'a'], ['B', 'the'], ['C', 'an'], ['D', '/']], ans: ['C'] },
  { t: 'single', kp: '名词复数', d: 'medium', s: 14, stem: 'The plural form of "child" is ___.',
    opts: [['A', 'childs'], ['B', 'childes'], ['C', 'child'], ['D', 'children']], ans: ['D'] },
  { t: 'single', kp: '过去进行时', d: 'medium', s: 14, stem: 'She ____ TV when I called her last night.',
    opts: [['A', 'was watching'], ['B', 'watched'], ['C', 'is watching'], ['D', 'watches']], ans: ['A'] },
  { t: 'judge', kp: '日常交际', d: 'easy', s: 10, stem: '"How are you?" 的常见回应是 "I\'m fine, thank you."', ans: ['true'] },
  { t: 'judge', kp: '名词复数', d: 'easy', s: 10, stem: '"book" 的复数形式是 "bookes"。', ans: ['false'] },
  { t: 'judge', kp: '书写规范', d: 'easy', s: 10, stem: '英语句子开头的第一个字母需要大写。', ans: ['true'] },
]

function qPayload(bankId, q) {
  const base = { bank_id: bankId, type: q.t, knowledge_point: q.kp, difficulty: q.d, default_score: q.s }
  if (q.t === 'single' || q.t === 'multiple') {
    return { ...base, content: { stem: q.stem, options: q.opts.map(([key, text]) => ({ key, text })) }, answer: { correct: q.ans }, score_rule: q.t === 'multiple' ? { partial: 'ratio' } : {} }
  }
  if (q.t === 'judge') return { ...base, content: { stem: q.stem }, answer: { correct: q.ans }, score_rule: {} }
  if (q.t === 'fill') return { ...base, content: { stem: q.stem }, answer: q.ans, score_rule: {} }
  return { ...base, content: { stem: q.stem }, answer: { reference: q.ref }, score_rule: {} }
}

// ---------------------------------------------------------------- 主流程
const admin = await login(process.env.DEMO_ADMIN ?? 'admin', process.env.DEMO_PASS ?? 'Admin@123456')
console.log('logged in as admin')

async function findIn(path, nameKey, name) {
  const res = await api('GET', `${path}?page_size=100`, { token: admin })
  for (let p = 1; p < 20; p++) {
    const page = p === 1 ? res : await api('GET', `${path}?page=${p}&page_size=100`, { token: admin })
    const items = page.json?.data ?? []
    const hit = items.find((x) => (x[nameKey] ?? x.name) === name)
    if (hit) return hit
    if (items.length < 100) break
  }
  return null
}

// 1) 校区 / 班级
const campusIds = {}
for (const c of campuses) {
  let hit = await findIn('/campuses', 'name', c.name)
  if (!hit) hit = expect(await api('POST', '/campuses', { token: admin, body: { name: c.name, address: c.address } }), 201, `campus ${c.name}`)
  campusIds[c.name] = hit.id
}
check(Object.keys(campusIds).length === 2, 'campuses ready')

const classIds = {}
for (const k of classes) {
  let hit = await findIn('/classes', 'name', k.name)
  if (!hit) hit = expect(await api('POST', '/classes', { token: admin, body: { name: k.name, grade: k.grade, campus_id: campusIds[k.campus] } }), 201, `class ${k.name}`)
  classIds[k.name] = hit.id
}
check(Object.keys(classIds).length === 4, 'classes ready')

// 2) 用户（员工 + 学生）
async function upsertUser(u, extra) {
  const username = u.username
  const res = await api('GET', `/users?keyword=${username}&page_size=20`, { token: admin })
  const hit = (res.json?.data ?? []).find((x) => x.username === username)
  if (hit) return hit
  return expect(await api('POST', '/users', { token: admin, body: { name: u.name, username, phone: u.phone, password: u.password, role: u.role, data_scope: u.scope, ...extra } }), 201, `user ${u.name}`)
}
const teacherTokens = {}
const staffUsers = {}
for (let i = 0; i < staff.length; i++) {
  const s = { ...staff[i], phone: `138${String(8100 + i)}`, password: STAFF_PWD }
  const user = await upsertUser(s, {})
  staffUsers[s.username] = user
  if (['teacher', 'reviewer', 'proctor'].includes(s.role)) teacherTokens[s.username] = await login(s.username, STAFF_PWD).catch(() => null)
}
const students = []
for (let i = 0; i < studentNames.length; i++) {
  const className = classes[i % 4].name
  const s = {
    name: studentNames[i], username: `demo_stu_${String(i + 1).padStart(3, '0')}`,
    phone: `137${String(230000 + i)}`, password: STUDENT_PWD, role: 'student', scope: 'self',
  }
  const user = await upsertUser(s, { class_id: classIds[className] })
  students.push({ ...user, className, token: await login(s.username, STUDENT_PWD) })
}
check(students.length === 36, `students ready (${students.length})`)

// 3) 题库 + 题目（teacher 王建国）
const teacherT = teacherTokens['demo_teacher_wang']
const bankIds = {}
const bankDescs = [M, P, E]
for (const name of bankDescs) {
  let hit = await findIn('/question-banks', 'name', name)
  if (!hit) hit = expect(await api('POST', '/question-banks', { token: teacherT, body: { name, scope: 'org' } }), 201, `bank ${name}`)
  bankIds[name] = hit.id
}
async function upsertQuestion(bankName, q) {
  const stem = q.stem
  const list = await api('GET', `/questions?bank_id=${bankIds[bankName]}&page_size=100`, { token: teacherT })
  const hit = (list.json?.data ?? []).find((x) => x.content?.stem === stem)
  if (hit) return hit
  const created = expect(await api('POST', '/questions', { token: teacherT, body: qPayload(bankIds[bankName], q) }), 201, `question ${stem.slice(0, 12)}`)
  expect(await api('POST', `/questions/${created.id}/publish`, { token: teacherT }), 200, `publish ${stem.slice(0, 12)}`)
  return { ...created, ...q }
}
const mathQs = [], physQs = [], engQs = []
for (const q of mathQuestions) mathQs.push(await upsertQuestion(M, q))
for (const q of physicsQuestions) physQs.push(await upsertQuestion(P, q))
for (const q of englishQuestions) engQs.push(await upsertQuestion(E, q))
check(mathQs.length + physQs.length + engQs.length === 28, `questions ready (${mathQs.length}/${physQs.length}/${engQs.length})`)

// 4) 试卷（teacher 建 → admin 审）
const sectionOf = { single: '一、单项选择题', multiple: '二、多项选择题', judge: '三、判断题', fill: '四、填空题', short: '五、解答题' }
async function makePaper(title, bankName, qs, picked) {
  const list = await api('GET', `/papers?keyword=${encodeURIComponent(title)}&page_size=20`, { token: admin })
  const hit = (list.json?.data ?? []).find((x) => x.title === title)
  if (hit) return hit
  const paper = expect(await api('POST', '/papers', {
    token: teacherT,
    body: {
      type: 'fixed', title,
      questions: picked.map((qi) => ({ question_id: qs[qi].id ?? qs[qi].question_id ?? qs[qi].id, section: sectionOf[qs[qi].t ?? qs[qi].type], score: qs[qi].s ?? qs[qi].default_score, paper_group: 'A' })),
      rules: {},
    },
  }), 201, `paper ${title}`)
  expect(await api('POST', `/papers/${paper.id}/submit-review`, { token: teacherT }), 200, `paper ${title} submit`)
  expect(await api('POST', `/papers/${paper.id}/approve`, { token: admin }), 200, `paper ${title} approve`)
  return paper
}
const mathPaper = await makePaper('2026 年秋季期中考试 · 数学', M, mathQs, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
const physPaper = await makePaper('高二月考 · 物理', P, physQs, [0, 1, 2, 3, 4, 5, 6, 7])
const engPaper = await makePaper('英语周测（第九周）', E, engQs, [0, 1, 2, 3, 4, 5, 6, 7])
check(mathPaper && physPaper && engPaper, 'papers approved')

// 5) 考试
async function makeExam(title, paper, startMs, endMs, duration) {
  const list = await api('GET', `/exams?keyword=${encodeURIComponent(title)}&page_size=20`, { token: admin })
  const hit = (list.json?.data ?? []).find((x) => x.title === title)
  if (hit) return { exam: hit, existed: true }
  const exam = expect(await api('POST', '/exams', {
    token: admin,
    body: {
      paper_id: paper.id, title,
      start_at: iso(startMs), end_at: iso(endMs), duration_minutes: duration,
      rules: { pass_score: 60, anonymous_review: true, show_score: true, review_mode: 'single' },
      proctor_config: { level: 'basic' },
      candidates: students.map((s) => ({ user_id: s.id, paper_group: 'A' })),
      class_ids: [],
    },
  }), 201, `exam ${title}`)
  expect(await api('PUT', `/exams/${exam.id}/reviewers`, { token: admin, body: { user_ids: [staffUsers['demo_reviewer_zhao'].id, staffUsers['demo_reviewer_sun'].id] } }), 200, `exam ${title} reviewers`)
  expect(await api('PUT', `/exams/${exam.id}/proctors`, { token: admin, body: { user_ids: [staffUsers['demo_proctor_zhou'].id, staffUsers['demo_proctor_wu'].id] } }), 200, `exam ${title} proctors`)
  expect(await api('POST', `/exams/${exam.id}/publish`, { token: admin }), 200, `exam ${title} publish`)
  return { exam, existed: false }
}

// —— 考试 A：数学期中（马上开考，4 分钟后自动收卷结束，阅卷后发布成绩）
const now = Date.now()
const { exam: mathExam, existed: mathExisted } = await makeExam('2026 年秋季期中考试 · 数学', mathPaper, now + 30_000, now + 210_000, 60)

// —— 考试 B：物理月考（进行中：30 分钟前开始，2 小时后结束）
const { exam: physExam, existed: physExisted } = await makeExam('高二月考 · 物理', physPaper, now - 30 * 60_000, now + 2 * 3600_000, 60)

// —— 考试 C：英语周测（明天）
const tomorrow9 = new Date(); tomorrow9.setHours(9, 0, 0, 0); tomorrow9.setDate(tomorrow9.getDate() + 1)
const { exam: engExam, existed: engExisted } = await makeExam('英语周测（第九周）', engPaper, tomorrow9.getTime(), tomorrow9.getTime() + 2 * 3600_000, 90)

// 6) 学生作答
function answerFor(q) {
  const t = q.t
  if (t === 'single') {
    const correct = q.ans[0]
    const keys = q.opts.map((o) => o[0])
    const pick = chance(0.65) ? correct : rand(keys.filter((k) => k !== correct))
    return { value: pick }
  }
  if (t === 'multiple') {
    if (chance(0.6)) return { values: q.ans }
    const partial = q.ans.slice(0, Math.max(1, q.ans.length - 1))
    return { values: partial }
  }
  if (t === 'judge') return { value: chance(0.72) ? q.ans[0] : (q.ans[0] === 'true' ? 'false' : 'true') }
  if (t === 'fill') {
    if (chance(0.7)) return { values: q.ans.answers.map((a) => a[0]) }
    return { values: q.ans.answers.map(() => '解：略') }
  }
  return { text: chance(0.5)
    ? '解：由题意得，关键步骤书写完整，结论正确。'
    : '解：思路基本正确，但第二步计算出现失误，结论不完整。' }
}
async function takeAttempt(student, examId, bankQs, submit, partialCount) {
  const start = await api('POST', `/exams/${examId}/attempts`, { token: student.token })
  if (start.status !== 200 && start.status !== 409) { console.error(`start fail ${student.name}`, start.json); return null }
  const data = start.json?.data ?? (await api('GET', `/exams/${examId}/attempts`, { token: student.token })).json?.data
  const attemptId = data?.attempt_id ?? data?.attemptId
  if (!attemptId) return null
  const detail = await api('GET', `/attempts/${attemptId}`, { token: student.token })
  const questions = detail.json?.data?.questions ?? []
  let saved = 0
  for (const q of questions) {
    if (partialCount !== undefined && saved >= partialCount) break
    const meta = bankQs.find((x) => (x.id ?? x.question_id) === q.question_id)
    const content = answerFor(meta ?? { t: q.type, ans: q.ans ?? { correct: ['A'], answers: { answers: [['A']] } }, opts: q.content?.options })
    const body = q.type === 'multiple' ? { values: content.values ?? [] }
      : q.type === 'fill' ? { values: content.values ?? [] }
      : q.type === 'short' || q.type === 'essay' ? { text: content.text }
      : { value: content.value }
    const r = await api('PUT', `/attempts/${attemptId}/answers/${q.question_id}`, { token: student.token, body: { content: body, version: 0 } })
    if (r.status === 200) saved++
  }
  if (submit) {
    const s = await api('POST', `/attempts/${attemptId}/submit`, { token: student.token })
    return s.status === 200 || s.status === 409 ? attemptId : null
  }
  return attemptId
}

if (!mathExisted) {
  console.log('math exam: 30 students taking...')
  for (const s of students.slice(0, 30)) await takeAttempt(s, mathExam.id, mathQs, true)
  console.log('math exam: submitted, waiting auto-close...')
} else console.log('math exam existed, skip taking')

if (!physExisted) {
  console.log('physics exam: 12 students entering...')
  for (const s of students.slice(0, 5)) await takeAttempt(s, physExam.id, physQs, true)
  for (const s of students.slice(5, 12)) await takeAttempt(s, physExam.id, physQs, false, 3 + Math.floor(Math.random() * 3))
}

// 7) 阅卷（数学简答题）
if (!mathExisted) {
  const reviewers = [teacherTokens['demo_reviewer_zhao'], teacherTokens['demo_reviewer_sun']].filter(Boolean)
  for (const rt of reviewers) {
    for (let page = 1; page <= 10; page++) {
      const tasks = await api('GET', `/review-tasks?status=pending&page=${page}&page_size=50`, { token: rt })
      const items = tasks.json?.data ?? []
      if (!items.length) break
      for (const task of items) {
        const full = task.score ?? task.max_score ?? 10
        const score = Math.round(full * (0.6 + Math.random() * 0.4) * 2) / 2
        await api('POST', `/review-tasks/${task.id}/submit`, { token: rt, body: { score, comment: rand(['要点完整，推理清晰。', '思路正确，计算有细节失误。', '步骤规范，结论准确。', '方法得当，表达可以更简洁。']) } })
      }
      if (items.length < 50) break
    }
  }
  console.log('review tasks submitted')
}

// 8) 等数学考试结束并发布成绩
if (!mathExisted) {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const detail = await api('GET', `/exams/${mathExam.id}`, { token: admin })
    const status = detail.json?.data?.status
    console.log(`math exam status: ${status}`)
    if (status === 'ended') break
    await sleep(20_000)
  }
  const pub = await api('POST', '/scores/publish', { token: admin, body: { exam_id: mathExam.id } })
  console.log(`math scores publish: HTTP ${pub.status}`)
  check(pub.status === 200 || pub.status === 409, 'math scores published', pub.json)
}

// ---------------------------------------------------------------- 摘要
const overview = await api('GET', '/system/overview', { token: admin })
console.log('\n=== DEMO SEED DONE ===')
console.log(JSON.stringify(overview.json?.data, null, 1))
console.log(`exams: 数学=${mathExam.id.slice(0, 8)} 物理=${physExam.id.slice(0, 8)} 英语=${engExam.id.slice(0, 8)}`)
console.log(`accounts: admin/Admin@123456, 教师 demo_teacher_wang/${STAFF_PWD}, 学生 demo_stu_001/${STUDENT_PWD}`)
