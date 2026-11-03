// 全局改造验收：panel-card 间距、metric-cell 卡片化、我的成绩/成绩管理/账号卡片。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5174'
const ACCOUNT = 'admin'
const PASSWORD = 'Admin@123456'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v26'
mkdirSync(OUT, { recursive: true })

const errors = []
const results = []
function check(ok, label, detail) {
  if (!ok) {
    console.error(`FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300))
    process.exitCode = 1
    return
  }
  results.push(label)
  console.log(`ok - ${label}`)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
page.setDefaultTimeout(25_000)
page.on('pageerror', (error) => errors.push(`pageerror ${page.url()}: ${String(error?.message ?? error)}`))
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
    errors.push(`console ${msg.location()?.url ?? page.url()}: ${msg.text().slice(0, 160)}`)
  }
})

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await page.fill('input[placeholder="请输入密码"]', PASSWORD)
await page.click('.login-form button[type="submit"]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await page.waitForTimeout(1200)

// 监考中心：选中考试 → 指标卡与卡片间距
await page.goto(`${BASE}/proctor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.locator('.room-card').first().click()
await page.waitForTimeout(2200)
const metricCell = page.locator('.metric-cell').first()
const cellStyle = await metricCell.evaluate((el) => {
  const s = getComputedStyle(el)
  return { border: s.borderTopWidth, radius: s.borderRadius, h: el.getBoundingClientRect().height }
})
check(cellStyle.border === '1px', '指标卡有细边框', cellStyle)
const firstPanel = page.locator('.content-inner .panel-card').first()
const panelStyle = await firstPanel.evaluate((el) => getComputedStyle(el).marginBottom)
check(panelStyle === '14px', 'panel-card 间距 14px', { marginBottom: panelStyle })
const metricCount = await page.locator('.metric-cell').count()
check(metricCount >= 8, '指标卡数量', { count: metricCount })
await page.screenshot({ path: `${OUT}/01_proctor_metrics.png` })
console.log('shot - 01_proctor_metrics')

// 我的成绩（admin 无成绩数据：预期展示新空态卡片；有数据则展示成绩卡片）
await page.goto(`${BASE}/my/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const myScoreCards = await page.locator('.room-card').count()
const emptyVisible = (await page.locator('.empty-state:has-text("还没有已发布的成绩")').count()) === 1
check(myScoreCards > 0 || emptyVisible, '我的成绩：卡片或空态渲染', { cards: myScoreCards, empty: emptyVisible })
await page.screenshot({ path: `${OUT}/02_my_scores.png` })
console.log('shot - 02_my_scores')

// 成绩管理
await page.goto(`${BASE}/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const scoreCards = await page.locator('.room-card').count()
check(scoreCards > 0, '成绩管理卡片渲染', { count: scoreCards })
await page.screenshot({ path: `${OUT}/03_scores.png` })
console.log('shot - 03_scores')

// 账号与角色
await page.goto(`${BASE}/system/users`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const userCards = await page.locator('.room-card').count()
check(userCards > 0, '账号卡片渲染', { count: userCards })
await page.screenshot({ path: `${OUT}/04_users.png` })
console.log('shot - 04_users')
await page.click('.ant-tabs-tab:has-text("角色与数据范围")')
await page.waitForTimeout(1200)
const roleCards = await page.locator('.room-card').count()
check(roleCards >= 6, '角色卡片渲染', { count: roleCards })
await page.screenshot({ path: `${OUT}/05_roles.png` })
console.log('shot - 05_roles')

await browser.close()

console.log(`\n${results.length} 项断言通过，${process.exitCode ? '存在失败' : '全部通过'}`)
if (errors.length) {
  console.error('\nJS 错误：')
  errors.forEach((e) => console.error('  ' + e))
  process.exitCode = 1
} else {
  console.log('无 JS 报错')
}
