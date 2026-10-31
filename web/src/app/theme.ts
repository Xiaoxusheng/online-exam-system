import type { ThemeConfig } from 'antd'

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#3370FF',
    colorInfo: '#3370FF',
    colorLink: '#3370FF',
    colorSuccess: '#12B76A',
    colorWarning: '#F79009',
    colorError: '#F04438',
    colorTextBase: '#1F2329',
    colorTextSecondary: '#646A73',
    colorBgLayout: '#F5F7FA',
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 36,
    fontSize: 14,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    boxShadowSecondary: '0 12px 32px rgba(31, 35, 41, 0.10)',
  },
  components: {
    Layout: {
      siderBg: '#FFFFFF',
      headerBg: '#FFFFFF',
      bodyBg: '#F5F7FA',
      headerHeight: 64,
      headerPadding: '0 24px',
    },
    Menu: {
      itemBorderRadius: 8,
      itemHeight: 40,
      itemMarginInline: 8,
      itemMarginBlock: 2,
      itemSelectedBg: '#EAF1FF',
      itemSelectedColor: '#3370FF',
      itemColor: '#4E5969',
      itemHoverBg: '#F5F7FA',
      subMenuItemBg: 'transparent',
      iconSize: 16,
    },
    Card: {
      borderRadiusLG: 12,
      paddingLG: 20,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: '0 4px 10px rgba(51, 112, 255, 0.20)',
    },
    Table: {
      headerBg: '#F7F8FA',
      headerColor: '#646A73',
      rowHoverBg: '#F7FAFF',
    },
    Tag: {
      borderRadiusSM: 6,
    },
  },
}
