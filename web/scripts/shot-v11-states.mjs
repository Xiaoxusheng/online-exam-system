import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const BASE = 'http://127.0.0.1:5174'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v7'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
page.setDefaultTimeout(25000)
const errors = []
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text().slice(0,140)) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[placeholder="用户名或手机号"]', 'admin')
await page.fill('input[placeholder="请输入密码"]', 'Admin@123456')
await page.click('.login-form button[type="submit"]')
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
await page.waitForTimeout(1200)

// 折叠侧栏
await page.click('.app-header button[aria-label="切换导航"]')
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/30_collapsed.png`, fullPage: false })
await page.click('.app-header button[aria-label="切换导航"]')
await page.waitForTimeout(600)

// 通知面板
await page.click('.app-header button[aria-label="通知中心"]')
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/31_notice_popover.png`, fullPage: false })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 用户菜单
await page.click('.user-chip')
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/32_user_menu.png`, fullPage: false })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 暗色分析页
await page.click('.app-header button[aria-label="切换主题"]')
await page.waitForTimeout(700)
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/33_dark_analytics.png`, fullPage: true })
await page.click('.analytics-tabs .ant-tabs-tab:has-text("知识点分析")')
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/34_dark_knowledge.png`, fullPage: true })

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
