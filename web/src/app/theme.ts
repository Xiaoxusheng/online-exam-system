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
    colorBorder: '#E7ECF3',
    colorBorderSecondary: '#EEF2F7',
    colorBgLayout: '#F6F8FC',
    borderRadius: 10,
    borderRadiusLG: 16,
    controlHeight: 38,
    fontSize: 14,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 10px 28px rgba(16, 24, 40, 0.06)',
    boxShadowSecondary: '0 18px 44px rgba(16, 24, 40, 0.12)',
  },
  components: {
    Layout: {
      siderBg: '#FBFCFE',
      headerBg: 'rgba(255, 255, 255, 0.86)',
      bodyBg: '#F6F8FC',
      headerHeight: 68,
      headerPadding: '0 32px',
    },
    Menu: {
      itemBorderRadius: 10,
      itemHeight: 40,
      itemMarginInline: 12,
      itemMarginBlock: 2,
      itemSelectedBg: '#EDF3FF',
      itemSelectedColor: '#245BDB',
      itemColor: '#475467',
      itemHoverBg: '#F3F6FB',
      subMenuItemBg: 'transparent',
      iconSize: 17,
    },
    Card: {
      borderRadiusLG: 16,
      paddingLG: 22,
    },
    Button: {
      fontWeight: 500,
      borderRadius: 10,
      controlHeight: 38,
      primaryShadow: '0 6px 14px rgba(51, 112, 255, 0.22)',
    },
    Input: {
      borderRadius: 10,
      controlHeight: 38,
    },
    Table: {
      headerBg: '#F7F9FC',
      headerColor: '#475467',
      rowHoverBg: '#F7FAFF',
      borderColor: '#EEF2F7',
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Dropdown: {
      borderRadiusLG: 14,
    },
    Popover: {
      borderRadiusLG: 14,
    },
    Steps: {
      dotSize: 8,
    },
  },
}
