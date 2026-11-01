-- External notification channels: sms/email rows live in the same ledger as
-- in-app ones, so the dedupe key gains the channel. delivery_detail records
-- gateway errors or the simulated path. Seed disabled sms/email templates so
-- organisations can flip channels on in the UI without re-seeding.

DROP INDEX IF EXISTS ux_notifications_source;
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_source
    ON notifications (user_id, source_type, source_id, channel)
    WHERE source_type <> '';

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS delivery_detail text NOT NULL DEFAULT '';

INSERT INTO notification_templates (org_id, channel, code, title_tpl, content_tpl, enabled)
SELECT o.id, seed.channel, seed.code, seed.title_tpl, seed.content_tpl, FALSE
FROM organizations o
CROSS JOIN (VALUES
    ('email', 'exam_publish', '考试发布：{exam}', '考试时间 {start_at} 至 {end_at}，限时 {duration} 分钟，请按时参加。'),
    ('email', 'score_publish', '成绩发布', '《{exam}》成绩已公布，得分 {total} 分。'),
    ('sms', 'exam_publish', '考试发布：{exam}', '{start_at} 至 {end_at} 开考，限时 {duration} 分钟，请准时。'),
    ('sms', 'score_publish', '成绩发布', '《{exam}》成绩已公布：{total} 分。')
) AS seed(channel, code, title_tpl, content_tpl)
ON CONFLICT (org_id, code, channel) DO NOTHING;
