// v1.1 视觉快照：多端 + 暗色，用于对比布局与配色。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5174'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v7'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(25_000)
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e?.message ?? e}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text().slice(0, 160)}`)
})

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/00_login.png`, fullPage: true })

await page.fill('input[placeholder="用户名或手机号"]', 'admin')
await page.fill('input[placeholder="请输入密码"]', 'Admin@123456')
await page.click('.login-form button[type="submit"]')
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
await page.waitForTimeout(1500)

const pages = [
  ['01_dashboard', '/'],
  ['02_questions', '/questions'],
  ['03_exams', '/exams'],
  ['04_scores', '/scores'],
  ['05_analytics', '/analytics'],
  ['06_review', '/review'],
  ['07_users', '/system/users'],
  ['08_notifications', '/system/notifications'],
]
for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('shot', name)
}

// 窄屏
await page.setViewportSize({ width: 1024, height: 800 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/09_tablet.png`, fullPage: true })
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/10_mobile.png`, fullPage: true })

// 暗色
await page.setViewportSize({ width: 1600, height: 900 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.click('.app-header button[aria-label="切换主题"]')
await page.waitForTimeout(900)
for (const [name, path] of [['11_dark_dashboard', '/'], ['12_dark_questions', '/questions'], ['13_dark_analytics', '/analytics']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors')
await browser.close()
