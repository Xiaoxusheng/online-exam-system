// 数学期中考试完整链路：创建→发布→30 人作答→阅卷→等结束→发布成绩；并补物理考试作答状态。
const BASE = 'http://127.0.0.1:8081/api/v1'
async function api(method, path, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  return { status: res.status, json }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chance = (p) => Math.random() < p
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]
const iso = (ms) => new Date(ms).toISOString()

const admin = (await api('POST', '/auth/login', { body: { account: 'admin', password: 'Admin@123456' } })).json.data.token
console.log('admin ok')

// —— 学生与元数据
const M = {
  '已知集合 A = {1, 2, 3}': { t: 'single', ans: ['B'], opts: ['A', 'B', 'C', 'D'] },
  '函数 f(x) = x² - 2x 的最小值为': { t: 'single', ans: ['B'], opts: ['A', 'B', 'C', 'D'] },
  '等差数列 {aₙ} 中，a₁ = 1': { t: 'single', ans: ['A'], opts: ['A', 'B', 'C', 'D'] },
  'sin 30° 的值为': { t: 'single', ans: ['D'], opts: ['A', 'B', 'C', 'D'] },
  '下列函数中，是偶函数的有': { t: 'multiple', ans: ['A', 'C', 'D'] },
  '下列各组数中，能作为三角形三边长的是': { t: 'multiple', ans: ['A', 'B', 'D'] },
  '任何实数的绝对值都是非负数': { t: 'judge', ans: ['true'] },
  '两个无理数的积一定是无理数': { t: 'judge', ans: ['false'] },
  '不等式 2x - 4 > 0 的解集为': { t: 'fill', vals: ['x > 2'] },
  '圆 x² + y² = 4 的半径为': { t: 'fill', vals: ['2'] },
  '求函数 f(x) = x² - 4x + 3': { t: 'short' },
  '等差数列 {aₙ} 中，已知 a₃ + a₇ = 16': { t: 'short' },
}
const P = {
  '质量 2 kg 的物体在 3 m/s²': { t: 'single', ans: ['A'], opts: ['A', 'B', 'C', 'D'] },
  '常温下声音在空气中的传播速度约为': { t: 'single', ans: ['B'], opts: ['A', 'B', 'C', 'D'] },
  '1 度电等于': { t: 'single', ans: ['C'], opts: ['A', 'B', 'C', 'D'] },
  '光在真空中的传播速度为': { t: 'single', ans: ['D'], opts: ['A', 'B', 'C', 'D'] },
  '摩擦力的方向总是与物体运动方向相反': { t: 'judge', ans: ['false'] },
  '重力的方向总是竖直向下的': { t: 'judge', ans: ['true'] },
  '电压的国际单位是': { t: 'fill', vals: ['伏特'] },
  '功率 100 W 的灯泡正常工作 10 s': { t: 'fill', vals: ['1000'] },
}
function matchKey(map, stem) { if (!stem) return null; for (const k of Object.keys(map)) if (stem.includes(k.slice(0, 10))) return map[k]; return null }
function answerFor(m) {
  if (!m) return { value: 'A' }
  if (m.t === 'single') return { value: chance(0.65) ? m.ans[0] : rand(m.opts.filter((k) => k !== m.ans[0])) }
  if (m.t === 'multiple') return chance(0.6) ? { values: m.ans } : { values: m.ans.slice(0, Math.max(1, m.ans.length - 1)) }
  if (m.t === 'judge') return { value: chance(0.72) ? m.ans[0] : (m.ans[0] === 'true' ? 'false' : 'true') }
  if (m.t === 'fill') return { values: m.vals.map(() => (chance(0.7) ? m.vals[0] : '略')) }
  return { text: chance(0.5) ? '解：关键步骤书写完整，结论正确。' : '解：思路基本正确，第二步计算有失误。' }
}
async function doAttempt(token, examId, map, { submit, partial }) {
  const start = await api('POST', `/exams/${examId}/attempts`, { token })
  if (![200, 201, 409].includes(start.status)) return { ok: false, why: `start HTTP ${start.status}` }
  const attemptId = start.json?.data?.attempt_id
  if (!attemptId) return { ok: false, why: 'no attempt_id' }
  const detail = (await api('GET', `/attempts/${attemptId}`, { token })).json?.data
  const qs = detail?.questions ?? []
  let saved = 0
  for (const q of qs) {
    if (partial !== undefined && saved >= partial) break
    const m = matchKey(map, q.content?.stem)
    const c = answerFor(m)
    const body = q.type === 'multiple' ? { values: c.values ?? [] }
      : q.type === 'fill' ? { values: c.values ?? [] }
      : q.type === 'short' || q.type === 'essay' ? { text: c.text }
      : { value: c.value }
    const r = await api('PUT', `/attempts/${attemptId}/answers/${q.question_id}`, { token, body: { content: body, version: 0 } })
    if (r.status === 200 || r.status === 409) saved++
  }
  if (submit) {
    const s = await api('POST', `/attempts/${attemptId}/submit`, { token })
    return { ok: [200, 201, 409].includes(s.status), why: `submit HTTP ${s.status}`, attemptId }
  }
  return { ok: true, attemptId }
}
async function login(account, pwd) { return (await api('POST', '/auth/login', { body: { account, password: pwd } })).json.data.token }
const stuToken = (i) => login(`demo_stu_${String(i).padStart(3, '0')}`, 'Student@123456')

// ================= 数学考试：创建 + 发布
const now = Date.now()
const created = await api('POST', '/exams', {
  token: admin,
  body: {
    paper_id: (await api('GET', '/papers?keyword=' + encodeURIComponent('2026 年秋季期中考试 · 数学'), { token: admin })).json.data[0].id,
    title: '2026 年秋季期中考试 · 数学',
    start_at: iso(now + 20_000), end_at: iso(now + 300_000), duration_minutes: 60,
    rules: { pass_score: 60, anonymous_review: true, show_score: true, review_mode: 'single' },
    proctor_config: { level: 'basic' },
    candidates: (await Promise.all(Array.from({ length: 36 }, (_, i) => api('GET', `/users?keyword=demo_stu_${String(i + 1).padStart(3, '0')}`, { token: admin })))).map((r) => ({ user_id: r.json.data[0].id, paper_group: 'A' })),
    class_ids: [],
  },
})
if (![200, 201].includes(created.status)) { console.error('exam create fail', created.json); process.exit(1) }
const mathExam = created.json.data
console.log(`math exam ${mathExam.id} created (${mathExam.status})`)
await sleep(1000)
for (const [path, ids] of [
  ['/reviewers', [(await api('GET', '/users?keyword=demo_reviewer_zhao', { token: admin })).json.data[0].id, (await api('GET', '/users?keyword=demo_reviewer_sun', { token: admin })).json.data[0].id]],
  ['/proctors', [(await api('GET', '/users?keyword=demo_proctor_zhou', { token: admin })).json.data[0].id, (await api('GET', '/users?keyword=demo_proctor_wu', { token: admin })).json.data[0].id]],
]) {
  const r = await api('PUT', `/exams/${mathExam.id}${path}`, { token: admin, body: { user_ids: ids } })
  console.log(`${path}: HTTP ${r.status}`)
}
const pub = await api('POST', `/exams/${mathExam.id}/publish`, { token: admin })
console.log(`publish: HTTP ${pub.status}`)
if (![200, 201].includes(pub.status)) { console.error('publish fail', pub.json); process.exit(1) }

// 等开考
await sleep(22_000)

// 30 人作答交卷（6 人缺考）
let okCount = 0
for (let i = 1; i <= 30; i++) {
  const token = await stuToken(i)
  const r = await doAttempt(token, mathExam.id, M, { submit: true })
  if (r.ok) okCount++
  else console.error(`stu ${i}: ${r.why}`)
}
console.log(`submitted: ${okCount}/30`)

// 阅卷
let graded = 0
for (const r of ['demo_reviewer_zhao', 'demo_reviewer_sun']) {
  const rt = await login(r, 'Staff@123456')
  for (let page = 1; page <= 12; page++) {
    const tasks = (await api('GET', `/review-tasks?status=pending&page=${page}&page_size=50`, { token: rt })).json.data ?? []
    if (!tasks.length) break
    for (const task of tasks) {
      const full = task.score ?? 10
      const score = Math.round(full * (0.6 + Math.random() * 0.4) * 2) / 2
      const res = await api('POST', `/review-tasks/${task.id}/submit`, { token: rt, body: { score, comment: rand(['要点完整，推理清晰。', '思路正确，计算有细节失误。', '步骤规范，结论准确。', '方法得当，表达可更简洁。']) } })
      if (res.status === 200) graded++
    }
    if (tasks.length < 50) break
  }
}
console.log(`reviewed: ${graded}`)

// 等结束 → 发布成绩
const deadline = Date.now() + 480_000
let status = ''
while (Date.now() < deadline) {
  status = (await api('GET', `/exams/${mathExam.id}`, { token: admin })).json.data.status
  if (status === 'ended') break
  console.log(`waiting, status=${status}`)
  await sleep(20_000)
}
console.log(`final status: ${status}`)
if (status === 'ended') {
  const p = await api('POST', '/scores/publish', { token: admin, body: { exam_id: mathExam.id } })
  console.log(`scores publish: HTTP ${p.status}`)
} else {
  console.error('exam not ended in time')
}

// ================= 物理考试：补作答（前 5 交卷，后 7 作答中）
const physExams = (await api('GET', '/exams?keyword=' + encodeURIComponent('高二月考 · 物理'), { token: admin })).json.data
const physExam = physExams[0]
let physSubmitted = 0, physProgress = 0
for (let i = 1; i <= 12; i++) {
  const token = await stuToken(i)
  const r = await doAttempt(token, physExam.id, P, { submit: i <= 5 })
  if (r.ok) (i <= 5 ? physSubmitted++ : physProgress++)
  else console.error(`phys stu ${i}: ${r.why}`)
}
console.log(`physics: submitted=${physSubmitted}, in_progress=${physProgress}`)
console.log('DONE')
