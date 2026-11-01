// v2.1 补充覆盖：导入弹窗、404、考生端页面。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5175'
const API = process.env.SHOT_API ?? 'http://127.0.0.1:8081'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v21'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
page.setDefaultTimeout(25_000)
page.on('pageerror', (e) => errors.push(`pageerror: ${e?.message ?? e}`))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text().slice(0, 160)}`) })

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`shot - ${name}`)
}
async function signIn(account, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或手机号"]', account)
  await page.fill('input[placeholder="请输入密码"]', password)
  await page.click('.login-form button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  await page.waitForTimeout(1200)
}

// admin：导入弹窗 + 404
await signIn('admin', 'Admin@123456')
await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await page.click('button:has-text("批量导入")')
await page.waitForTimeout(900)
await shot('20_import_dialog')
await page.keyboard.press('Escape')
await page.goto(`${BASE}/no-such-page`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await shot('21_not_found')

// 考生端
const token = useToken()
function useToken() { return null }
const resp = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'Admin@123456' }),
})
const adminToken = (await resp.json()).data.token
const dir = await fetch(`${API}/api/v1/users?role=student&page_size=100`, {
  headers: { Authorization: `Bearer ${adminToken}` },
})
const students = (await dir.json()).data
const e2e = students.find((u) => /^e2e_student_\d+$/.test(u.username)) ?? students[0]
console.log(`student account: ${e2e?.username}`)
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await signIn(e2e.username, 'Student@123456')
await page.goto(`${BASE}/my/exams`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await shot('22_student_exams')
await page.goto(`${BASE}/my/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await shot('23_student_scores')
await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await shot('24_student_notifications')

console.log(`console errors: ${errors.length}`)
if (errors.length) console.log(errors.join('\n'))
await browser.close()
