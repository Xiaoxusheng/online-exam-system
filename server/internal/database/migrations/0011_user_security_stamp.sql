-- Every token carries its issue time; users.security_stamp records the moment the
-- account's security posture last changed (role, data scope, password, status, logout).
-- A token issued before the stamp is rejected, so those changes take effect immediately
-- instead of at the 8h access-token expiry.
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_stamp timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN users.security_stamp IS '访问令牌签发时间早于此值即失效；改角色/数据范围/密码、停用、登出时更新';
