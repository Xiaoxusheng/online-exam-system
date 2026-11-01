// 安静型卡片 / iOS 开关 / 分区折叠 / 运行记录 实机验收：截图 + 样式断言 + 控制台报错收集。
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5176'
const ACCOUNT = process.env.SHOT_USER ?? 'admin'
const PASSWORD = process.env.SHOT_PASS ?? 'Admin@123456'
const OUT = 'D:/explame/online-exam-system/_diag/ui_shots_quiet'
mkdirSync(OUT, { recursive: true })

const errors = []
const asserts = []
function assert(name, ok, detail = '') {
  asserts.push(`${ok ? 'PASS' : 'FAIL'} - ${name}${detail ? ` (${detail})` : ''}`)
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

// 登录
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.fill('input[placeholder="用户名或手机号"]', ACCOUNT)
await page.fill('input[placeholder="请输入密码"]', PASSWORD)
await page.click('.login-form button[type="submit"]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
await page.waitForTimeout(1800)

// 1) 工作台：安静型卡片断言
{
  const card = page.locator('.panel-card.ant-card').first()
  await card.waitFor()
  const padding = await card.evaluate((el) => getComputedStyle(el.querySelector('.ant-card-body') ?? el).padding)
  assert('panel-card body padding 16 18 18', padding === '16px 18px 18px', padding)
  const label = await page.locator('.stat-card-label').first().evaluate((el) => getComputedStyle(el).color)
  assert('stat-card-label 用三级灰', label === 'rgb(139, 148, 171)', label)
  await shot('01_dashboard')
}

// 2) 审计日志：运行记录时间线混合
{
  await page.goto(`${BASE}/system/audit-logs`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1600)
  const dot = page.locator('.runlog-cell .runlog-dot').first()
  const hasDot = (await dot.count()) > 0
  assert('审计日志行首状态点', hasDot)
  if (hasDot) {
    const bg = await dot.evaluate((el) => getComputedStyle(el).borderRadius)
    assert('状态点为圆形', bg === '50%', bg)
    const cell = await page.locator('.runlog-cell').first().evaluate((el) => getComputedStyle(el).display)
    assert('runlog-cell 为 flex', cell === 'flex', cell)
  }
  await shot('02_audit_logs')
}

// 3) 通知配置：iOS 开关 + 发送记录状态点
{
  await page.goto(`${BASE}/system/notifications`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const sw = page.locator('.ant-switch').first()
  if ((await sw.count()) > 0) {
    const w = await sw.evaluate((el) => getComputedStyle(el).width)
    const h = await sw.evaluate((el) => getComputedStyle(el).height)
    const radius = await sw.evaluate((el) => getComputedStyle(el).borderRadius)
    // 模板表格里是 small 开关（32×18）；默认开关的 40×22 在考试抽屉段断言
    assert('iOS 开关（small）宽 32px', w === '32px', w)
    assert('iOS 开关（small）高 18px', h === '18px', h)
    assert('iOS 开关胶囊圆角', radius === '999px', radius)
    const checked = page.locator('.ant-switch.ant-switch-checked').first()
    if ((await checked.count()) > 0) {
      const bg = await checked.evaluate((el) => getComputedStyle(el).backgroundColor)
      assert('开启态为玉青绿', bg === 'rgb(22, 163, 74)', bg)
    }
  }
  // 发送记录页签
  await page.getByRole('tab', { name: '发送记录' }).click()
  await page.waitForTimeout(1400)
  assert('发送记录状态点', (await page.locator('.runlog-cell .runlog-dot').count()) > 0)
  await shot('03_notification_logs')
}

// 4) 考试创建抽屉：分区折叠
{
  await page.goto(`${BASE}/exams`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1600)
  await page.getByRole('button', { name: /创建考试|新建考试/ }).first().click()
  await page.waitForTimeout(900)
  const fold = page.locator('.section-fold.ant-collapse')
  assert('创建抽屉含分区折叠', (await fold.count()) > 0)
  if ((await fold.count()) > 0) {
    const headers = await fold.locator('.ant-collapse-header').allTextContents()
    assert('含「成绩与阅卷」分区', headers.some((t) => t.includes('成绩与阅卷')), headers.join(' | '))
    assert('含「考生编排」分区', headers.some((t) => t.includes('考生编排')))
    // 展开态内容可见
    assert('成绩与阅卷默认展开', (await page.locator('.section-fold .ant-collapse-content-active').count()) > 0)
    // 开关为 iOS 式
    const sw = page.locator('.drawer-body .ant-switch, .ant-drawer .ant-switch').first()
    if ((await sw.count()) > 0) {
      const w = await sw.evaluate((el) => getComputedStyle(el).width)
      assert('抽屉内开关宽 40px', w === '40px', w)
    }
    // 收起再展开不报错
    await fold.locator('.ant-collapse-header').first().click()
    await page.waitForTimeout(400)
    await fold.locator('.ant-collapse-header').first().click()
    await page.waitForTimeout(400)
    // 关闭抽屉再进入暗色抽查
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
  }
  await shot('04_exam_create_drawer')
}

// 5) 暗色抽查
{
  await page.click('.app-header button[aria-label="切换主题"]')
  await page.goto(`${BASE}/system/audit-logs`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await shot('05_audit_dark')
  await page.click('.app-header button[aria-label="切换主题"]')
}

console.log('\n' + asserts.join('\n'))
console.log(`\nasserts: ${asserts.filter((a) => a.startsWith('PASS')).length}/${asserts.length} passed`)
console.log(`console errors: ${errors.length}`)
if (errors.length) console.log(errors.join('\n'))
await browser.close()
process.exit(asserts.some((a) => a.startsWith('FAIL')) || errors.length ? 1 : 0)
