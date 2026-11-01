import { Suspense, useEffect, useMemo, useState } from 'react'
import {
  App,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  List,
  Menu,
  Popover,
  Spin,
  Tabs,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  BellOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { fetchMe, logout } from '../api/auth'
import { getBranding } from '../api/system'
import { listNotifications, markNotificationRead } from '../api/notification'
import { queryKeys } from '../api/queryKeys'
import EmptyState from '../components/EmptyState'
import { queryClient } from './queryClient'
import { canAccess, visibleNavigation } from './permissions'
import { useAuthStore } from '../stores/auth'
import { useThemeMode } from './useThemeMode'
import { roleLabel } from '../utils/labels'
import { findNavTrail, pageTitle } from './navigation'
import { MoonOutlined, SunOutlined } from '@ant-design/icons'

const { Header, Sider, Content } = Layout

export default function AppLayout() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const isMobile = screens.lg === false

  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tabs, setTabs] = useState<{ path: string; label: string }[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('online-exam.tabs') ?? '[]')
      return Array.isArray(saved) ? saved.slice(-8) : []
    } catch {
      return []
    }
  })

  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const themeMode = useThemeMode((state) => state.mode)
  const toggleTheme = useThemeMode((state) => state.toggle)
  const setUser = useAuthStore((state) => state.setUser)
  const clear = useAuthStore((state) => state.clear)

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((current) => {
        if (!cancelled) setUser(current)
      })
      .catch(() => {
        // 401 clears the session in the API client; RequireAuth then redirects.
      })
    return () => {
      cancelled = true
    }
  }, [setUser])

  const role = user?.role
  const allowedHere = canAccess(role, location.pathname)
  // 切换账号后可能残留上一个角色的页签，渲染前按当前角色过滤掉无权访问的。
  const visibleTabs = useMemo(() => tabs.filter((tab) => canAccess(role, tab.path)), [tabs, role])

  const isAttemptRoute = location.pathname.startsWith('/attempts/')

  useEffect(() => {
    const title = !allowedHere ? '无访问权限' : isAttemptRoute ? '作答' : pageTitle(location.pathname)
    document.title = `${title} · 在线考试系统`
  }, [location.pathname, allowedHere, isAttemptRoute])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // 页签工作区：记录打开过的页面，像参考图那样可切换、可关闭。
  useEffect(() => {
    const label = pageTitle(location.pathname)
    if (label === '页面不存在') return
    setTabs((current) => {
      const next = current.some((tab) => tab.path === location.pathname)
        ? current
        : [...current, { path: location.pathname, label }].slice(-8)
      sessionStorage.setItem('online-exam.tabs', JSON.stringify(next))
      return next
    })
  }, [location.pathname])

  function closeTab(path: string) {
    setTabs((current) => {
      const next = current.filter((tab) => tab.path !== path)
      sessionStorage.setItem('online-exam.tabs', JSON.stringify(next))
      return next
    })
    if (path === location.pathname) {
      const rest = tabs.filter((tab) => tab.path !== path)
      navigate(rest.length > 0 ? rest[rest.length - 1].path : '/')
    }
  }

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      visibleNavigation(role).map((group) => ({
        type: 'group' as const,
        key: group.key,
        label: group.label,
        children: group.items.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
        })),
      })),
    [role],
  )

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications({ page: 1, page_size: 6 }),
    queryFn: () => listNotifications(1, 6),
    enabled: Boolean(token),
  })
  const notices = notificationsQuery.data?.items ?? []
  const hasUnread = notices.some((item) => item.status !== 'read')

  const brandingQuery = useQuery({
    queryKey: queryKeys.branding,
    queryFn: getBranding,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const branding = {
    name: brandingQuery.data?.name || '在线考试系统',
    logoUrl: brandingQuery.data?.logo_url ?? null,
  }

  async function handleReadNotice(id: string) {
    try {
      await markNotificationRead(id)
      await notificationsQuery.refetch()
    } catch {
      message.error('标记已读失败，请稍后重试')
    }
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('/')) {
      navigate(key)
    }
  }

  const handleUserMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (key !== 'logout') return
    try {
      await logout(useAuthStore.getState().refreshToken ?? undefined)
    } catch {
      // Logout is best effort; the local session is cleared regardless.
    }
    clear()
    queryClient.clear()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'identity',
      disabled: true,
      label: (
        <div className="user-menu-identity">
          <div className="user-menu-name">{user?.name ?? '未登录'}</div>
          <div className="user-menu-role">{roleLabel(user?.role)}</div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
  ]

  const trail = isAttemptRoute ? { group: { label: '我的考试' }, item: { label: '作答' } } : findNavTrail(location.pathname)
  const breadcrumbItems =
    allowedHere && location.pathname !== '/' && trail
      ? [{ title: trail.group.label }, { title: trail.item.label }]
      : [{ title: '工作台' }]

  const brand = (
    <div className={collapsed ? 'app-brand app-brand-collapsed' : 'app-brand'}>
      {branding.logoUrl ? (
        <img className="app-brand-logo" src={branding.logoUrl} alt={branding.name} />
      ) : (
        <span className="app-brand-mark">考</span>
      )}
      {!collapsed && (
        <div className="app-brand-text">
          <div className="app-brand-name">{branding.name}</div>
          <div className="app-brand-sub">Online Exam Platform</div>
        </div>
      )}
    </div>
  )

  const menu = (
    <Menu
      className="app-menu"
      mode="inline"
      items={menuItems}
      selectedKeys={[location.pathname]}
      onClick={handleMenuClick}
    />
  )

  const notificationPanel = (
    <div className="notice-popover">
      <div className="notice-head">
        <div>
          <div className="notice-title">通知中心</div>
          <div className="notice-sub">考试提醒、阅卷任务与成绩发布</div>
        </div>
      </div>
      {notificationsQuery.isPending ? (
        <div className="notice-loading">
          <Spin size="small" />
        </div>
      ) : notificationsQuery.isError ? (
        <EmptyState
          compact
          icon={<BellOutlined />}
          title="通知加载失败"
          description="请稍后重试，或下拉刷新页面。"
        />
      ) : notices.length === 0 ? (
        <EmptyState
          compact
          icon={<BellOutlined />}
          title="暂无通知"
          description="有新的考试安排或成绩发布时，会在这里提醒你。"
        />
      ) : (
        <List
          className="notice-list"
          dataSource={notices}
          renderItem={(item) => (
            <List.Item className={item.status !== 'read' ? 'notice-item notice-unread' : 'notice-item'}>
              <button type="button" className="notice-item-main" onClick={() => handleReadNotice(item.id)}>
                <span className="notice-item-title">{item.title}</span>
                <span className="notice-item-desc">{item.content}</span>
                <span className="notice-item-time">{dayjs(item.created_at).format('MM-DD HH:mm')}</span>
              </button>
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Layout className="app-shell">
      {!isMobile && (
        <Sider
          className="app-sider"
          theme="light"
          width={248}
          collapsedWidth={76}
          collapsible
          collapsed={collapsed}
          trigger={null}
        >
          {brand}
          {menu}
          {!collapsed && (
            <div className="app-sider-footer">
              <span className="sider-version">v2.1</span>
              <span className="sider-status">服务正常</span>
            </div>
          )}
        </Sider>
      )}

      <Layout className="app-main">
        <Header className="app-header">
          <div className="header-left">
            <Button
              type="text"
              className="header-icon-btn"
              aria-label="切换导航"
              icon={isMobile || collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() =>
                isMobile ? setDrawerOpen(true) : setCollapsed((value) => !value)
              }
            />
            <Breadcrumb items={breadcrumbItems} />
          </div>

          <div className="header-actions">
            <Button
              type="text"
              className="header-icon-btn"
              aria-label="切换主题"
              icon={themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
            />
            <Popover
              content={notificationPanel}
              trigger="click"
              placement="bottomRight"
              arrow={false}
              rootClassName="notice-popover-root"
            >
              <Button
                type="text"
                className="header-icon-btn"
                aria-label="通知中心"
                icon={
                  <Badge dot={hasUnread} offset={[-2, 2]}>
                    <BellOutlined />
                  </Badge>
                }
              />
            </Popover>

            <span className="header-divider" />

            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
              <div className="user-chip">
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  className="user-avatar"
                />
                <div className="user-chip-meta">
                  <span className="user-chip-name">{user?.name ?? '未登录'}</span>
                  <span className="user-chip-role">{roleLabel(user?.role)}</span>
                </div>
                <DownOutlined className="user-chip-caret" />
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-content">
          <div className="content-shell">
            <Tabs
              className="work-tabs"
              type="card"
              hideAdd
              size="small"
              activeKey={visibleTabs.some((tab) => tab.path === location.pathname) ? location.pathname : undefined}
              onChange={(key) => navigate(key)}
              onEdit={(key, action) => {
                if (action === 'remove') closeTab(String(key))
              }}
              items={visibleTabs.map((tab) => ({
                key: tab.path,
                label: tab.label,
                closable: tab.path !== '/',
              }))}
            />

            <div className="content-inner" key={location.pathname}>
              <Suspense
                fallback={
                  <div className="route-loading">
                    <Spin />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </div>
          </div>
        </Content>
      </Layout>

      {isMobile && (
        <Drawer
          placement="left"
          width={264}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
        >
          {brand}
          {menu}
          <div className="app-sider-footer">
              <span className="sider-version">v2.1</span>
              <span className="sider-status">服务正常</span>
            </div>
        </Drawer>
      )}
    </Layout>
  )
}
