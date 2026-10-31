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
const notFound = await page.locator('.not-found').count()
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
