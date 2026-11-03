// 考试管理卡片布局验收：筛选栏 + 卡片网格 + 分页 + 详情抽屉 + 移动端。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5174'
const ACCOUNT = 'admin'
const PASSWORD = 'Admin@123456'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v25'
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

await page.goto(`${BASE}/exams`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const cards = page.locator('.room-card')
const cardCount = await cards.count()
check(cardCount > 0, '考试卡片渲染', { count: cardCount })
check((await page.locator('.filter-bar').count()) === 1, '筛选栏保留')
check((await page.locator('.room-card-paper').count()) === cardCount, '每张卡片有试卷行')
check((await page.locator('.room-chip').count()) === cardCount, '每张卡片有判卷方式 chip')
check((await page.locator('.ant-pagination').count()) === 1, '独立分页器渲染')
const totalText = await page.locator('.ant-pagination-total-text').innerText()
check(totalText.includes('共'), '分页总数文案', { totalText })
await page.screenshot({ path: `${OUT}/01_exams_cards_desktop.png` })
console.log('shot - 01_exams_cards_desktop')

// 状态筛选：只看待开考
await page.locator('.filter-bar .ant-select').first().click()
await page.waitForTimeout(400)
await page.locator('.ant-select-dropdown .ant-select-item:has-text("待开考")').click()
await page.click('button:has-text("查询")')
await page.waitForTimeout(1400)
const filtered = await cards.count()
check(filtered > 0 && filtered < cardCount, '状态筛选生效', { filtered, before: cardCount })
await page.screenshot({ path: `${OUT}/02_exams_filtered.png` })
console.log('shot - 02_exams_filtered')

// 重置回全量，点击第一张卡片 → 详情抽屉
await page.click('button:has-text("重置")')
await page.waitForTimeout(1400)
await cards.first().click()
await page.waitForTimeout(1800)
const drawer = await page.locator('.ant-drawer-open').count()
check(drawer === 1, '点击卡片打开详情抽屉')
await page.screenshot({ path: `${OUT}/03_exams_detail_drawer.png` })
console.log('shot - 03_exams_detail_drawer')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// 移动端
const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await mobile.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await mobile.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await mobile.fill('input[placeholder="请输入密码"]', PASSWORD)
await mobile.click('.login-form button[type="submit"]')
await mobile.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await mobile.goto(`${BASE}/exams`, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(2000)
check((await mobile.locator('.room-card').count()) > 0, '移动端考试卡片渲染')
await mobile.screenshot({ path: `${OUT}/04_exams_mobile.png` })
console.log('shot - 04_exams_mobile')

await browser.close()

console.log(`\n${results.length} 项断言通过，${process.exitCode ? '存在失败' : '全部通过'}`)
if (errors.length) {
  console.error('\nJS 错误：')
  errors.forEach((e) => console.error('  ' + e))
  process.exitCode = 1
} else {
  console.log('无 JS 报错')
}
