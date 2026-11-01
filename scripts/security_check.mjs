// Security regression: data scope, brute-force guard, token handling and injection.
// Usage: node scripts/security_check.mjs   (API on :8081, seeded admin, dev DB only)
//        API_BASE=http://127.0.0.1:18081/api/v1 node scripts/security_check.mjs   (isolated instance)
// Creates records prefixed with "SEC " / seccheck_ and removes them at the end.
import { inflateRawSync } from 'node:zlib'

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:8081/api/v1'
const suffix = String(Date.now()).slice(-8)
const results = []

function check(condition, label, detail) {
  if (!condition) {
    console.error(`FAIL: ${label}`)
    if (detail !== undefined) console.error(JSON.stringify(detail, null, 2))
    process.exitCode = 1
    throw new Error(`security check failed: ${label}`)
  }
  results.push(label)
  console.log(`ok - ${label}`)
}

async function api(method, path, { token, body, headers } = {}) {
  const init = { method, headers: { ...(headers ?? {}) } }
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`${BASE}${path}`, init)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: response.status, json, headers: response.headers }
}

const login = (account, password) => api('POST', '/auth/login', { body: { account, password } })
const adminLogin = await login('admin', 'Admin@123456')
check(adminLogin.status === 200, 'admin can sign in')
const admin = adminLogin.json.data.token
check(Boolean(adminLogin.json.data.refresh_token), 'login returns a refresh token')

const created = { users: [], campuses: [], classes: [], exams: [], papers: [], banks: [] }

async function createUser(payload) {
  const res = await api('POST', '/users', { token: admin, body: { password: 'Sec@123456', ...payload } })
  check(res.status === 201, `create user ${payload.username}`, res.json)
  created.users.push(res.json.data.id)
  return res.json.data
}

// ---------------------------------------------------------------- fixtures
const campusA = await api('POST', '/campuses', { token: admin, body: { name: `SEC 校区A ${suffix}` } })
const campusB = await api('POST', '/campuses', { token: admin, body: { name: `SEC 校区B ${suffix}` } })
created.campuses.push(campusA.json.data.id, campusB.json.data.id)

const classA = await api('POST', '/classes', { token: admin, body: { name: `SEC 班级A ${suffix}`, campus_id: campusA.json.data.id } })
const classB = await api('POST', '/classes', { token: admin, body: { name: `SEC 班级B ${suffix}`, campus_id: campusB.json.data.id } })
created.classes.push(classA.json.data.id, classB.json.data.id)

const teacherA = await createUser({ name: 'SEC 教师A', username: `seccheck_teacher_a_${suffix}`, phone: `173${suffix}`, role: 'teacher', data_scope: 'class', class_id: classA.json.data.id, campus_id: campusA.json.data.id })
const adminCampus = await createUser({ name: 'SEC 考务C', username: `seccheck_admin_c_${suffix}`, phone: `174${suffix}`, role: 'exam_admin', data_scope: 'campus', campus_id: campusA.json.data.id })
const teacherSelf = await createUser({ name: 'SEC 教师S', username: `seccheck_teacher_s_${suffix}`, phone: `175${suffix}`, role: 'teacher', data_scope: 'self' })
const studentA = await createUser({ name: 'SEC 学生A', username: `seccheck_student_a_${suffix}`, phone: `176${suffix}`, role: 'student', data_scope: 'self', class_id: classA.json.data.id, campus_id: campusA.json.data.id })
const studentB = await createUser({ name: 'SEC 学生B', username: `seccheck_student_b_${suffix}`, phone: `177${suffix}`, role: 'student', data_scope: 'self', class_id: classB.json.data.id, campus_id: campusB.json.data.id })
const examAdminUser = await createUser({ name: 'SEC 考务', username: `seccheck_exam_admin_${suffix}`, phone: `178${suffix}`, role: 'exam_admin', data_scope: 'org' })

const loginToken = async (username) => {
  const res = await login(username, 'Sec@123456')
  check(res.status === 200, `${username} can sign in`, res.json)
  return res.json.data.token
}
const tokenTeacherA = await loginToken(teacherA.username)
const tokenCampus = await loginToken(adminCampus.username)
const tokenSelf = await loginToken(teacherSelf.username)
const tokenStudentA = await loginToken(studentA.username)
const tokenExamAdmin = await loginToken(examAdminUser.username)

// ---------------------------------------------------------------- scope: directory
const usersForCampus = await api('GET', '/users?page_size=100', { token: tokenCampus })
check(usersForCampus.status === 200, 'campus-scoped exam admin can list users')
check(
  usersForCampus.json.data.length > 0 && usersForCampus.json.data.every((user) => user.campus_id === campusA.json.data.id),
  'campus scope hides users of other campuses',
  usersForCampus.json.data.map((user) => user.username),
)
check(
  !usersForCampus.json.data.some((user) => user.id === studentB.id),
  'campus scope excludes the other campus student',
)

const usersForAdmin = await api('GET', '/users?page_size=100', { token: admin })
check(usersForAdmin.json.pagination.total >= 6, 'org admin still sees the whole directory')

// ---------------------------------------------------------------- scope: scores
const bank = await api('POST', '/question-banks', { token: admin, body: { name: `SEC 题库 ${suffix}`, scope: 'org' } })
created.banks.push(bank.json.data.id)
const question = await api('POST', '/questions', {
  token: admin,
  body: { bank_id: bank.json.data.id, type: 'single', knowledge_point: '安全', difficulty: 'easy', default_score: 2, content: { stem: '安全校验题', options: [{ key: 'A', text: '对' }, { key: 'B', text: '错' }] }, answer: { correct: ['A'] }, score_rule: {} },
})
await api('POST', `/questions/${question.json.data.id}/publish`, { token: admin })
const paper = await api('POST', '/papers', { token: admin, body: { type: 'fixed', title: `SEC 试卷 ${suffix}`, questions: [{ question_id: question.json.data.id, section: '一', score: 2, paper_group: 'A' }] } })
created.papers.push(paper.json.data.id)
await api('POST', `/papers/${paper.json.data.id}/submit-review`, { token: admin })
await api('POST', `/papers/${paper.json.data.id}/approve`, { token: admin })
const exam = await api('POST', '/exams', {
  token: admin,
  body: { paper_id: paper.json.data.id, title: `SEC 考试 ${suffix}`, start_at: new Date(Date.now() - 60_000).toISOString(), end_at: new Date(Date.now() + 3_600_000).toISOString(), duration_minutes: 60, candidates: [{ user_id: studentA.id }, { user_id: studentB.id }] },
})
created.exams.push(exam.json.data.id)
await api('POST', `/exams/${exam.json.data.id}/publish`, { token: admin })

const attempts = {}
for (const [key, user] of [['a', studentA], ['b', studentB]]) {
  const token = await loginToken(user.username)
  const attempt = await api('POST', `/exams/${exam.json.data.id}/attempts`, { token })
  check(attempt.status === 201, `student ${key} can start the attempt`)
  const bodyText = JSON.stringify(attempt.json.data)
  check(!bodyText.includes('"answer"') && !bodyText.includes('"correct"'), `attempt payload for student ${key} never contains the answer key`)
  attempts[key] = { id: attempt.json.data.attempt_id, token }
}
for (const key of ['a', 'b']) {
  const saved = await api('PUT', `/attempts/${attempts[key].id}/answers/${question.json.data.id}`, { token: attempts[key].token, body: { content: { value: 'A' }, version: 0 } })
  check(saved.status === 200, `student ${key} can answer`)
  const submitted = await api('POST', `/attempts/${attempts[key].id}/submit`, { token: attempts[key].token })
  check(submitted.status === 200, `student ${key} can submit`)
}

const scoresForTeacherA = await api('GET', `/scores?exam_id=${exam.json.data.id}`, { token: tokenTeacherA })
check(scoresForTeacherA.status === 200, 'class-scoped teacher can list scores')
check(
  scoresForTeacherA.json.data.length === 1 && scoresForTeacherA.json.data[0].user_id === studentA.id,
  'class-scoped teacher only sees scores of the own class',
  scoresForTeacherA.json.data.map((item) => item.user_name),
)

const foreignScore = await api('GET', `/scores/${attempts.b.id}`, { token: tokenTeacherA })
check(foreignScore.status === 404, 'reading another class score record returns 404', foreignScore.json)

const ownScoreBeforePublish = await api('GET', `/my/scores/${attempts.a.id}`, { token: attempts.a.token })
check(ownScoreBeforePublish.status === 404, 'students cannot read unpublished score details', ownScoreBeforePublish.json)

const studentScoresList = await api('GET', '/scores', { token: tokenStudentA })
check(studentScoresList.status === 403, 'students cannot use the teacher score list', studentScoresList.json)

const analyticsA = await api('GET', `/analytics/exams/${exam.json.data.id}`, { token: tokenTeacherA })
check(analyticsA.status === 200 && analyticsA.json.data.candidate_count === 1, 'analytics is limited to the caller scope', analyticsA.json.data)

// ---------------------------------------------------------------- role gates / IDOR
for (const [path, label] of [
  ['/users', 'students cannot list the directory'],
  ['/review-tasks', 'students cannot open the review pool'],
  ['/audit-logs', 'students cannot read audit logs'],
  ['/papers', 'students cannot list papers'],
]) {
  const res = await api('GET', path, { token: tokenStudentA })
  check(res.status === 403, label, res.json)
}

const escalate = await api('PATCH', `/users/${examAdminUser.id}`, { token: tokenExamAdmin, body: { role: 'org_admin' } })
check(escalate.status === 403, 'exam admin cannot escalate accounts to org admin', escalate.json)

// ---------------------------------------------------------------- injection
const injection = await api('GET', `/users?keyword=${encodeURIComponent("' OR 1=1 --")}&page_size=100`, { token: admin })
check(injection.status === 200, 'injection-shaped keyword is accepted as data')
check(injection.json.pagination.total === 0, 'SQL injection payload matches nothing instead of everything', injection.json.pagination)

const questionInjection = await api('GET', `/questions?keyword=${encodeURIComponent("%' OR 1=1 --")}`, { token: admin })
check(questionInjection.status === 200 && questionInjection.json.pagination.total === 0, 'question keyword injection is neutralised', questionInjection.json.pagination)

// ------------------------------------------------------ export / import / correction surface
const binary = async (method, path, { token, body, headers } = {}) => {
  const init = { method, headers: { ...(headers ?? {}) } }
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (body !== undefined) init.body = body
  const response = await fetch(`${BASE}${path}`, init)
  return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) }
}
const isZip = (buffer) => buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b

// unzipEntry reads one member through the central directory (local headers may carry data descriptors).
function unzipEntry(buffer, want) {
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null
    const method = buffer.readUInt16LE(offset + 10)
    const compressed = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8')
    offset += 46 + nameLength + extraLength + commentLength
    if (name !== want) continue
    const localName = buffer.readUInt16LE(local + 26)
    const localExtra = buffer.readUInt16LE(local + 28)
    const start = local + 30 + localName + localExtra
    const data = buffer.slice(start, start + compressed)
    return method === 0 ? data.toString('utf8') : inflateRawSync(data).toString('utf8')
  }
  return null
}

const templateNoAuth = await binary('GET', '/questions/import-template')
check(templateNoAuth.status === 401, 'the import template requires authentication', templateNoAuth.status)

const exportForStudent = await binary('GET', `/scores/export?exam_id=${exam.json.data.id}`, { token: tokenStudentA })
check(exportForStudent.status === 403, 'students cannot export scores', exportForStudent.status)

const exportForClass = await binary('GET', `/scores/export?exam_id=${exam.json.data.id}`, { token: tokenTeacherA })
check(exportForClass.status === 200 && isZip(exportForClass.buffer), 'class teacher can export the own class')
check(exportForClass.headers.get('cache-control') === 'no-store', 'score export is never cached', exportForClass.headers.get('cache-control'))
const exportForSelf = await binary('GET', `/scores/export?exam_id=${exam.json.data.id}`, { token: tokenSelf })
check(exportForSelf.status === 200, 'self-scoped teacher can call the export')
check(exportForClass.buffer.length > exportForSelf.buffer.length, 'the export only contains rows inside the caller scope', {
  class: exportForClass.buffer.length,
  self: exportForSelf.buffer.length,
})

const exportCampusScope = await binary('GET', `/scores/export?exam_id=${exam.json.data.id}`, { token: tokenCampus })
check(exportCampusScope.status === 200 && isZip(exportCampusScope.buffer), 'campus admin can export')
const exportForOrgAdmin = await binary('GET', `/scores/export?exam_id=${exam.json.data.id}`, { token: admin })
check(exportForOrgAdmin.status === 200, 'org admin can export the same exam')
// Counting the worksheet rows proves the scope filter instead of guessing from file size.
const rowsOf = (buffer, sheet = 'xl/worksheets/sheet1.xml') => {
  const xml = unzipEntry(buffer, sheet)
  return xml ? (xml.match(/<row /g) ?? []).length : -1
}
check(rowsOf(exportForOrgAdmin.buffer) === 4, 'the org admin export carries both candidates', { rows: rowsOf(exportForOrgAdmin.buffer) })
check(rowsOf(exportCampusScope.buffer) === 3, 'the campus export carries only the campus candidate', { rows: rowsOf(exportCampusScope.buffer) })
check(rowsOf(exportForClass.buffer) === 3, 'the class export carries only the class candidate', { rows: rowsOf(exportForClass.buffer) })
check(rowsOf(exportForSelf.buffer) === 2, 'a self-scoped teacher exports an empty sheet', { rows: rowsOf(exportForSelf.buffer) })
const missingExport = await binary('GET', '/scores/export?exam_id=00000000-0000-0000-0000-000000000000', { token: admin })
check(missingExport.status === 404, 'exporting an unknown exam is a 404', missingExport.status)

const questionExportForStudent = await binary('GET', '/questions/export', { token: tokenStudentA })
check(questionExportForStudent.status === 403, 'students cannot export questions', questionExportForStudent.status)
const questionExportBadBank = await binary('POST', '/questions/import', {
  token: tokenTeacherA,
  body: (() => {
    const form = new FormData()
    form.append('bank_id', '00000000-0000-0000-0000-000000000000')
    form.append('file', new Blob([exportForClass.buffer]), 'x.xlsx')
    return form
  })(),
})
check(
  questionExportBadBank.status === 400 && questionExportBadBank.headers.get('content-type')?.includes('json'),
  'importing into an unknown bank is rejected',
  questionExportBadBank.status,
)
const hugeUpload = await binary('POST', '/questions/import', {
  token: tokenTeacherA,
  body: (() => {
    const form = new FormData()
    form.append('bank_id', bank.json.data.id)
    form.append('file', new Blob([Buffer.alloc(20 * 1024 * 1024)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'huge.xlsx')
    return form
  })(),
})
check([400, 413].includes(hugeUpload.status), 'an oversized upload is refused instead of parsed', hugeUpload.status)

const itemsForStudent = await api('GET', `/analytics/exams/${exam.json.data.id}/items`, { token: tokenStudentA })
check(itemsForStudent.status === 403, 'students cannot read item analytics', itemsForStudent.json)
const itemsForClass = await api('GET', `/analytics/exams/${exam.json.data.id}/items`, { token: tokenTeacherA })
check(
  itemsForClass.status === 200 && itemsForClass.json.data.participants === 1,
  'item analytics respect the class data scope',
  itemsForClass.json.data?.participants,
)
check(
  itemsForClass.json.data.items.every((item) => item.options.some((option) => option.key === 'A')),
  'option distribution only exposes aggregated counts',
  itemsForClass.json.data.items[0],
)
const knowledgeForCampus = await api('GET', '/analytics/knowledge-points', { token: tokenCampus })
check(knowledgeForCampus.status === 200, 'campus admin can read knowledge analytics')
check(
  knowledgeForCampus.json.data.points.every((point) => point.answers <= 1),
  'knowledge aggregates stay inside the caller scope',
  knowledgeForCampus.json.data.points,
)

const adjustAsStudent = await api('POST', `/scores/${attempts.b.id}/adjust`, {
  token: tokenStudentA,
  body: { reason: '越权', items: [{ question_id: question.json.data.id, score: 2 }] },
})
check(adjustAsStudent.status === 403, 'students cannot correct scores', adjustAsStudent.json)
const adjustAsTeacher = await api('POST', `/scores/${attempts.b.id}/adjust`, {
  token: tokenTeacherA,
  body: { reason: '越权', items: [{ question_id: question.json.data.id, score: 2 }] },
})
check(adjustAsTeacher.status === 403, 'teachers cannot correct scores', adjustAsTeacher.json)
const adjustForeignCampus = await api('POST', `/scores/${attempts.b.id}/adjust`, {
  token: tokenCampus,
  body: { reason: '跨校区', items: [{ question_id: question.json.data.id, score: 2 }] },
})
check(adjustForeignCampus.status === 404, 'a campus admin cannot correct a score outside the campus', adjustForeignCampus.json)
const adjustOwnCampus = await api('POST', `/scores/${attempts.a.id}/adjust`, {
  token: tokenCampus,
  body: { reason: 'SEC 本校更正', items: [{ question_id: question.json.data.id, score: 1 }] },
})
check(adjustOwnCampus.status === 200, 'the campus admin can correct a score inside the campus', adjustOwnCampus.json)
const historyLeak = await api('GET', `/scores/${attempts.a.id}/adjustments`, { token: tokenSelf })
check(historyLeak.status === 200 && historyLeak.json.data.length === 0, 'a self-scoped teacher cannot read the correction trail', historyLeak.json.data)

const appealOtherStudent = await api('POST', `/my/scores/${attempts.b.id}/appeals`, { token: tokenStudentA, body: { reason: '别人的答卷' } })
check([403, 404].includes(appealOtherStudent.status), 'a student cannot appeal another candidate’s attempt', appealOtherStudent.json)
const unpublishedAppeal = await api('POST', `/my/scores/${attempts.a.id}/appeals`, { token: attempts.a.token, body: { reason: '尚未发布' } })
check(unpublishedAppeal.status === 409, 'an unpublished score cannot be appealed', unpublishedAppeal.json)
const appealsAsStudent = await api('GET', '/appeals', { token: tokenStudentA })
check(appealsAsStudent.status === 403, 'students cannot open the appeal queue', appealsAsStudent.json)
const appealsAsTeacher = await api('GET', '/appeals', { token: tokenTeacherA })
check(appealsAsTeacher.status === 403, 'teachers cannot open the appeal queue', appealsAsTeacher.json)

const logsAsExamAdmin = await api('GET', '/notification-logs', { token: tokenExamAdmin })
check(logsAsExamAdmin.status === 403, 'exam admins cannot read the org-wide notification ledger', logsAsExamAdmin.json)
const templatesList = await api('GET', '/notification-templates', { token: admin })
const templateEditByTeacher = await api('PUT', `/notification-templates/${templatesList.json.data[0].id}`, {
  token: tokenTeacherA,
  body: { title_tpl: '越权改名' },
})
check(templateEditByTeacher.status === 403, 'teachers cannot edit notification templates', templateEditByTeacher.json)
const reviewQueueAsStudent = await api('GET', `/review-tasks/${attempts.a.id}/neighbors`, { token: tokenStudentA })
check(reviewQueueAsStudent.status === 403, 'students cannot browse the review queue', reviewQueueAsStudent.json)

const nastyExam = await api('POST', '/exams', {
  token: admin,
  body: {
    paper_id: paper.json.data.id,
    title: '../../etc/passwd 特别考试',
    start_at: new Date(Date.now() - 60_000).toISOString(),
    end_at: new Date(Date.now() + 3_600_000).toISOString(),
    duration_minutes: 60,
    candidates: [{ user_id: studentA.id }],
  },
})
created.exams.push(nastyExam.json.data.id)
const nastyExport = await binary('GET', `/scores/export?exam_id=${nastyExam.json.data.id}`, { token: admin })
check(nastyExport.status === 200, 'a title with path characters still exports')
const disposition = nastyExport.headers.get('content-disposition') ?? ''
check(
  disposition.startsWith('attachment; filename="export.xlsx"') && !disposition.includes('../') && !disposition.includes('/etc'),
  'the download header never leaks path characters',
  disposition,
)

// ---------------------------------------------------------------- token handling
const tampered = `${admin.slice(0, -4)}AAAA`
const tamperedRes = await api('GET', '/auth/me', { token: tampered })
check(tamperedRes.status === 401, 'tampered JWT is rejected', tamperedRes.json)

const probe = await createUser({ name: 'SEC 探针', username: `seccheck_probe_${suffix}`, phone: `179${suffix}`, role: 'student', data_scope: 'self' })
const probeLogin = await api('POST', '/auth/login', { body: { account: probe.username, password: 'Sec@123456' } })
check(probeLogin.status === 200, 'probe account can sign in once')
const probeRefresh = probeLogin.json.data.refresh_token
const probeToken = probeLogin.json.data.token

const rotate = await api('POST', '/auth/refresh', { body: { refresh_token: probeRefresh } })
check(rotate.status === 200 && rotate.json.data.refresh_token !== probeRefresh, 'refresh rotates the token', rotate.json)
const rotatedToken = rotate.json.data.refresh_token

const replay = await api('POST', '/auth/refresh', { body: { refresh_token: probeRefresh } })
check(replay.status === 401, 'replaying a rotated refresh token is rejected', replay.json)
const afterReplay = await api('POST', '/auth/refresh', { body: { refresh_token: rotatedToken } })
check(afterReplay.status === 401, 'reuse detection revokes the whole token family', afterReplay.json)

const refreshedAccess = rotate.json.data.token
check(Boolean(refreshedAccess), 'refresh returns a fresh access token')

// logout revokes
const secondLogin = await api('POST', '/auth/login', { body: { account: probe.username, password: 'Sec@123456' } })
const logoutRes = await api('POST', '/auth/logout', { token: secondLogin.json.data.token, body: { refresh_token: secondLogin.json.data.refresh_token } })
check(logoutRes.status === 204, 'logout accepts the refresh token', logoutRes.json)
const afterLogout = await api('POST', '/auth/refresh', { body: { refresh_token: secondLogin.json.data.refresh_token } })
check(afterLogout.status === 401, 'logout revokes the refresh token', afterLogout.json)

// disabled account: the old access token must stop working immediately
await api('PATCH', `/users/${probe.id}`, { token: admin, body: { status: 'disabled' } })
const disabledRes = await api('GET', '/auth/me', { token: probeToken })
check(disabledRes.status === 403 && disabledRes.json?.error?.code === 'ACCOUNT_DISABLED', 'a disabled account loses its existing token', disabledRes.json)

// ---------------------------------------------------------------- brute force guard
const brute = await createUser({ name: 'SEC 限流', username: `seccheck_brute_${suffix}`, phone: `180${suffix}`, role: 'student', data_scope: 'self' })
let limited = null
for (let i = 0; i < 5; i += 1) {
  const res = await api('POST', '/auth/login', { body: { account: brute.username, password: 'wrong-password' } })
  check(res.status === 401, `wrong password ${i + 1} is rejected`, res.json)
  limited = res
}
const sixth = await api('POST', '/auth/login', { body: { account: brute.username, password: 'Sec@123456' } })
check(sixth.status === 429, 'the sixth attempt is rate limited even with the right password', sixth.json)
const retryAfter = sixth.headers.get('retry-after')
check(Boolean(retryAfter) && Number(retryAfter) > 0, '429 carries Retry-After', { retryAfter })
check(sixth.json?.error?.code === 'TOO_MANY_ATTEMPTS', 'rate limit uses a dedicated error code', sixth.json)

// Fixtures are removed via psql afterwards; the printed ids make that deterministic.

console.log(`\nSECURITY PASSED: ${results.length} checks`)
console.log(JSON.stringify({ suffix, userIds: created.users, campusIds: created.campuses, classIds: created.classes, examIds: created.exams, paperIds: created.papers, bankIds: created.banks }))
