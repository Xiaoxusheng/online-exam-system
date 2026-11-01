// v2.4 线上复验：登录生产 → 侧栏精修 + 监考中心考场卡片（只读，不写任何数据）。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://118.25.50.65'
const ACCOUNT = 'admin'
const PASSWORD = 'Exam@ybkrdo3zQr'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v24'
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
await page.waitForTimeout(1800)
check(true, '生产登录成功')

// 侧栏：新版图标容器 + 底部胶囊
check((await page.locator('.app-menu .ant-menu-item-selected .ant-menu-item-icon').count()) === 1, '侧栏选中项图标容器渲染')
check((await page.locator('.sider-status').innerText()) === '服务正常', '侧栏底部状态胶囊')
await page.screenshot({ path: `${OUT}/01_live_sider.png`, clip: { x: 0, y: 0, width: 260, height: 900 } })
console.log('shot - 01_live_sider')

// 监考中心：RoomPicker
await page.goto(`${BASE}/proctor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
const cardCount = await page.locator('.room-card').count()
check(cardCount > 0, '线上考场卡片渲染', { count: cardCount })
check((await page.locator('.section-head h2').innerText()) === '选择要监考的考试', '线上区块标题')
await page.screenshot({ path: `${OUT}/02_live_proctor_picker.png` })
console.log('shot - 02_live_proctor_picker')

await browser.close()

console.log(`\n${results.length} 项断言通过，${process.exitCode ? '存在失败' : '全部通过'}`)
if (errors.length) {
  console.error('\nJS 错误：')
  errors.forEach((e) => console.error('  ' + e))
  process.exitCode = 1
} else {
  console.log('无 JS 报错')
}
