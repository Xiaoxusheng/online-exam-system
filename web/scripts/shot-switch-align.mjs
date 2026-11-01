// Screenshot the notification templates table to inspect switch alignment.
import { chromium } from 'playwright-core'

const BASE = process.env.SHOT_BASE || 'http://118.25.50.65'
const ADMIN = process.env.ADMIN_ACCOUNT || 'admin'
const PASS = process.env.ADMIN_PASS || 'Exam@ybkrdo3zQr'
const OUT = process.env.OUT || '_diag/switch-align-live.png'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('用户名或手机号').fill(ADMIN)
await page.getByPlaceholder('请输入密码').fill(PASS)
await page.locator('.login-submit').click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

await page.goto(`${BASE}/system/notifications`, { waitUntil: 'networkidle' })
await page.waitForSelector('.ant-switch', { timeout: 10000 })
await page.waitForTimeout(600)

const table = page.locator('.ant-table').first()
await table.screenshot({ path: OUT })
console.log('saved', OUT)
await browser.close()
