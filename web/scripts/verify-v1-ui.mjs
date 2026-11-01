// v1.0 视觉与交互验收：真实后端 + vite dev server，逐屏截图并断言关键状态。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5174'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_v6'
mkdirSync(OUT, { recursive: true })

const results = []
const errors = []
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
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
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

async function signIn(account = 'admin', password = 'Admin@123456') {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或手机号"]', account)
  await page.fill('input[placeholder="请输入密码"]', password)
  await page.click('.login-form button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  await page.waitForTimeout(900)
}

await signIn()

// ---------------- 题库：导入弹窗 + 模板下载
await page.goto(`${BASE}/questions`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await page.click('button:has-text("批量导入")')
await page.waitForTimeout(800)
check((await page.locator('.ant-upload-drag').count()) === 1, '导入弹窗渲染拖放区')
await shot('01_import_dialog')
const downloadPromise = page.waitForEvent('download', { timeout: 20_000 })
await page.click('button:has-text("下载模板")')
const download = await downloadPromise
const path = await download.path()
const header = (await import('node:fs')).readFileSync(path).subarray(0, 2).toString('hex')
check(header === '504b', '下载的模板是合法 xlsx', { header })
check(download.suggestedFilename() === '题目导入模板.xlsx', '模板文件名正确', download.suggestedFilename())
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// ---------------- 分析：三个页签
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
await shot('02_analytics_overview')
await page.click('.analytics-tabs .ant-tabs-tab:has-text("题目分析")')
await page.waitForTimeout(1600)
const itemRows = await page.locator('.analytics-tabs .ant-tabs-tabpane-active .ant-table-row').count()
check(itemRows > 0, '题目分析有数据行', { itemRows })
check((await page.locator('.option-bars').count()) > 0, '选项分布渲染')
check((await page.locator('.rate-bar').count()) > 0, '正确率/得分率进度条渲染')
await shot('03_analytics_items')
await page.click('.analytics-tabs .ant-tabs-tab:has-text("知识点分析")')
await page.waitForTimeout(1600)
check((await page.locator('.ant-tabs-tabpane-active .ant-table-row').count()) > 0, '知识点分析有数据行')
await shot('04_analytics_knowledge')

// ---------------- 成绩：明细抽屉 + 更正 + 申诉页签
await page.goto(`${BASE}/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.locator('.ant-table-row').first().locator('button:has-text("明细")').click()
await page.waitForTimeout(1500)
check((await page.locator('.adjust-box').count()) === 1, '成绩明细提供更正面板')
await shot('05_score_detail_correction')
await page.locator('.ant-drawer .ant-table-row .ant-input-number input').first().click()
await page.keyboard.press('Control+a')
await page.keyboard.type('0')
await page.locator('.adjust-box textarea').fill('验收：演示更正原因')
await page.waitForTimeout(400)
await shot('06_score_adjust_filled')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
await page.click('.ant-tabs-tab:has-text("申诉管理")')
await page.waitForTimeout(1500)
await shot('07_appeals_tab')

// ---------------- 阅卷：连续批阅导航
await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
let opened = false
for (const tabLabel of ['待办', '已完成']) {
  const tab = page.locator(`.ant-tabs-tab:has-text("${tabLabel}")`)
  if (!(await tab.count())) continue
  await tab.first().click()
  await page.waitForTimeout(1200)
  const row = page.locator('.ant-table-row').first()
  if (await row.count()) {
    await row.locator('button').last().click()
    await page.waitForTimeout(1500)
    opened = true
    break
  }
}
check(opened, '阅卷列表存在可打开的任务')
if (opened) {
  check((await page.locator('.review-nav').count()) === 1, '阅卷抽屉显示连续批阅导航')
  const position = await page.locator('.review-nav-position').innerText()
  check(position.includes('第') && position.includes('/'), '导航显示队列位置', { position })
  const nextEnabled = await page.locator('.review-nav button:has-text("下一份")').isEnabled().catch(() => false)
  console.log(`info - 下一份可点击：${nextEnabled}`)
  await shot('08_review_drawer_nav')
  if (nextEnabled) {
    await page.locator('.review-nav button:has-text("下一份")').click()
    await page.waitForTimeout(1500)
    const after = await page.locator('.review-nav-position').innerText()
    check(after !== position, '下一份切换了任务', { position, after })
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
}

// ---------------- 通知配置：模板编辑 + 发送记录
await page.goto(`${BASE}/system/notifications`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
check((await page.locator('.ant-table-row').count()) > 0, '通知模板列表非空（默认模板已入库）')
await page.locator('.ant-table-row').first().locator('button:has-text("编辑")').click()
await page.waitForTimeout(900)
check((await page.locator('.ant-modal .ant-input').count()) > 0, '模板编辑弹窗渲染表单')
await shot('09_template_editor')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.click('.ant-tabs-tab:has-text("发送记录")')
await page.waitForTimeout(1600)
check((await page.locator('.ant-tabs-tabpane-active .ant-table-row').count()) > 0, '发送记录列出投递台账')
await shot('10_dispatch_logs')

// ---------------- 考生端：我的成绩 + 申诉弹窗（用最近一次 E2E 创建的考生账号）
const apiBase = 'http://127.0.0.1:8081/api/v1'
const adminSession = await fetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'Admin@123456' }),
}).then((res) => res.json())
const directory = await fetch(`${apiBase}/users?role=student&page_size=100`, {
  headers: { Authorization: `Bearer ${adminSession.data.token}` },
}).then((res) => res.json())
const student = directory.data.find((user) => /^e2e_student_\d+$/.test(user.username))
check(Boolean(student), '找到可复用的 E2E 考生账号', directory.data.map((user) => user.username).slice(0, 5))
if (student) {
  await page.evaluate(() => localStorage.clear())
  await signIn(student.username, 'Student@123456')
  await page.goto(`${BASE}/my/scores`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const scoreRows = await page.locator('.ant-table-row').count()
  check(scoreRows > 0, '考生端我的成绩列出已发布成绩', { scoreRows })
  await shot('13_student_scores')
  const appealButton = page.locator('button:has-text("申诉")').first()
  if (await appealButton.count()) {
    await appealButton.click()
    await page.waitForTimeout(900)
    check((await page.locator('.ant-modal .ant-form-item:has-text("申诉理由")').count()) > 0, '考生申诉弹窗渲染表单')
    await shot('14_student_appeal')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
  await page.click('.ant-tabs-tab:has-text("我的申诉")')
  await page.waitForTimeout(1200)
  await shot('15_student_appeals_tab')
  await page.evaluate(() => localStorage.clear())
}

// ---------------- 暗色模式
await signIn()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.click('.app-header button[aria-label="切换主题"]')
await page.waitForTimeout(900)
const theme = await page.evaluate(() => document.documentElement.dataset.theme)
check(theme === 'dark', '顶栏可切换到暗色模式', { theme })
await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.click('.analytics-tabs .ant-tabs-tab:has-text("题目分析")')
await page.waitForTimeout(1500)
await shot('11_dark_items')
await page.goto(`${BASE}/scores`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.locator('.ant-table-row').first().locator('button:has-text("明细")').click()
await page.waitForTimeout(1400)
await shot('12_dark_score_drawer')

const noise = errors.filter((line) => !line.includes('Warning: [antd]'))
if (noise.length) console.log('\nBROWSER ERRORS:\n' + noise.join('\n'))
check(noise.length === 0, '验收过程浏览器控制台无报错', noise.slice(0, 4))

await browser.close()
console.log(`\nUI VERIFY ${process.exitCode ? 'FAILED' : 'PASSED'}: ${results.length} checks`)
