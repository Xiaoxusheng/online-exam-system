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
  Tooltip,
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
      navigation.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
        children: item.children?.map((child) => ({
          key: child.key,
          icon: child.icon,
          label: child.label,
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
        <div style={{ padding: '2px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2329' }}>
            {user?.name ?? '未登录'}
          </div>
          <div style={{ fontSize: 12, color: '#8F959E', marginTop: 2 }}>
            {roleLabel(user?.role)}
          </div>
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
      : [{ title: '工作台' }, ...trail.map((item) => ({ title: item.label }))]

  const brand = (
    <div className="app-brand">
      <span className="app-brand-mark">考</span>
      {!collapsed && (
        <div>
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
      defaultOpenKeys={['scores-group', 'system-group']}
      onClick={handleMenuClick}
    />
  )

  return (
    <Layout className="app-shell">
      {!isMobile && (
        <Sider
          className="app-sider"
          theme="light"
          width={236}
          collapsedWidth={72}
          collapsible
          collapsed={collapsed}
          trigger={null}
        >
          {brand}
          {menu}
          {!collapsed && <div className="app-sider-footer">v0.1 · 骨架阶段</div>}
        </Sider>
      )}

      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <Button
              type="text"
              aria-label="切换导航"
              icon={
                isMobile || collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
              }
              onClick={() =>
                isMobile ? setDrawerOpen(true) : setCollapsed((value) => !value)
              }
            />
            <Breadcrumb items={breadcrumbItems} />
          </div>

          <div className="header-actions">
            <Tooltip title="通知中心">
              <Button type="text" aria-label="通知中心" icon={<BellOutlined />} />
            </Tooltip>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
              <div className="user-chip">
                <Avatar
                  size={28}
                  icon={<UserOutlined />}
                  style={{ background: '#EAF1FF', color: '#3370FF' }}
                />
                <div className="user-chip-meta">
                  <span className="user-chip-name">{user?.name ?? '未登录'}</span>
                  <span className="user-chip-role">{roleLabel(user?.role)}</span>
                </div>
                <DownOutlined style={{ fontSize: 10, color: '#8F959E' }} />
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      {isMobile && (
        <Drawer
          placement="left"
          width={248}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
        >
          {brand}
          {menu}
          <div className="app-sider-footer">v0.1 · 骨架阶段</div>
        </Drawer>
      )}
    </Layout>
  )
}
