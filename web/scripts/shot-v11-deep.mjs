// v1.1 深度快照：考生端、浮层、监考、404、暗色登录。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5174'
const API = 'http://127.0.0.1:8081/api/v1'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v7'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(25_000)
page.on('pageerror', (e) => errors.push(`pageerror: ${e?.message ?? e}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console: ${m.text().slice(0, 160)}`)
})

async function signIn(account, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或手机号"]', account)
  await page.fill('input[placeholder="请输入密码"]', password)
  await page.click('.login-form button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  await page.waitForTimeout(1200)
}

// ---------- 管理端浮层与页面 ----------
await signIn('admin', 'Admin@123456')

await page.goto(`${BASE}/proctor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/20_proctor.png`, fullPage: true })

await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.locator('.ant-table-row').first().locator('button:has-text("编辑")').click()
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/21_question_drawer.png`, fullPage: true })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

await page.goto(`${BASE}/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.locator('.ant-table-row').first().locator('button:has-text("明细")').click()
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/22_score_drawer.png`, fullPage: true })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

await page.goto(`${BASE}/definitely-not-a-route`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/23_notfound.png`, fullPage: true })

// 暗色登录
await page.evaluate(() => localStorage.setItem('online-exam.theme', JSON.stringify({ state: { mode: 'dark' }, version: 0 })))
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.removeItem('online-exam.auth'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/24_dark_login.png`, fullPage: true })

// ---------- 考生端 ----------
const adminSession = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'Admin@123456' }),
}).then((r) => r.json())
const auth = { Authorization: `Bearer ${adminSession.data.token}` }
const directory = await fetch(`${API}/users?role=student&page_size=100`, { headers: auth }).then((r) => r.json())
const student = directory.data.find((u) => /^e2e_student_\d+$/.test(u.username)) ?? directory.data[0]
const scores = await fetch(`${API}/scores?page_size=5&keyword=${encodeURIComponent(student.username)}`, { headers: auth }).then((r) => r.json())
const attemptId = scores.data?.[0]?.attempt_id

await page.evaluate(() => localStorage.removeItem('online-exam.theme'))
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await signIn(student.username, 'Student@123456')
await page.goto(`${BASE}/my/exams`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.screenshot({ path: `${OUT}/25_my_exams.png`, fullPage: true })

await page.goto(`${BASE}/my/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.screenshot({ path: `${OUT}/26_my_scores.png`, fullPage: true })

if (attemptId) {
  await page.goto(`${BASE}/attempts/${attemptId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/27_attempt.png`, fullPage: true })
}

// 移动端考生端
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/my/exams`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/28_mobile_my_exams.png`, fullPage: true })

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors')
await browser.close()
