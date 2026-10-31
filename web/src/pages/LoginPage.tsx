import { useEffect } from 'react'
import { Alert, App, Button, Form, Input } from 'antd'
import { CheckCircleFilled, LockOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { hasValidSession, useAuthStore } from '../stores/auth'
import './login.css'

interface LoginForm {
  account: string
  password: string
}

interface LoginLocationState {
  from?: { pathname?: string }
}

const capabilities = [
  '全流程闭环，考试数据统一沉淀',
  '切屏检测、抓拍与水印，严肃考试防作弊',
  '实时监考告警，异常 5 秒内到达监考台',
  '成绩统计与知识点掌握度分析',
]

export default function LoginPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const expiresAt = useAuthStore((state) => state.expiresAt)
  const setSession = useAuthStore((state) => state.setSession)

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
      setSession({ token: result.token, expiresAt: result.expires_at, user: result.user })
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
          <span className="login-brand-mark">考</span>
          <div>
            <div className="login-brand-name">在线考试系统</div>
            <div className="login-brand-en">ONLINE EXAM PLATFORM</div>
          </div>
        </div>

        <div className="login-brand-copy">
          <h2 className="login-headline">
            从组卷到成绩
            <br />
            一站式在线考试平台
          </h2>
          <p className="login-lead">
            覆盖题库、组卷、考试、监考、阅卷与数据分析，支持人脸核验与 AI
            行为检测，让每一场考试稳定、可信、可追溯。
          </p>

          <ul className="login-feature-list">
            {capabilities.map((feature) => (
              <li key={feature}>
                <CheckCircleFilled />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="login-trust">数据加密存储 · 人脸信息单独授权 · 支持人工核验替代</div>
        </div>

        <div className="login-brand-footer">© 2026 在线考试系统</div>
      </aside>

      <main className="login-panel">
        <div className="login-form-card">
          <div className="login-panel-brand">
            <span className="login-panel-mark">考</span>
            <span>在线考试系统</span>
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
