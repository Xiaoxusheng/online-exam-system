// 线上实例视觉验收：真实生产地址 + 无头浏览器逐屏截图。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.LIVE_BASE ?? 'http://118.25.50.65'
const ACCOUNT = process.env.LIVE_USER ?? 'admin'
const PASSWORD = process.env.LIVE_PASS ?? ''
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v6'
mkdirSync(OUT, { recursive: true })

const errors = []
const results = []
function check(ok, label, detail) {
  if (!ok) {
    console.error(`FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 200))
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

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`shot - ${name}`)
}

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await page.fill('input[placeholder="请输入密码"]', PASSWORD)
await page.click('.login-form button[type="submit"]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await page.waitForTimeout(1600)
check(!(await page.locator('.ant-message-error').count()), '线上登录成功且无错误提示')
await shot('20_live_dashboard')

await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.click('button:has-text("批量导入")')
await page.waitForTimeout(900)
check((await page.locator('.drop-zone').count()) === 1, '线上导入弹窗渲染正常')
await shot('21_live_import_dialog')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)
await page.click('.analytics-tabs .ant-tabs-tab:has-text("题目分析")')
await page.waitForTimeout(2000)
check((await page.locator('.analytics-tabs .ant-tabs-tabpane-active .ant-table-row').count()) > 0, '线上题目分析有数据')
check((await page.locator('.rate-bar').count()) > 0, '线上进度条渲染')
await shot('22_live_items_dark_light')
await page.click('.analytics-tabs .ant-tabs-tab:has-text("知识点分析")')
await page.waitForTimeout(2000)
await shot('23_live_knowledge')

await page.goto(`${BASE}/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
await page.locator('.ant-table-row').first().locator('button:has-text("明细")').click()
await page.waitForTimeout(1800)
check((await page.locator('.adjust-box').count()) === 1, '线上成绩更正面板渲染')
await shot('24_live_score_drawer')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
await page.click('.ant-tabs-tab:has-text("申诉管理")')
await page.waitForTimeout(1600)
await shot('25_live_appeals')

await page.click('.app-header button[aria-label="切换主题"]')
await page.waitForTimeout(1000)
check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', '线上暗色模式可切换')
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2400)
await page.click('.analytics-tabs .ant-tabs-tab:has-text("题目分析")')
await page.waitForTimeout(1800)
await shot('26_live_dark_items')
await page.goto(`${BASE}/system/notifications`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.click('.ant-tabs-tab:has-text("发送记录")')
await page.waitForTimeout(1800)
await shot('27_live_dark_logs')

const noise = errors.filter((line) => !line.includes('Warning: [antd]'))
if (noise.length) console.log('\nBROWSER ERRORS:\n' + noise.join('\n'))
check(noise.length === 0, '线上页面控制台无报错', noise.slice(0, 4))
console.log(`\nLIVE UI ${process.exitCode ? 'FAILED' : 'PASSED'}: ${results.length} checks`)
await browser.close()
