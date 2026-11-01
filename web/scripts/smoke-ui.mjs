// Functional smoke: sign in per role, crawl every workspace route and assert that each
// page renders, stays console-clean and that the session refreshes silently.
// Usage: npm run smoke   (dev server on :5174, API on :8081, seeded admin)
import { chromium } from 'playwright-core'

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:5174'
const ACCOUNT = process.env.SMOKE_ACCOUNT ?? 'admin'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'Admin@123456'

const results = []
const failures = []

function check(condition, label, detail) {
  if (condition) {
    results.push(label)
    console.log(`ok - ${label}`)
    return
  }
  failures.push(label)
  console.error(`FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400))
}

const routes = [
  { path: '/', title: null },
  { path: '/notifications', title: '我的通知' },
  { path: '/questions', title: '题库管理' },
  { path: '/papers', title: '试卷与组卷' },
  { path: '/exams', title: '考试管理' },
  { path: '/proctor', title: '监考中心' },
  { path: '/review', title: '阅卷中心' },
  { path: '/scores', title: '成绩管理' },
  { path: '/analytics', title: '数据分析' },
  { path: '/system/users', title: '账号与角色' },
  { path: '/system/orgs', title: '组织架构' },
  { path: '/system/audit-logs', title: '审计日志' },
  { path: '/system/notifications', title: '通知配置' },
]

const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL ?? 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(20_000)

const errors = []
page.on('pageerror', (error) => errors.push(`pageerror ${page.url()}: ${String(error?.message ?? error)}`))
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
    errors.push(`console ${msg.location()?.url ?? page.url()}: ${msg.text().slice(0, 160)}`)
  }
})
// The login call itself answers 401 on purpose when credentials are wrong; nothing
// else may fail during the crawl.
page.on('response', (response) => {
  if (response.status() >= 400 && !response.url().includes('/auth/login')) {
    errors.push(`http ${response.status()} ${response.url().replace(BASE, '')}`)
  }
})

async function signIn() {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
  await page.fill('input[placeholder="请输入密码"]', PASSWORD)
  await page.click('.login-form button[type="submit"]')
  await page.waitForURL(`${BASE}/`, { timeout: 20_000 })
  await page.waitForTimeout(900)
}

await signIn()
check(true, `sign in as ${ACCOUNT}`)

for (const route of routes) {
  const before = errors.length
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const heading = await page.locator('.page-title').first().innerText().catch(() => '')
  const headingOk = route.title === null ? heading.trim().length > 0 : heading.includes(route.title)
  check(headingOk, `${route.path} renders ${route.title ? `"${route.title}"` : 'its greeting title'}`, { heading })
  check(errors.length === before, `${route.path} has no console errors`, errors.slice(before))
}

// Unknown deep link must land on the 404 page, not a blank screen.
await page.goto(`${BASE}/definitely-not-a-route`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const notFound = await page.locator('.ant-result').count()
check(notFound === 1, 'unknown routes render the 404 page')

// Session refresh: expire the access token but keep the refresh token, then reload.
const session = await page.evaluate(() => JSON.parse(localStorage.getItem('online-exam.auth') ?? '{}'))
const stored = session.state ?? session
check(Boolean(stored.refreshToken), 'refresh token is persisted in the session store')
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('online-exam.auth'))
  const state = raw.state ?? raw
  state.token = 'expired-on-purpose'
  state.expiresAt = new Date(Date.now() - 60_000).toISOString()
  localStorage.setItem('online-exam.auth', JSON.stringify(raw.state ? { ...raw, state } : state))
})
await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
const recoveredHeading = await page.locator('.page-title').first().innerText().catch(() => '')
check(recoveredHeading.includes('题库管理'), 'an expired access token is refreshed silently', { recoveredHeading })
const refreshedSession = await page.evaluate(() => JSON.parse(localStorage.getItem('online-exam.auth') ?? '{}'))
const refreshed = refreshedSession.state ?? refreshedSession
check(Boolean(refreshed.token) && refreshed.token !== 'expired-on-purpose', 'the refreshed token replaces the stale one', {
  tokenPrefix: String(refreshed.token).slice(0, 12),
})

// --------------------------------------------------------------- v1.0 功能巡检（导入导出 / 分析 / 更正 / 批阅）
await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.click('button:has-text("批量导入")')
await page.waitForTimeout(700)
check((await page.locator('.ant-upload-drag').count()) === 1, '题库页可打开批量导入弹窗')
const templateDownload = page.waitForEvent('download', { timeout: 15_000 })
await page.click('button:has-text("下载模板")')
const downloaded = await templateDownload.catch(() => null)
check(Boolean(downloaded) && downloaded.suggestedFilename().includes('题目导入模板'), '模板下载带中文文件名', {
  name: downloaded?.suggestedFilename?.(),
})
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
const exportButton = await page.locator('button:has-text("导出")').count()
check(exportButton > 0, '题库页提供导出入口')

await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const examSelected = (await page.locator('.analytics-tabs').count()) > 0
check(examSelected, '数据分析页渲染页签工作区')
if (examSelected) {
  await page.click('.analytics-tabs .ant-tabs-tab:has-text("题目分析")')
  await page.waitForTimeout(1400)
  const itemRows = await page.locator('.analytics-tabs .ant-tabs-tabpane-active .ant-table-row').count()
  check(itemRows > 0, '题目分析列出逐题统计', { itemRows })
  check((await page.locator('.analytics-tabs .ant-tabs-tabpane-active .rate-bar').count()) > 0, '题目分析渲染正确率/得分率进度条')
  await page.click('.analytics-tabs .ant-tabs-tab:has-text("知识点分析")')
  await page.waitForTimeout(1400)
  const knowledgeRows = await page.locator('.analytics-tabs .ant-tabs-tabpane-active .ant-table-row').count()
  check(knowledgeRows > 0, '知识点分析列出掌握度', { knowledgeRows })
  check((await page.locator('.analytics-tabs .ant-tabs-tabpane-active .ant-tag').count()) > 0, '知识点显示掌握度标签')
}

await page.goto(`${BASE}/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const scoreRow = page.locator('.ant-table-row').first()
if (await scoreRow.count()) {
  await scoreRow.locator('button:has-text("明细")').click()
  await page.waitForTimeout(1300)
  check((await page.locator('.adjust-box').count()) === 1, '成绩明细抽屉提供更正面板')
  check((await page.locator('.ant-drawer .ant-table-row').count()) > 0, '成绩明细列出逐题得分')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}
check((await page.locator('.ant-tabs-tab:has-text("申诉管理")').count()) === 1, '成绩管理提供申诉处理页签')
await page.click('.ant-tabs-tab:has-text("申诉管理")')
await page.waitForTimeout(1200)
check((await page.locator('.ant-tabs-tabpane-active .ant-table').count()) > 0, '申诉列表正常渲染')

await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const reviewRow = page.locator('.ant-table-row').first()
if (await reviewRow.count()) {
  await reviewRow.locator('button').last().click()
  await page.waitForTimeout(1400)
  check((await page.locator('.review-nav').count()) === 1, '阅卷抽屉提供连续批阅导航')
  const position = await page.locator('.review-nav-position').innerText().catch(() => '')
  check(position.includes('第'), '阅卷抽屉显示队列位置', { position })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

await page.goto(`${BASE}/system/notifications`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
check((await page.locator('button:has-text("编辑")').count()) > 0, '通知模板支持编辑')
await page.click('.ant-tabs-tab:has-text("发送记录")')
await page.waitForTimeout(1400)
check((await page.locator('.ant-tabs-tabpane-active .ant-table-row').count()) > 0, '发送记录列出投递台账')

// Logout must end the session and return to the login screen.
await page.click('.user-chip')
await page.waitForTimeout(400)
await page.click('.ant-dropdown-menu-item:has-text("退出登录")')
await page.waitForTimeout(1200)
check(page.url().includes('/login'), 'logout returns to the login page', page.url())
const clearedSession = await page.evaluate(() => JSON.parse(localStorage.getItem('online-exam.auth') ?? '{}'))
const cleared = clearedSession.state ?? clearedSession
check(!cleared.token && !cleared.refreshToken, 'logout clears both tokens', cleared)

await browser.close()

const noise = errors.filter((line) => !line.includes('Warning: [antd]'))
if (noise.length) console.log('\nBROWSER ERRORS:\n' + noise.join('\n'))

if (failures.length) {
  console.log(`\nSMOKE FAILED: ${failures.length} / ${results.length + failures.length}`)
  process.exit(1)
}
console.log(`\nSMOKE PASSED: ${results.length} checks`)
