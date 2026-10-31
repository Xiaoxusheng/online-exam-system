import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Avatar,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Popover,
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
import { fetchMe, logout } from '../api/auth'
import EmptyState from '../components/EmptyState'
import { queryClient } from './queryClient'
import { useAuthStore } from '../stores/auth'
import { roleLabel } from '../utils/labels'
import { findNavTrail, navigation, pageTitle } from './navigation'

const { Header, Sider, Content } = Layout

export default function AppLayout() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const isMobile = screens.lg === false

  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const user = useAuthStore((state) => state.user)
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

  useEffect(() => {
    document.title = `${pageTitle(location.pathname)} · 在线考试系统`
  }, [location.pathname])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      navigation.map((group) => ({
        type: 'group' as const,
        key: group.key,
        label: group.label,
        children: group.items.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
        })),
      })),
    [],
  )

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('/')) {
      navigate(key)
    }
  }

  const handleUserMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (key !== 'logout') return
    try {
      await logout()
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

  const trail = findNavTrail(location.pathname)
  const breadcrumbItems =
    location.pathname === '/'
      ? [{ title: '工作台' }]
      : trail
        ? [{ title: '工作台' }, { title: trail.group.label }, { title: trail.item.label }]
        : [{ title: '工作台' }]

  const brand = (
    <div className={collapsed ? 'app-brand app-brand-collapsed' : 'app-brand'}>
      <span className="app-brand-mark">考</span>
      {!collapsed && (
        <div className="app-brand-text">
          <div className="app-brand-name">在线考试系统</div>
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

  const notifications = (
    <div className="notice-popover">
      <div className="notice-head">
        <div>
          <div className="notice-title">通知中心</div>
          <div className="notice-sub">考试提醒、阅卷任务与成绩发布</div>
        </div>
      </div>
      <EmptyState
        compact
        icon={<BellOutlined />}
        title="暂无新通知"
        description="有新的考试安排或阅卷任务时，会在这里提醒你。"
      />
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
              <span className="sider-version">v0.4</span>
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
            <Popover
              content={notifications}
              trigger="click"
              placement="bottomRight"
              arrow={false}
              rootClassName="notice-popover-root"
            >
              <Button
                type="text"
                className="header-icon-btn"
                aria-label="通知中心"
                icon={<BellOutlined />}
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
          <div className="content-inner" key={location.pathname}>
            <Outlet />
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
            <span className="sider-version">v0.4</span>
          </div>
        </Drawer>
      )}
    </Layout>
  )
}
