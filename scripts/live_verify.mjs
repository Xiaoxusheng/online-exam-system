// Live verification against the deployed instance (read-only: no writes to production data).
const BASE = process.env.LIVE_BASE ?? 'http://118.25.50.65'
const results = []
const failures = []

function check(ok, label, detail) {
  if (!ok) {
    failures.push(label)
    console.error(`FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 240))
    process.exitCode = 1
    return
  }
  results.push(label)
  console.log(`ok - ${label}`)
}

const api = async (method, path, { token, body } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: response.status, headers: response.headers, json }
}

const health = await fetch(`${BASE}/healthz`)
check(health.status === 200, 'healthz reachable over the public address', health.status)

const SPA = await fetch(`${BASE}/`)
check(SPA.status === 200 && (await SPA.text()).includes('在线考试系统'), 'SPA 首页返回真实构建产物')

const unauth = await api('GET', '/questions/import-template')
check(unauth.status === 401, '未登录不能下载导入模板', unauth.status)

const login = await api('POST', '/auth/login', { body: { account: process.env.LIVE_USER ?? 'admin', password: process.env.LIVE_PASS ?? 'Admin@123456' } })
if (login.status !== 200) {
  console.error(`生产登录失败（HTTP ${login.status}），后续接口检查跳过`)
  process.exit(1)
}
const token = login.json.data.token
check(Boolean(login.json.data.refresh_token), '登录返回访问与刷新令牌')

const template = await fetch(`${BASE}/api/v1/questions/import-template`, { headers: { Authorization: `Bearer ${token}` } })
const templateBytes = Buffer.from(await template.arrayBuffer())
check(template.status === 200, '线上可下载导入模板', template.status)
check(templateBytes[0] === 0x50 && templateBytes[1] === 0x4b && templateBytes.length > 4000, '线上模板是合法 xlsx', templateBytes.length)
check((template.headers.get('content-disposition') ?? '').includes('filename*=UTF-8'), '线上下载头带中文文件名')

const banks = (await api('GET', '/question-banks', { token })).json.data ?? []
check(banks.length > 0, '题库接口可用', banks.length)
const questions = (await api('GET', '/questions?page_size=5', { token })).json
check(questions.pagination.total > 0, '题目列表有数据', questions.pagination)

const questionExport = await fetch(`${BASE}/api/v1/questions/export`, { headers: { Authorization: `Bearer ${token}` } })
const questionBytes = Buffer.from(await questionExport.arrayBuffer())
check(questionExport.status === 200 && questionBytes[0] === 0x50, '题目导出返回 xlsx', questionExport.status)
check(questionExport.headers.get('cache-control') === 'no-store', '导出响应禁止缓存', questionExport.headers.get('cache-control'))

const exams = (await api('GET', '/exams?page_size=20', { token })).json.data ?? []
check(exams.length > 0, '考试列表可用', exams.length)
let analysed = false
for (const exam of exams.slice(0, 8)) {
  const items = await api('GET', `/analytics/exams/${exam.id}/items`, { token })
  if (items.status === 200 && items.json.data.items.length > 0) {
    analysed = true
    const first = items.json.data.items[0]
    check(first.correct_rate >= 0 && first.correct_rate <= 100 && first.score_rate >= 0 && first.score_rate <= 100,
      '逐题诊断返回正确的比率区间', first)
    check(Array.isArray(first.options), '逐题诊断包含选项分布', first.options)
    console.log(`   样例：${exam.title} → ${items.json.data.participants} 份，题目 ${first.stem?.slice(0, 20)} 正确率 ${first.correct_rate}%`)
    break
  }
}
check(analysed, '线上至少有一场考试可产出逐题诊断')

const knowledge = await api('GET', '/analytics/knowledge-points', { token })
check(knowledge.status === 200 && Array.isArray(knowledge.json.data.points), '知识点掌握度接口可用', knowledge.json?.data?.points?.length)

const scoreExport = await fetch(`${BASE}/api/v1/scores/export?exam_id=${exams[0].id}`, { headers: { Authorization: `Bearer ${token}` } })
const scoreBytes = Buffer.from(await scoreExport.arrayBuffer())
check([200, 404].includes(scoreExport.status), '成绩导出接口按考试响应', scoreExport.status)
if (scoreExport.status === 200) {
  check(scoreBytes[0] === 0x50 && scoreBytes.length > 4000, '成绩导出返回 xlsx', scoreBytes.length)
}

const appeals = await api('GET', '/appeals?status=pending', { token })
check(appeals.status === 200 && Array.isArray(appeals.json.data), '申诉队列接口可用', appeals.json?.pagination)

const templates = await api('GET', '/notification-templates', { token })
check(templates.status === 200 && templates.json.data.length >= 5, '通知默认模板已随迁移 0007 落库', templates.json?.data?.length)
const codes = (templates.json.data ?? []).map((item) => item.code).sort()
check(codes.includes('exam_publish') && codes.includes('score_appeal'), '模板编码覆盖发布与申诉场景', codes)

const logs = await api('GET', '/notification-logs?page_size=5', { token })
check(logs.status === 200 && logs.json.pagination.total > 0, '发送记录接口有数据', logs.json?.pagination)

console.log(`\nLIVE VERIFY ${process.exitCode ? 'FAILED' : 'PASSED'}: ${results.length} checks / ${failures.length} failed`)
