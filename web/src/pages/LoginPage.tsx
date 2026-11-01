import { useEffect } from 'react'
import { Alert, App, Button, Form, Input } from 'antd'
import { CheckCircleFilled, LockOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { getBranding } from '../api/system'
import { hasValidSession, useAuthStore } from '../stores/auth'
import { queryKeys } from '../api/queryKeys'
import './login.css'

interface LoginForm {
  account: string
  password: string
}

interface LoginLocationState {
  from?: { pathname?: string }
}

const capabilities = [
  '全流程闭环：题库、组卷、编排、作答、阅卷、成绩',
  '双评与仲裁率差自动流转，评分全程留痕',
  '实时监考事件与处置，异常秒级到达监考台',
  '逐题诊断、知识点掌握度与成绩更正申诉',
]

/** Brand block shared by both panels; falls back to the built-in identity. */
function useBranding() {
  const query = useQuery({
    queryKey: queryKeys.branding,
    queryFn: getBranding,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const data = query.data
  return {
    name: data?.name || '在线考试系统',
    slogan: data?.slogan || '稳定 · 可信 · 可追溯',
    logoUrl: data?.logo_url ?? null,
  }
}

export default function LoginPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const expiresAt = useAuthStore((state) => state.expiresAt)
  const setSession = useAuthStore((state) => state.setSession)
  const branding = useBranding()

  const state = location.state as LoginLocationState | null
  const redirectTarget =
    state?.from?.pathname && state.from.pathname !== '/login' ? state.from.pathname : '/'

  useEffect(() => {
    if (hasValidSession(token, expiresAt)) {
      navigate(redirectTarget, { replace: true })
    }
  }, [token, expiresAt, navigate, redirectTarget])

  const mutation = useMutation({
    mutationFn: (values: LoginForm) => login(values.account.trim(), values.password),
    onSuccess: (result) => {
      setSession({
        token: result.token,
        expiresAt: result.expires_at,
        refreshToken: result.refresh_token,
        refreshExpiresAt: result.refresh_expires_at,
        user: result.user,
      })
      message.success(`欢迎回来，${result.user.name}`)
      navigate(redirectTarget, { replace: true })
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : '登录失败，请稍后重试')
    },
  })

  return (
    <div className="login-page">
      <aside className="login-brand">
        <div className="login-brand-top">
          {branding.logoUrl ? (
            <img className="login-brand-logo" src={branding.logoUrl} alt={branding.name} />
          ) : (
            <span className="login-brand-mark">考</span>
          )}
          <div>
            <div className="login-brand-name">{branding.name}</div>
            <div className="login-brand-en">ONLINE EXAM PLATFORM</div>
          </div>
        </div>

        <div className="login-brand-copy">
          <span className="login-eyebrow">{branding.slogan}</span>
          <h2 className="login-headline">
            从组卷到成绩
            <br />
            一站式<em>在线考试平台</em>
          </h2>
          <p className="login-lead">
            覆盖题库、组卷、考试、监考、阅卷与数据分析，把每一场考试的过程与结果沉淀成可复用的教学资产。
          </p>

          <ul className="login-feature-list">
            {capabilities.map((feature) => (
              <li key={feature}>
                <CheckCircleFilled />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="login-preview" aria-hidden="true">
            <div className="login-preview-head">
              <span className="login-preview-dots">
                <span />
                <span />
                <span />
              </span>
              数据分析 · 逐题诊断
            </div>
            <div className="login-preview-body">
              <div className="login-preview-stat">
                <span className="login-preview-bar" />
                <span className="login-preview-label" />
              </div>
              <div className="login-preview-stat">
                <span className="login-preview-bar" />
                <span className="login-preview-label" />
              </div>
              <div className="login-preview-stat">
                <span className="login-preview-bar" />
                <span className="login-preview-label" />
              </div>
              <div className="login-preview-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>

          <div className="login-trust">数据加密存储 · 全链路审计 · 按角色与数据范围授权</div>
        </div>

        <div className="login-brand-footer">© 2026 {branding.name}</div>
      </aside>

      <main className="login-panel">
        <div className="login-form-card">
          <div className="login-panel-brand">
            {branding.logoUrl ? (
              <img className="login-brand-logo" src={branding.logoUrl} alt={branding.name} />
            ) : (
              <span className="login-panel-mark">考</span>
            )}
            <span>{branding.name}</span>
          </div>

          <h1 className="login-title">欢迎回来</h1>
          <p className="login-subtitle">登录以进入考试管理工作台</p>

          <Form<LoginForm>
            layout="vertical"
            requiredMark={false}
            size="large"
            className="login-form"
            onFinish={(values) => mutation.mutate(values)}
          >
            <Form.Item
              label="账号"
              name="account"
              rules={[{ required: true, message: '请输入账号或手机号' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#98A2B3' }} />}
                placeholder="用户名或手机号"
                autoComplete="username"
                autoFocus
              />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#98A2B3' }} />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              className="login-submit"
              loading={mutation.isPending}
            >
              登录
            </Button>
          </Form>

          {import.meta.env.DEV && (
            <Alert
              className="login-demo"
              type="info"
              showIcon
              message="开发环境默认账号：admin / Admin@123456"
            />
          )}

          <div className="login-hint">账号由机构管理员统一创建，如无法登录请联系管理员</div>
        </div>
      </main>
    </div>
  )
}
