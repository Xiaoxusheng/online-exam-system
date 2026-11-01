import '@ant-design/v5-patch-for-react-19'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'antd/dist/reset.css'
import './styles/global.css'
import './styles/design-v2.css'
import AppRoutes from './app/routes'
import { queryClient } from './app/queryClient'
import { darkTheme, theme } from './app/theme'
import { useThemeMode } from './app/useThemeMode'

dayjs.locale('zh-cn')

function ThemedApp() {
  const mode = useThemeMode((state) => state.mode)
  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])
  return (
    <ConfigProvider locale={zhCN} theme={mode === 'dark' ? darkTheme : theme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>,
)
