// Measure horizontal alignment of the Switch column in the notification
// templates table (and any other switch-bearing table) on the live site.
import { chromium } from 'playwright-core'

const BASE = process.env.SHOT_BASE || 'http://118.25.50.65'
const ADMIN = process.env.ADMIN_ACCOUNT || 'admin'
const PASS = process.env.ADMIN_PASS || 'Exam@ybkrdo3zQr'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('用户名或手机号').fill(ADMIN)
await page.getByPlaceholder('请输入密码').fill(PASS)
await page.locator('.login-submit').click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

await page.goto(`${BASE}/system/notifications`, { waitUntil: 'networkidle' })
await page.waitForSelector('.ant-switch', { timeout: 10000 })

const report = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ant-table-tbody .ant-switch')]
  const headerCells = [...document.querySelectorAll('.ant-table-thead th')]
  const enabledHeader = headerCells.find((th) => th.textContent?.trim() === '启用')
  return {
    dpr: window.devicePixelRatio,
    count: rows.length,
    switches: rows.map((sw) => {
      const rect = sw.getBoundingClientRect()
      const style = getComputedStyle(sw)
      return {
        checked: sw.classList.contains('ant-switch-checked'),
        x: Math.round(rect.x * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        minWidth: style.minWidth,
        background: style.backgroundColor,
        border: style.border,
      }
    }),
    enabledHeaderX: enabledHeader ? Math.round(enabledHeader.getBoundingClientRect().x * 100) / 100 : null,
  }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()
