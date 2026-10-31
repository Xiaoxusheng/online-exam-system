// Backend end-to-end smoke test.
// Prerequisites: PostgreSQL migrated, API on :8081, seeded admin (Admin@123456).
// Usage: node scripts/e2e_backend.mjs
// Writes records prefixed with "E2E " and an e2e_student_* account; dev databases only.
const BASE = 'http://127.0.0.1:8081/api/v1'

const suffix = String(Date.now()).slice(-8)
const results = []

function check(condition, label, detail) {
  if (!condition) {
    console.error(`FAIL: ${label}`)
    if (detail !== undefined) console.error(JSON.stringify(detail, null, 2))
    process.exit(1)
  }
  results.push(label)
  console.log(`ok - ${label}`)
}

async function api(method, path, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: response.status, json }
}

function expect(res, status, label) {
  check(res.status === status, `${label} (HTTP ${res.status})`, res.json)
  return res.json?.data
}

async function login(account, password) {
  const res = await api('POST', '/auth/login', { body: { account, password } })
  return expect(res, 200, `login ${account}`).token
}

const adminToken = await login('admin', 'Admin@123456')

const unauth = await api('GET', '/auth/me')
check(unauth.status === 401, 'unauthenticated request rejected')

const campus = expect(
  await api('POST', '/campuses', { token: adminToken, body: { name: `E2E 校区 ${suffix}`, address: '测试地址' } }),
  201,
  'create campus',
)

const klass = expect(
  await api('POST', '/classes', { token: adminToken, body: { name: `E2E 班级 ${suffix}`, grade: '2026', campus_id: campus.id } }),
  201,
  'create class',
)
check(klass.campus_id === campus.id, 'class belongs to campus')

const studentUsername = `e2e_student_${suffix}`
const studentPassword = 'Student@123456'
const phone = `139${suffix}`
const student = expect(
  await api('POST', '/users', {
    token: adminToken,
    body: {
      name: 'E2E 考生',
      username: studentUsername,
      phone,
      password: studentPassword,
      role: 'student',
      data_scope: 'self',
      class_id: klass.id,
      campus_id: campus.id,
    },
  }),
  201,
  'create student',
)
check(student.class_id === klass.id, 'student class membership stored')

const studentToken = await login(studentUsername, studentPassword)
const forbidden = await api('GET', '/users', { token: studentToken })
check(forbidden.status === 403, 'student cannot list users')

const bank = expect(
  await api('POST', '/question-banks', { token: adminToken, body: { name: `E2E 题库 ${suffix}`, scope: 'org' } }),
  201,
  'create question bank',
)

async function createQuestion(payload, label) {
  const question = expect(
    await api('POST', '/questions', { token: adminToken, body: { bank_id: bank.id, ...payload } }),
    201,
    label,
  )
  expect(await api('POST', `/questions/${question.id}/publish`, { token: adminToken }), 200, `${label} publish`)
  return question
}

const single = await createQuestion(
  {
    type: 'single',
    knowledge_point: 'HTTP',
    difficulty: 'easy',
    default_score: 2,
    content: {
      stem: 'HTTP 状态码 200 表示什么？',
      options: [
        { key: 'A', text: '请求成功' },
        { key: 'B', text: '未找到' },
        { key: 'C', text: '服务器错误' },
        { key: 'D', text: '重定向' },
      ],
    },
    answer: { correct: ['A'] },
    score_rule: {},
  },
  'create single choice question',
)

const updatedSingle = expect(
  await api('PUT', `/questions/${single.id}`, {
    token: adminToken,
    body: { knowledge_point: 'HTTP 语义', difficulty: 'medium' },
  }),
  200,
  'update question creates a new version',
)
check(updatedSingle.version === 2, 'question version increments to 2', updatedSingle)

const multiple = await createQuestion(
  {
    type: 'multiple',
    knowledge_point: 'HTTP',
    difficulty: 'medium',
    default_score: 3,
    content: {
      stem: '以下哪些属于 HTTP 请求方法？',
      options: [
        { key: 'A', text: 'GET' },
        { key: 'B', text: 'SEND' },
        { key: 'C', text: 'POST' },
        { key: 'D', text: 'FETCH' },
      ],
    },
    answer: { correct: ['A', 'C'] },
    score_rule: { partial: 'ratio' },
  },
  'create multiple choice question',
)

const fill = await createQuestion(
  {
    type: 'fill',
    knowledge_point: '地理',
    difficulty: 'easy',
    default_score: 2,
    content: { stem: '请填写中国的首都与最大城市：____、____。' },
    answer: { answers: [['北京', 'Beijing'], ['上海']] },
    score_rule: {},
  },
  'create fill question',
)

const essay = await createQuestion(
  {
    type: 'essay',
    knowledge_point: '综合',
    difficulty: 'hard',
    default_score: 3,
    content: { stem: '简述在线考试中保证公平性的三项措施。' },
    answer: { reference: '身份核验、过程监考、事后复核。' },
    score_rule: {},
  },
  'create essay question',
)

const paper = expect(
  await api('POST', '/papers', {
    token: adminToken,
    body: {
      type: 'fixed',
      title: `E2E 固定卷 ${suffix}`,
      questions: [
        { question_id: single.id, section: '一、客观题', score: 2, paper_group: 'A' },
        { question_id: multiple.id, section: '一、客观题', score: 3, paper_group: 'A' },
        { question_id: fill.id, section: '一、客观题', score: 2, paper_group: 'A' },
        { question_id: essay.id, section: '二、主观题', score: 3, paper_group: 'A' },
      ],
    },
  }),
  201,
  'create fixed paper',
)
check(paper.total_score === 10, 'paper total score is 10')

expect(await api('POST', `/papers/${paper.id}/submit-review`, { token: adminToken }), 200, 'submit paper review')
const approvedPaper = expect(await api('POST', `/papers/${paper.id}/approve`, { token: adminToken }), 200, 'approve paper')
check(approvedPaper.status === 'approved', 'paper approved')

const startAt = new Date(Date.now() - 60_000).toISOString()
const endAt = new Date(Date.now() + 3_600_000).toISOString()
const exam = expect(
  await api('POST', '/exams', {
    token: adminToken,
    body: {
      paper_id: paper.id,
      title: `E2E 考试 ${suffix}`,
      start_at: startAt,
      end_at: endAt,
      duration_minutes: 60,
      rules: { pass_score: 6, show_score: true, anonymous_review: true },
      proctor_config: { level: 'basic' },
      candidates: [{ user_id: student.id, paper_group: 'A' }],
    },
  }),
  201,
  'create exam',
)
check(exam.candidate_count === 1, 'exam has one candidate')

const publishedExam = expect(await api('POST', `/exams/${exam.id}/publish`, { token: adminToken }), 200, 'publish exam')
check(publishedExam.status === 'pending_start', 'exam published and pending start')

const candidates = expect(
  await api('GET', `/exams/${exam.id}/candidates`, { token: adminToken }),
  200,
  'list exam candidates',
)
check(candidates.length === 1 && candidates[0].paper_group === 'A', 'candidate assigned to group A')

const myExams = expect(await api('GET', '/my/exams', { token: studentToken }), 200, 'student my exams')
check(myExams.length === 1 && myExams[0].attempt_id === null, 'student sees assigned exam')

const attempt = expect(
  await api('POST', `/exams/${exam.id}/attempts`, { token: studentToken }),
  201,
  'start attempt',
)
check(attempt.questions.length === 4, 'attempt serves four questions')
check(
  attempt.questions.every(
    (q) => q.answer === undefined && q.content?.correct === undefined && q.saved_answer !== undefined,
  ),
  'correct answers are not exposed',
)
check(attempt.remaining_seconds > 0, 'remaining seconds is positive')

const singleAnswer = expect(
  await api('PUT', `/attempts/${attempt.attempt_id}/answers/${single.id}`, {
    token: studentToken,
    body: { content: { value: 'A' }, version: 0 },
  }),
  200,
  'save single answer',
)
check(singleAnswer.version === 1, 'answer version starts at 1')

const conflict = await api('PUT', `/attempts/${attempt.attempt_id}/answers/${single.id}`, {
  token: studentToken,
  body: { content: { value: 'B' }, version: 0 },
})
check(conflict.status === 409, 'stale answer version rejected with 409')

expect(
  await api('PUT', `/attempts/${attempt.attempt_id}/answers/${multiple.id}`, {
    token: studentToken,
    body: { content: { values: ['A'] }, version: 0 },
  }),
  200,
  'save partial multiple answer',
)
expect(
  await api('PUT', `/attempts/${attempt.attempt_id}/answers/${fill.id}`, {
    token: studentToken,
    body: { content: { values: [' beijing ', '上海'] }, version: 0 },
  }),
  200,
  'save fill answer',
)
expect(
  await api('PUT', `/attempts/${attempt.attempt_id}/answers/${essay.id}`, {
    token: studentToken,
    body: { content: { text: '身份核验、过程监考、事后复核。' }, version: 0 },
  }),
  200,
  'save essay answer',
)

const proctorEvent = expect(
  await api('POST', `/attempts/${attempt.attempt_id}/events`, {
    token: studentToken,
    body: { type: 'tab_switch', level: 'warning', snapshot_url: '' },
  }),
  201,
  'report proctor event',
)

const submitted = expect(
  await api('POST', `/attempts/${attempt.attempt_id}/submit`, { token: studentToken }),
  200,
  'submit attempt',
)
check(submitted.status === 'submitted', 'attempt awaits manual review')
check(submitted.total_score === 5.5, 'auto grading total is 5.5', submitted)
check(submitted.pending_review === 1, 'one review task created', submitted)

const endedExam = expect(
  await api('GET', `/exams/${exam.id}`, { token: adminToken }),
  200,
  'exam detail after all candidates submit',
)
check(endedExam.status === 'ended', 'exam ends after all candidates submit', endedExam)

const saveAfterSubmit = await api('PUT', `/attempts/${attempt.attempt_id}/answers/${essay.id}`, {
  token: studentToken,
  body: { content: { text: '迟到修改' }, version: 1 },
})
check(saveAfterSubmit.status === 409, 'answers are read-only after submit')

const idempotent = expect(
  await api('POST', `/attempts/${attempt.attempt_id}/submit`, { token: studentToken }),
  200,
  'submit attempt is idempotent',
)
check(idempotent.total_score === 5.5 && idempotent.pending_review === 1, 'idempotent submit keeps result', idempotent)

const reviewTasks = expect(
  await api('GET', '/review-tasks?status=pending', { token: adminToken }),
  200,
  'list pending review tasks',
)
const reviewTask = reviewTasks.find((task) => task.attempt_id === attempt.attempt_id)
check(!!reviewTask && reviewTask.question_id === essay.id, 'essay review task exists', reviewTasks)

const reviewDetail = expect(
  await api('GET', `/review-tasks/${reviewTask.id}`, { token: adminToken }),
  200,
  'review task detail',
)
check(reviewDetail.anonymous === true && reviewDetail.candidate_name === '匿名考生', 'review is anonymous')
check(reviewDetail.question.score === 3, 'review max score from snapshot')

const reviewResult = expect(
  await api('POST', `/review-tasks/${reviewTask.id}/submit`, {
    token: adminToken,
    body: { score: 2.5, comment: '结构完整，要点齐全' },
  }),
  200,
  'submit manual review',
)
check(reviewResult.attempt_total === 8, 'attempt total after review is 8', reviewResult)
check(reviewResult.pending_review === 0, 'no pending review tasks remain', reviewResult)

const scoreDetail = expect(
  await api('GET', `/scores/${attempt.attempt_id}`, { token: adminToken }),
  200,
  'score detail',
)
check(scoreDetail.total === 8 && scoreDetail.attempt_status === 'graded', 'score detail reflects graded attempt', scoreDetail)
const essayScore = scoreDetail.detail.questions.find((q) => q.question_id === essay.id)
check(essayScore.score === 2.5 && essayScore.needs_review === false, 'manual score merged into detail', essayScore)

const submitAfterReview = expect(
  await api('POST', `/attempts/${attempt.attempt_id}/submit`, { token: studentToken }),
  200,
  'submit after review stays idempotent',
)
check(submitAfterReview.total_score === 8 && submitAfterReview.pending_review === 0, 'idempotent submit returns graded total', submitAfterReview)

const myScoresBeforePublish = expect(await api('GET', '/my/scores', { token: studentToken }), 200, 'my scores before publish')
check(myScoresBeforePublish.length === 0, 'unpublished scores are hidden from student')

const published = expect(
  await api('POST', '/scores/publish', { token: adminToken, body: { exam_id: exam.id } }),
  200,
  'publish scores',
)
check(published.published === 1, 'one score published')

const myScores = expect(await api('GET', '/my/scores', { token: studentToken }), 200, 'my scores after publish')
check(myScores.length === 1 && myScores[0].total === 8, 'student sees published score')

const analytics = expect(
  await api('GET', `/analytics/exams/${exam.id}`, { token: adminToken }),
  200,
  'exam analytics',
)
check(analytics.graded_count === 1 && analytics.average === 8, 'analytics average is 8', analytics)
check(analytics.highest === 8 && analytics.lowest === 8, 'analytics high/low are 8', analytics)
check(analytics.pass_rate === 100 && analytics.pass_score === 6, 'analytics pass rate is 100%', analytics)
check(analytics.total_score === 10, 'analytics total score is 10', analytics)

const proctorOverview = expect(
  await api('GET', `/proctor/exams/${exam.id}/overview`, { token: adminToken }),
  200,
  'proctor overview',
)
check(proctorOverview.candidates === 1 && proctorOverview.submitted === 1, 'proctor overview counts candidate', proctorOverview)
check(proctorOverview.unhandled_events === 1 && proctorOverview.warning_events === 1, 'unhandled warning event counted', proctorOverview)

const proctorEvents = expect(
  await api('GET', `/proctor/exams/${exam.id}/events`, { token: adminToken }),
  200,
  'list proctor events',
)
check(proctorEvents.length === 1 && proctorEvents[0].id === proctorEvent.id, 'proctor event listed', proctorEvents)

expect(
  await api('POST', `/proctor/events/${proctorEvent.id}/handle`, {
    token: adminToken,
    body: { action: 'warning', note: '已口头警告' },
  }),
  200,
  'handle proctor event',
)
const overviewAfterHandle = expect(
  await api('GET', `/proctor/exams/${exam.id}/overview`, { token: adminToken }),
  200,
  'proctor overview after handling',
)
check(overviewAfterHandle.unhandled_events === 0, 'handled event leaves queue', overviewAfterHandle)

const auditLogs = expect(
  await api('GET', '/audit-logs?action=exam.published', { token: adminToken }),
  200,
  'audit logs for exam publish',
)
check(auditLogs.some((log) => log.target_id === exam.id), 'exam publish is audited', auditLogs)

const notifications = expect(await api('GET', '/notifications', { token: studentToken }), 200, 'notifications list')
const examNotice = notifications.find((item) => item.source_type === 'exam_publish' && item.source_id === exam.id)
const scoreNotice = notifications.find((item) => item.source_type === 'score_publish' && item.source_id === exam.id)
check(!!examNotice, 'exam publish created an in-app notification', notifications)
check(!!examNotice && examNotice.content.includes('限时 60 分钟'), 'exam notice renders the exam window', examNotice)
check(!!scoreNotice && scoreNotice.content.includes('8.00'), 'score publish created an in-app notification', notifications)
expect(await api('PATCH', `/notifications/${examNotice.id}/read`, { token: studentToken }), 204, 'mark notification read')
const readAgain = expect(await api('GET', '/notifications', { token: studentToken }), 200, 'notifications after read')
check(
  readAgain.find((item) => item.id === examNotice.id).status === 'read',
  'notification status turns to read',
  readAgain,
)

const overview = expect(await api('GET', '/system/overview', { token: adminToken }), 200, 'system overview')
check(overview.users >= 2 && overview.questions >= 4, 'system overview counts records', overview)

// Random paper publish path
const randomPaper = expect(
  await api('POST', '/papers', {
    token: adminToken,
    body: {
      type: 'random',
      title: `E2E 随机卷 ${suffix}`,
      rules: {
        sections: [
          { name: '随机单选', type: 'single', count: 1, score: 2 },
          { name: '随机填空', type: 'fill', count: 1, score: 2 },
        ],
      },
      questions: [],
    },
  }),
  201,
  'create random paper',
)
check(randomPaper.total_score === 4, 'random paper total score is 4')
expect(await api('POST', `/papers/${randomPaper.id}/submit-review`, { token: adminToken }), 200, 'random paper submit review')
expect(await api('POST', `/papers/${randomPaper.id}/approve`, { token: adminToken }), 200, 'random paper approve')
const randomExam = expect(
  await api('POST', '/exams', {
    token: adminToken,
    body: {
      paper_id: randomPaper.id,
      title: `E2E 随机考试 ${suffix}`,
      start_at: startAt,
      end_at: endAt,
      duration_minutes: 60,
      candidates: [{ user_id: student.id }],
    },
  }),
  201,
  'create random exam',
)
const randomPublished = expect(
  await api('POST', `/exams/${randomExam.id}/publish`, { token: adminToken }),
  200,
  'publish random exam',
)
check(randomPublished.status === 'pending_start' && randomPublished.paper_type === 'random', 'random exam snapshot published', randomPublished)

// AB paper path: candidate in group B only receives group B questions.
const abPaper = expect(
  await api('POST', '/papers', {
    token: adminToken,
    body: {
      type: 'ab',
      title: `E2E AB卷 ${suffix}`,
      questions: [
        { question_id: single.id, section: 'A 组', score: 2, paper_group: 'A' },
        { question_id: multiple.id, section: 'B 组', score: 3, paper_group: 'B' },
      ],
    },
  }),
  201,
  'create AB paper',
)
expect(await api('POST', `/papers/${abPaper.id}/submit-review`, { token: adminToken }), 200, 'AB paper submit review')
expect(await api('POST', `/papers/${abPaper.id}/approve`, { token: adminToken }), 200, 'AB paper approve')
const abExam = expect(
  await api('POST', '/exams', {
    token: adminToken,
    body: {
      paper_id: abPaper.id,
      title: `E2E AB考试 ${suffix}`,
      start_at: startAt,
      end_at: endAt,
      duration_minutes: 60,
      rules: { show_score: false, anonymous_review: true },
      candidates: [{ user_id: student.id, paper_group: 'B' }],
    },
  }),
  201,
  'create AB exam',
)
expect(await api('POST', `/exams/${abExam.id}/publish`, { token: adminToken }), 200, 'publish AB exam')
const abAttempt = expect(
  await api('POST', `/exams/${abExam.id}/attempts`, { token: studentToken }),
  201,
  'start AB attempt',
)
check(abAttempt.paper_group === 'B', 'AB attempt uses candidate group B', abAttempt)
check(
  abAttempt.questions.length === 1 && abAttempt.questions[0].question_id === multiple.id,
  'AB attempt only serves group B questions',
  abAttempt.questions,
)
const abSubmit = expect(
  await api('POST', `/attempts/${abAttempt.attempt_id}/submit`, { token: studentToken }),
  200,
  'submit AB attempt',
)
check(abSubmit.status === 'graded', 'AB objective submit auto grades', abSubmit)
check(
  abSubmit.total_score === null && abSubmit.score_visible === false,
  'score is hidden when show_score is false',
  abSubmit,
)
const myExamsAfterAB = expect(await api('GET', '/my/exams', { token: studentToken }), 200, 'my exams after AB submit')
const abExamItem = myExamsAfterAB.find((item) => item.id === abExam.id)
check(
  abExamItem && abExamItem.score === null && abExamItem.score_status === 'pending',
  'unpublished score is not exposed in my exams',
  abExamItem,
)

// ---------------------------------------------------------------------------
// v0.4: proctor websocket, staff scope, double review + arbitration, absence
// ---------------------------------------------------------------------------

async function waitFor(predicate, label, timeoutMs = 15_000, detail) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) check(false, label, detail ?? {})
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

function connectSocket(url) {
  return new Promise((resolve) => {
    const socket = new WebSocket(url)
    const messages = []
    socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)))
    socket.addEventListener('open', () => resolve({ socket, messages }))
    socket.addEventListener('error', () => resolve({ socket: null, messages }))
  })
}

const staffPassword = 'Staff@123456'

async function createStaff(role, tag, name, dataScope = 'class') {
  const username = `e2e_${role}_${tag}_${suffix}`
  const user = expect(
    await api('POST', '/users', {
      token: adminToken,
      body: {
        name,
        username,
        phone: `137${tag.replace(/[^a-z0-9]/g, '')}${suffix}`,
        password: staffPassword,
        role,
        data_scope: dataScope,
        campus_id: campus.id,
        class_id: role === 'student' ? klass.id : undefined,
      },
    }),
    201,
    `create ${name}`,
  )
  return { ...user, token: await login(username, staffPassword) }
}

const reviewerA = await createStaff('reviewer', 'a', 'E2E 阅卷甲')
const reviewerB = await createStaff('reviewer', 'b', 'E2E 阅卷乙')
const reviewerC = await createStaff('reviewer', 'c', 'E2E 阅卷仲裁')
const proctorIn = await createStaff('proctor', 'in', 'E2E 监考甲')
const proctorOut = await createStaff('proctor', 'out', 'E2E 监考乙')
const examAdmin = await createStaff('exam_admin', 'ea', 'E2E 考务', 'org')
const student2 = await createStaff('student', 's2', 'E2E 考生2', 'self')

const essay2 = await createQuestion(
  {
    type: 'essay',
    knowledge_point: '公平性',
    difficulty: 'hard',
    default_score: 5,
    content: { stem: '论述三评仲裁机制的作用。' },
    answer: { reference: '分差超阈值时由第三位教师裁决。' },
    score_rule: {},
  },
  'create arbitration essay',
)

const doublePaper = expect(
  await api('POST', '/papers', {
    token: adminToken,
    body: {
      type: 'fixed',
      title: `E2E 双评卷 ${suffix}`,
      questions: [
        { question_id: single.id, section: '一、客观题', score: 2, paper_group: 'A' },
        { question_id: essay.id, section: '二、主观题', score: 3, paper_group: 'A' },
        { question_id: essay2.id, section: '二、主观题', score: 5, paper_group: 'A' },
      ],
    },
  }),
  201,
  'create double review paper',
)
expect(await api('POST', `/papers/${doublePaper.id}/submit-review`, { token: adminToken }), 200, 'double review paper submit review')
expect(await api('POST', `/papers/${doublePaper.id}/approve`, { token: adminToken }), 200, 'double review paper approve')

const badRules = await api('POST', '/exams', {
  token: adminToken,
  body: {
    paper_id: doublePaper.id,
    title: `E2E 非法规则 ${suffix}`,
    start_at: startAt,
    end_at: endAt,
    duration_minutes: 60,
    rules: { review_mode: 'duble' },
    candidates: [{ user_id: student2.id }],
  },
})
check(badRules.status === 400, 'unknown review_mode is rejected', badRules.json)

const doubleExam = expect(
  await api('POST', '/exams', {
    token: adminToken,
    body: {
      paper_id: doublePaper.id,
      title: `E2E 双评考试 ${suffix}`,
      start_at: startAt,
      end_at: endAt,
      duration_minutes: 60,
      rules: { review_mode: 'double', review_threshold: 1, show_score: true, anonymous_review: true },
      candidates: [{ user_id: student2.id }],
    },
  }),
  201,
  'create double review exam',
)
expect(await api('POST', `/exams/${doubleExam.id}/publish`, { token: adminToken }), 200, 'publish double review exam')

const wrongRoleAssign = await api('PUT', `/exams/${doubleExam.id}/proctors`, {
  token: adminToken,
  body: { user_ids: [student.id] },
})
check(wrongRoleAssign.status === 409, 'a student cannot be assigned as proctor', wrongRoleAssign.json)
const badUuidAssign = await api('PUT', `/exams/${doubleExam.id}/reviewers`, { token: adminToken, body: { user_ids: ['not-a-uuid'] } })
check(badUuidAssign.status === 400, 'non-uuid staff id is rejected', badUuidAssign.json)
const assignedProctors = expect(
  await api('PUT', `/exams/${doubleExam.id}/proctors`, { token: adminToken, body: { user_ids: [proctorIn.id, proctorIn.id] } }),
  200,
  'assign exam proctors (duplicated id collapses)',
)
check(assignedProctors.length === 1 && assignedProctors[0].user_id === proctorIn.id, 'only one proctor assigned', assignedProctors)
expect(
  await api('PUT', `/exams/${doubleExam.id}/reviewers`, {
    token: adminToken,
    body: { user_ids: [reviewerA.id, reviewerB.id, reviewerC.id] },
  }),
  200,
  'assign exam reviewers',
)

check(
  (await api('GET', `/proctor/exams/${doubleExam.id}/overview`, { token: proctorIn.token })).status === 200,
  'assigned proctor can open the room',
)
const scopeDenied = await api('GET', `/proctor/exams/${doubleExam.id}/overview`, { token: proctorOut.token })
check(scopeDenied.status === 403, 'unassigned proctor is denied the room', scopeDenied.json)
check(
  (await api('GET', `/proctor/exams/${doubleExam.id}/overview`, { token: examAdmin.token })).status === 200,
  'exam administrator is not limited by room assignment',
)

const wsPath = `/proctor/exams/${doubleExam.id}/ws`
check((await api('GET', wsPath)).status === 401, 'websocket requires a token')
check((await api('GET', `${wsPath}?token=${studentToken}`)).status === 403, 'student token cannot join a proctor room')
check((await api('GET', `${wsPath}?token=${proctorOut.token}`)).status === 403, 'unassigned proctor token cannot join the room')

const wsURL = `ws://127.0.0.1:8081/api/v1${wsPath}?token=${encodeURIComponent(proctorIn.token)}`
const room = await connectSocket(wsURL)
check(!!room.socket, 'assigned proctor websocket connects')
await waitFor(() => room.messages.length > 0, 'websocket hello frame arrives', 10_000, room.messages)
const seen = (type) => room.messages.some((message) => message.type === type)
check(
  room.messages[0].type === 'connected' && room.messages[0].data.exam_id === doubleExam.id,
  'hello frame identifies the room',
  room.messages,
)

const doubleAttempt = expect(
  await api('POST', `/exams/${doubleExam.id}/attempts`, { token: student2.token }),
  201,
  'start double review attempt',
)
await waitFor(() => seen('attempt_started'), 'attempt_started is broadcast', 10_000, room.messages)
check(
  room.messages.find((message) => message.type === 'attempt_started').user_name === 'E2E 考生2',
  'attempt_started carries the candidate name',
  room.messages,
)

expect(
  await api('POST', `/attempts/${doubleAttempt.attempt_id}/events`, {
    token: student2.token,
    body: { type: 'copy', level: 'critical', snapshot_url: '' },
  }),
  201,
  'report critical proctor event',
)
await waitFor(() => seen('proctor_event'), 'proctor_event is broadcast', 10_000, room.messages)
const alarm = room.messages.find((message) => message.type === 'proctor_event')
check(alarm.detail.level === 'critical' && alarm.attempt_id === doubleAttempt.attempt_id, 'alarm payload is complete', alarm)

expect(
  await api('PUT', `/attempts/${doubleAttempt.attempt_id}/answers/${single.id}`, {
    token: student2.token,
    body: { content: { value: 'A' }, version: 0 },
  }),
  200,
  'save single answer in double review exam',
)
expect(
  await api('PUT', `/attempts/${doubleAttempt.attempt_id}/answers/${essay.id}`, {
    token: student2.token,
    body: { content: { text: '身份核验、过程监考、事后复核。' }, version: 0 },
  }),
  200,
  'save first essay answer',
)
expect(
  await api('PUT', `/attempts/${doubleAttempt.attempt_id}/answers/${essay2.id}`, {
    token: student2.token,
    body: { content: { text: '分差超阈值时由第三位教师裁决。' }, version: 0 },
  }),
  200,
  'save second essay answer',
)

const doubleSubmit = expect(
  await api('POST', `/attempts/${doubleAttempt.attempt_id}/submit`, { token: student2.token }),
  200,
  'submit double review attempt',
)
check(doubleSubmit.pending_review === 2, 'two subjective answers create two review tasks', doubleSubmit)
await waitFor(() => seen('attempt_submitted'), 'attempt_submitted is broadcast', 10_000, room.messages)
room.socket.close()

const retry = await connectSocket(wsURL)
check(!!retry.socket, 'the proctor room accepts a reconnect')
await waitFor(() => retry.messages.some((message) => message.type === 'connected'), 'reconnect hello frame arrives', 10_000, retry.messages)
retry.socket.close()

const poolA = expect(await api('GET', '/review-tasks?status=pending', { token: reviewerA.token }), 200, 'reviewer A pending pool')
const poolB = expect(await api('GET', '/review-tasks?status=pending', { token: reviewerB.token }), 200, 'reviewer B pending pool')
const poolC = expect(await api('GET', '/review-tasks?status=pending', { token: reviewerC.token }), 200, 'reviewer C pending pool')
const adminPool = expect(
  await api('GET', `/review-tasks?status=pending&exam_id=${doubleExam.id}`, { token: examAdmin.token }),
  200,
  'exam administrator sees the whole pool',
)
check(adminPool.length === 2 && adminPool.every((task) => task.round === 1), 'both round-1 tasks listed', adminPool)
check(poolA.length + poolB.length + poolC.length === 2, 'reviewers only see their own assignments', { poolA, poolB, poolC })
check(new Set(adminPool.map((task) => task.reviewer_id)).size === 2, 'round-1 tasks are spread over two reviewers', adminPool)
check(adminPool.every((task) => task.user_name === '匿名考生'), 'anonymous review hides the candidate in the list', adminPool)

const reviewerTokens = new Map([
  [reviewerA.id, reviewerA.token],
  [reviewerB.id, reviewerB.token],
  [reviewerC.id, reviewerC.token],
])
function tokenOf(task) {
  const token = reviewerTokens.get(task.reviewer_id)
  check(!!token, `task ${task.id} is assigned to an exam reviewer`, task)
  return token
}

const essayTask = adminPool.find((task) => task.question_id === essay.id)
const otherToken = essayTask.reviewer_id === reviewerA.id ? reviewerB.token : reviewerA.token
const foreignSubmit = await api('POST', `/review-tasks/${essayTask.id}/submit`, { token: otherToken, body: { score: 1 } })
check(foreignSubmit.status === 403, 'reviewer cannot grade a colleagues task', foreignSubmit.json)
const foreignDetail = await api('GET', `/review-tasks/${essayTask.id}`, { token: otherToken })
check(foreignDetail.status === 403, 'reviewer cannot open a colleagues task', foreignDetail.json)

const firstRound = expect(
  await api('POST', `/review-tasks/${essayTask.id}/submit`, { token: tokenOf(essayTask), body: { score: 2, comment: '一轮 2 分' } }),
  200,
  'first reviewer grades the essay',
)
check(
  firstRound.round === 1 && firstRound.finalized === false && !!firstRound.next_task_id,
  'double review opens a second round instead of finalizing',
  firstRound,
)
const secondRound = expect(
  await api('GET', `/review-tasks/${firstRound.next_task_id}`, { token: examAdmin.token }),
  200,
  'second round task detail',
)
check(
  secondRound.round === 2 && secondRound.reviewer_id !== essayTask.reviewer_id,
  'second round is assigned to another reviewer',
  secondRound,
)
check(secondRound.review_mode === 'double' && secondRound.review_threshold === 1, 'review rules exposed to reviewers', secondRound)
const secondGraded = expect(
  await api('POST', `/review-tasks/${secondRound.id}/submit`, { token: tokenOf(secondRound), body: { score: 3, comment: '二轮 3 分' } }),
  200,
  'second reviewer grades the essay',
)
check(
  secondGraded.finalized === true && secondGraded.final_score === 2.5,
  'scores within threshold are averaged',
  secondGraded,
)
check(
  secondGraded.attempt_total === 4.5 && secondGraded.pending_review === 1,
  'attempt stays pending while the other question awaits review',
  secondGraded,
)

const essay2Task = adminPool.find((task) => task.question_id === essay2.id)
const arbFirst = expect(
  await api('POST', `/review-tasks/${essay2Task.id}/submit`, { token: tokenOf(essay2Task), body: { score: 5, comment: '一轮 5 分' } }),
  200,
  'first reviewer grades the arbitration essay',
)
const arbSecond = expect(
  await api('GET', `/review-tasks/${arbFirst.next_task_id}`, { token: examAdmin.token }),
  200,
  'second round task for the arbitration essay',
)
const arbGap = expect(
  await api('POST', `/review-tasks/${arbSecond.id}/submit`, { token: tokenOf(arbSecond), body: { score: 2, comment: '二轮 2 分' } }),
  200,
  'second reviewer disagrees on the arbitration essay',
)
check(
  arbGap.arbitration === true && arbGap.finalized === false && !!arbGap.next_task_id,
  'a gap beyond the threshold triggers arbitration',
  arbGap,
)
const arbitrationTask = expect(
  await api('GET', `/review-tasks/${arbGap.next_task_id}`, { token: examAdmin.token }),
  200,
  'arbitration task detail',
)
check(
  arbitrationTask.round === 3 && arbitrationTask.needs_arbitrate === true && arbitrationTask.rounds.length === 3,
  'all three rounds are visible to the arbitrator',
  arbitrationTask,
)
check(arbitrationTask.rounds[0].score === 5 && arbitrationTask.rounds[1].score === 2, 'previous round scores are listed', arbitrationTask.rounds)
const arbitration = expect(
  await api('POST', `/review-tasks/${arbitrationTask.id}/submit`, {
    token: tokenOf(arbitrationTask),
    body: { score: 4, comment: '仲裁 4 分' },
  }),
  200,
  'arbitrator grades the disputed answer',
)
check(arbitration.finalized === true && arbitration.final_score === 4, 'arbitration score becomes final', arbitration)
check(arbitration.attempt_total === 8.5 && arbitration.pending_review === 0, 'attempt total after arbitration is 8.5', arbitration)

const doubleScore = expect(
  await api('GET', `/scores/${doubleAttempt.attempt_id}`, { token: examAdmin.token }),
  200,
  'double review score record',
)
check(doubleScore.attempt_status === 'graded' && doubleScore.total === 8.5, 'attempt is graded after arbitration', doubleScore)
const mergedEssay = doubleScore.detail.questions.find((item) => item.question_id === essay.id)
check(mergedEssay.score === 2.5 && mergedEssay.needs_review === false, 'averaged score merged into the detail', mergedEssay)

expect(
  await api('POST', '/scores/publish', { token: examAdmin.token, body: { exam_id: doubleExam.id } }),
  200,
  'publish double review scores',
)
const student2Scores = expect(await api('GET', '/my/scores', { token: student2.token }), 200, 'student 2 sees published score')
check(student2Scores.length === 1 && student2Scores[0].total === 8.5, 'student 2 total is 8.5', student2Scores)
const student2Notes = expect(await api('GET', '/notifications', { token: student2.token }), 200, 'student 2 notifications')
check(
  student2Notes.some((item) => item.source_type === 'score_publish' && item.source_id === doubleExam.id),
  'score publish notified the candidate',
  student2Notes,
)
const republish = expect(
  await api('POST', '/scores/publish', { token: examAdmin.token, body: { exam_id: doubleExam.id } }),
  200,
  'republishing double scores',
)
check(republish.published === 0, 'republishing publishes nothing new', republish)
const student2NotesAgain = expect(await api('GET', '/notifications', { token: student2.token }), 200, 'student 2 notifications again')
check(
  student2NotesAgain.filter((item) => item.source_type === 'score_publish').length === 1,
  'duplicate score publish notifications are deduped',
  student2NotesAgain,
)

const reopening = expect(
  await api('PUT', `/exams/${doubleExam.id}/proctors`, { token: adminToken, body: { user_ids: [] } }),
  200,
  'clear exam proctor assignment',
)
check(reopening.length === 0, 'assignment list can be emptied', reopening)
check(
  (await api('GET', `/proctor/exams/${doubleExam.id}/overview`, { token: proctorOut.token })).status === 200,
  'an exam without assignment is open to every proctor',
)

const pastStart = new Date(Date.now() - 20 * 60_000).toISOString()
const pastEnd = new Date(Date.now() - 5 * 60_000).toISOString()
const closedExam = expect(
  await api('POST', '/exams', {
    token: adminToken,
    body: {
      paper_id: doublePaper.id,
      title: `E2E 缺考考试 ${suffix}`,
      start_at: pastStart,
      end_at: pastEnd,
      duration_minutes: 30,
      candidates: [{ user_id: student.id }, { user_id: student2.id }],
    },
  }),
  201,
  'create expired exam',
)
expect(await api('POST', `/exams/${closedExam.id}/publish`, { token: adminToken }), 200, 'publish expired exam')
await waitFor(
  async () => {
    const res = await api('GET', `/exams/${closedExam.id}`, { token: adminToken })
    return res.json?.data?.status === 'ended'
  },
  'background sweep closes the expired exam',
  50_000,
)
const closedCandidates = expect(await api('GET', `/exams/${closedExam.id}/candidates`, { token: adminToken }), 200, 'expired exam candidates')
check(
  closedCandidates.length === 2 && closedCandidates.every((item) => item.status === 'absent'),
  'candidates who never entered are marked absent',
  closedCandidates,
)
const lateStart = await api('POST', `/exams/${closedExam.id}/attempts`, { token: studentToken })
check(
  lateStart.status === 409 && lateStart.json?.error?.code === 'EXAM_EXPIRED',
  'a late candidate cannot enter the exam',
  lateStart.json,
)
const myExamsAfterClose = expect(await api('GET', '/my/exams', { token: studentToken }), 200, 'my exams after auto close')
const closedItem = myExamsAfterClose.find((item) => item.id === closedExam.id)
check(closedItem?.candidate_status === 'absent', 'student sees own absence', closedItem)
const closedAudit = expect(await api('GET', '/audit-logs?action=exam.reviewers_assigned', { token: adminToken }), 200, 'audit log for reviewer assignment')
check(closedAudit.length > 0, 'reviewer assignment is audited', closedAudit)

console.log(`\nE2E PASSED: ${results.length} checks`)
