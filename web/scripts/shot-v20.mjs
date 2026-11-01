// v2.0 本地视觉验收：dev server 逐屏截图 + 控制台报错收集。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5174'
const ACCOUNT = process.env.SHOT_USER ?? 'admin'
const PASSWORD = process.env.SHOT_PASS ?? 'Admin@123456'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v20'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
page.setDefaultTimeout(25_000)
page.on('pageerror', (error) => errors.push(`pageerror ${page.url()}: ${String(error?.message ?? error)}`))
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
    errors.push(`console ${msg.location()?.url ?? page.url()}: ${msg.text().slice(0, 160)}`)
  }
})

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`shot - ${name}`)
}

// 登录页（未登录状态）
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await shot('00_login')

// 登录
await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await page.fill('input[placeholder="请输入密码"]', PASSWORD)
await page.click('.login-form button[type="submit"]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await page.waitForTimeout(1800)
await shot('01_dashboard')

for (const [path, name, wait] of [
  ['/questions', '02_questions', 1600],
  ['/papers', '03_papers', 1600],
  ['/exams', '04_exams', 1600],
  ['/review', '05_review', 1600],
  ['/scores', '06_scores', 2000],
  ['/analytics', '07_analytics', 2400],
  ['/proctor', '08_proctor', 1600],
  ['/system/users', '09_users', 1600],
  ['/system/audit-logs', '10_audit', 1600],
  ['/notifications', '11_notifications', 1600],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  await shot(name)
}

// 暗色工作台
await page.click('.app-header button[aria-label="切换主题"]')
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await shot('12_dark_dashboard')
await page.click('.app-header button[aria-label="切换主题"]')
await page.waitForTimeout(400)

// 移动端宽度（登录后工作台 + 列表页）
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await shot('13_mobile_dashboard')
await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await shot('14_mobile_questions')

const noise = errors.filter((line) => !line.includes('Warning: [antd]'))
if (noise.length) console.log('\nBROWSER ERRORS:\n' + noise.join('\n'))
console.log(`\nDONE. errors: ${noise.length}`)
await browser.close()
