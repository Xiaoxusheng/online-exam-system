import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://118.25.50.65'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_live_v13'
mkdirSync(OUT, { recursive: true })

const results = []
const errors = []
function check(ok, label, detail) {
  results.push(label)
  console.log(ok ? `ok - ${label}` : `FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300))
  if (!ok) errors.push(label)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(25_000)

const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e?.message ?? e}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
    consoleErrors.push(`console: ${m.text().slice(0, 200)}`)
  }
})

// 登录页
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
check((await page.locator('.login-form-card, .ant-form').count()) > 0, '登录页渲染')
await page.screenshot({ path: `${OUT}/live_01_login.png`, fullPage: true })

// 登录
await page.fill('input[placeholder="用户名或手机号"]', 'admin')
await page.fill('input[placeholder="请输入密码"]', process.env.LIVE_PASSWORD ?? 'Admin@123456')
await page.click('.login-form button[type="submit"]')
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
await page.waitForTimeout(2000)
check(!page.url().includes('/login'), '管理员登录成功')

// 关键断言：v1.3 组件库化的产物
const home = await page.evaluate(() => ({
  statCards: document.querySelectorAll('.stat-card.ant-card').length,
  statistics: document.querySelectorAll('.ant-statistic').length,
  descriptions: document.querySelectorAll('.ant-descriptions').length,
  timeline: document.querySelectorAll('.ant-timeline').length,
  workTabs: document.querySelectorAll('.work-tabs.ant-tabs').length,
  quickCards: document.querySelectorAll('.quick-card.ant-card').length,
}))
check(home.statCards === 4, '工作台渲染 4 张 antd Statistic 指标卡', home)
check(home.statistics >= 4, '使用 antd Statistic', home)
check(home.descriptions >= 1, '基本信息使用 antd Descriptions', home)
check(home.timeline >= 1, '最近动态使用 antd Timeline', home)
check(home.workTabs === 1, '工作页签使用 antd Tabs', home)
check(home.quickCards === 4, '快捷入口使用 antd Card', home)
await page.screenshot({ path: `${OUT}/live_02_dashboard.png`, fullPage: true })

// 遍历主要路由
const routes = [
  ['03_questions', '/questions'],
  ['04_exams', '/exams'],
  ['05_scores', '/scores'],
  ['06_analytics', '/analytics'],
  ['07_review', '/review'],
  ['08_proctor', '/proctor'],
  ['09_users', '/system/users'],
  ['10_notifications', '/notifications'],
]
for (const [name, path] of routes) {
  const before = consoleErrors.length
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  const heading = await page.locator('.page-title').first().textContent().catch(() => '')
  check((heading ?? '').trim().length > 0, `${path} 渲染页面标题`, { heading })
  check(consoleErrors.length === before, `${path} 无控制台报错`, consoleErrors.slice(before))
  await page.screenshot({ path: `${OUT}/live_${name}.png`, fullPage: true })
}

// 分析页的 Progress 组件（v1.3 把手绘 SVG 环形图换成 antd Progress）
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const progress = await page.evaluate(() => ({
  circles: document.querySelectorAll('.ant-progress-circle').length,
  lines: document.querySelectorAll('.ant-progress-line').length,
  svgs: document.querySelectorAll('svg.donut-value').length,
}))
check(progress.circles >= 1, '判分概览使用 antd Progress 环形', progress)
check(progress.svgs === 0, '旧的自绘 SVG 环形图已移除', progress)

// 移动端
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/live_11_mobile.png`, fullPage: true })
check(consoleErrors.length === 0, '全程无控制台报错', consoleErrors.slice(0, 5))

// 暗色
await page.setViewportSize({ width: 1600, height: 900 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.click('.app-header button[aria-label="切换主题"]')
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/live_12_dark.png`, fullPage: true })

await browser.close()
console.log(`\n线上复验：${results.length - errors.length}/${results.length} 通过`)
if (consoleErrors.length) {
  console.log('控制台报错:')
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e))
}
process.exitCode = errors.length || consoleErrors.length ? 1 : 0
