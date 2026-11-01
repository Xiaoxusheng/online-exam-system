// 清理 draft 状态的演示考试（含编排关联），供重新创建。
const { Client } = require(process.env.PG_DIR ?? 'pg')
async function main() {
  const c = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: '', database: 'online_exam' })
  await c.connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const drafts = await q(`SELECT id, title, status FROM exams WHERE title LIKE '2026 年秋季期中考试%' AND status = 'draft'`)
  console.log('draft exams:', drafts)
  for (const d of drafts) {
    await q(`DELETE FROM exam_candidates WHERE exam_id = $1`, [d.id])
    await q(`DELETE FROM exam_proctors WHERE exam_id = $1`, [d.id])
    await q(`DELETE FROM exam_reviewers WHERE exam_id = $1`, [d.id])
    await q(`DELETE FROM exams WHERE id = $1`, [d.id])
    console.log('deleted', d.id, d.title)
  }
  const left = await q(`SELECT id, title, status FROM exams WHERE title LIKE '%期中%' OR title LIKE '%月考%' OR title LIKE '%周测%'`)
  console.log('remaining demo exams:', left)
  await c.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
