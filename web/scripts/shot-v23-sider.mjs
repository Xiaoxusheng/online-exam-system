// 侧栏精修验收：选中态图标容器、分组分隔线、左侧选中条、底部状态胶囊、收拢态。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5174'
const ACCOUNT = 'admin'
const PASSWORD = 'Admin@123456'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v23'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
page.setDefaultTimeout(25_000)
page.on('pageerror', (error) => errors.push(`pageerror ${page.url()}: ${String(error?.message ?? error)}`))

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await page.fill('input[placeholder="请输入密码"]', PASSWORD)
await page.click('.login-form button[type="submit"]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await page.waitForTimeout(1400)

// 侧栏整体（工作台选中态）
await page.screenshot({ path: `${OUT}/01_sider_default.png`, clip: { x: 0, y: 0, width: 260, height: 900 } })
console.log('shot - 01_sider_default')

// hover 一个未选中菜单项
await page.locator('.app-menu .ant-menu-item:has-text("监考中心")').hover()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/02_sider_hover.png`, clip: { x: 0, y: 0, width: 260, height: 900 } })
console.log('shot - 02_sider_hover')

// 选中另一个菜单项（监考中心页），看新选中态
await page.locator('.app-menu .ant-menu-item:has-text("监考中心")').click()
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/03_sider_selected.png`, clip: { x: 0, y: 0, width: 260, height: 900 } })
console.log('shot - 03_sider_selected')

// 收拢态
await page.click('.app-header button[aria-label="切换导航"]')
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/04_sider_collapsed.png`, clip: { x: 0, y: 0, width: 90, height: 900 } })
console.log('shot - 04_sider_collapsed')
await page.click('.app-header button[aria-label="切换导航"]')
await page.waitForTimeout(500)

await browser.close()

if (errors.length) {
  console.error('JS 错误：')
  errors.forEach((e) => console.error('  ' + e))
  process.exitCode = 1
} else {
  console.log('完成，无 JS 报错')
}
