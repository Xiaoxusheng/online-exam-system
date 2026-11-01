-- 0007 seeded templates only for organisations that already existed when it ran. On a
-- fresh install the migration runs before `cmd/seed` creates the organisation, so such
-- deployments ended up with no notification templates at all. Backfill every organisation
-- that is missing them; ON CONFLICT keeps re-runs and existing customisations untouched.

INSERT INTO notification_templates (org_id, channel, code, title_tpl, content_tpl, enabled)
SELECT o.id, 'inapp', seed.code, seed.title_tpl, seed.content_tpl, TRUE
FROM organizations o
CROSS JOIN (VALUES
    ('exam_publish', '考试发布：{exam}', '考试时间 {start_at} 至 {end_at}，限时 {duration} 分钟，请按时参加。'),
    ('score_publish', '成绩发布', '《{exam}》成绩已公布，得分 {total} 分。'),
    ('score_adjust', '成绩更正', '成绩已更正：当前 {total} 分（原 {before} 分）。如有疑问可在“我的成绩”提交申诉。'),
    ('score_appeal', '成绩申诉结果', '成绩申诉{verdict}：{note}。当前得分 {total} 分。'),
    ('review_pending', '有新的阅卷任务', '《{exam}》有 {count} 份答卷等待批阅，请尽快处理。')
) AS seed(code, title_tpl, content_tpl)
ON CONFLICT (org_id, code, channel) DO NOTHING;
