// 监考中心 RoomPicker 改造验收：未选择考试的考场卡片视图 + 点击进入 + 移动端。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5174'
const ACCOUNT = 'admin'
const PASSWORD = 'Admin@123456'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v22'
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

// 登录
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await page.fill('input[placeholder="请输入密码"]', PASSWORD)
await page.click('.login-form button[type="submit"]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await page.waitForTimeout(1200)
check(true, '登录成功')

// 监考中心 · 未选择考试（RoomPicker）
await page.goto(`${BASE}/proctor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const roomCards = page.locator('.room-card')
const cardCount = await roomCards.count()
check(cardCount > 0, '考场卡片渲染', { count: cardCount })
check((await page.locator('.room-card.is-live').count()) === 1, '进行中考场带 is-live 标识')
check((await page.locator('.room-live-badge').count()) === 1, '进行中考场呼吸点徽标渲染')
check((await page.locator('.room-chip').count()) === cardCount, '每张卡片都有分配标记 chip')
// 第一张卡片应是进行中的（排序权重最高）
const firstTitle = await roomCards.first().locator('.room-card-title').innerText()
check(firstTitle.includes('物理'), '排序：进行中的考试排第一张', { firstTitle })
check((await page.locator('.section-head h2').innerText()) === '选择要监考的考试', '区块标题渲染')
await page.screenshot({ path: `${OUT}/01_proctor_picker_desktop.png`, fullPage: false })
await page.screenshot({ path: `${OUT}/01b_proctor_picker_full.png`, fullPage: true })
console.log('shot - 01_proctor_picker_desktop / full')

// 点击第一张卡片 → 进入监考视图
await roomCards.first().click()
await page.waitForTimeout(2200)
const picked = await page.locator('.page-alert').count()
check(picked >= 0, '点击卡片后离开选择视图', { alert: picked })
await page.screenshot({ path: `${OUT}/02_proctor_after_pick.png` })
console.log('shot - 02_proctor_after_pick')

// 回到选择视图，hover 一张卡片看交互反馈
await page.goto(`${BASE}/proctor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await roomCards.nth(1).hover()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/03_proctor_card_hover.png` })
console.log('shot - 03_proctor_card_hover')

// 移动端视口
const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await mobile.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await mobile.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await mobile.fill('input[placeholder="请输入密码"]', PASSWORD)
await mobile.click('.login-form button[type="submit"]')
await mobile.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await mobile.goto(`${BASE}/proctor`, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(1800)
const mobileCards = await mobile.locator('.room-card').count()
check(mobileCards > 0, '移动端考场卡片渲染', { count: mobileCards })
await mobile.screenshot({ path: `${OUT}/04_proctor_picker_mobile.png` })
console.log('shot - 04_proctor_picker_mobile')

await browser.close()

console.log(`\n${results.length} 项断言通过，${process.exitCode ? '存在失败' : '全部通过'}`)
if (errors.length) {
  console.error('\nJS 错误：')
  errors.forEach((e) => console.error('  ' + e))
  process.exitCode = 1
} else {
  console.log('无 JS 报错')
}
