import type { ThemeConfig } from 'antd'

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#3370FF',
    colorInfo: '#3370FF',
    colorLink: '#3370FF',
    colorSuccess: '#12B76A',
    colorWarning: '#F79009',
    colorError: '#F04438',
    colorTextBase: '#101828',
    colorTextSecondary: '#475467',
    colorTextTertiary: '#98A2B3',
    colorBorder: '#E4E9F0',
    colorBorderSecondary: '#EEF1F5',
    colorBgLayout: '#F6F7F9',
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 36,
    fontSize: 14,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
    boxShadowSecondary: '0 12px 32px rgba(16, 24, 40, 0.12)',
  },
  components: {
    Layout: {
      siderBg: '#FFFFFF',
      headerBg: '#FFFFFF',
      bodyBg: '#F6F7F9',
      headerHeight: 60,
      headerPadding: '0 24px',
    },
    Menu: {
      itemBorderRadius: 8,
      itemHeight: 38,
      itemMarginInline: 10,
      itemMarginBlock: 2,
      itemSelectedBg: '#EDF3FF',
      itemSelectedColor: '#245BDB',
      itemColor: '#475467',
      itemHoverBg: '#F3F5F8',
      subMenuItemBg: 'transparent',
      iconSize: 16,
    },
    Card: {
      borderRadiusLG: 12,
      paddingLG: 20,
    },
    Button: {
      fontWeight: 500,
      borderRadius: 8,
      controlHeight: 36,
      primaryShadow: 'none',
    },
    Input: {
      borderRadius: 8,
      controlHeight: 36,
    },
    Table: {
      headerBg: '#F9FAFB',
      headerColor: '#475467',
      rowHoverBg: '#F7FAFF',
      borderColor: '#EEF1F5',
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Dropdown: {
      borderRadiusLG: 12,
    },
    Popover: {
      borderRadiusLG: 12,
    },
  },
}
