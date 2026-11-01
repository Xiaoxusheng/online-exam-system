import { theme as antdTheme, type ThemeConfig } from 'antd'

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

/**
 * 视觉基座：参考 server-status 的「浅色扁平控制台」风格。
 * 关键词——细边框、无重阴影、彩色指标数字、克制的品牌蓝。
 */
const baseToken: ThemeConfig['token'] = {
  colorPrimary: '#3370FF',
  colorInfo: '#3370FF',
  colorLink: '#3370FF',
  colorSuccess: '#12B76A',
  colorWarning: '#F79009',
  colorError: '#F04438',
  colorTextBase: '#0F172A',
  colorTextSecondary: '#475467',
  colorTextTertiary: '#8A94A6',
  colorBorder: '#E4E9F2',
  colorBorderSecondary: '#EDF1F7',
  colorFillAlter: '#F8FAFD',
  colorFillSecondary: '#F2F5FA',
  colorFillTertiary: '#F5F8FC',
  colorBgLayout: '#F5F7FB',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  borderRadiusXS: 4,
  controlHeight: 34,
  controlHeightSM: 28,
  controlHeightLG: 40,
  fontSize: 13.5,
  lineHeight: 1.5715,
  fontFamily,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  boxShadowSecondary: '0 16px 40px -20px rgba(15, 23, 42, 0.28)',
  boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.04)',
  wireframe: false,
}

const baseComponents: ThemeConfig['components'] = {
  Layout: {
    siderBg: '#FFFFFF',
    headerBg: '#FFFFFF',
    bodyBg: '#F5F7FB',
    headerHeight: 56,
    headerPadding: '0 20px',
  },
  Menu: {
    itemBorderRadius: 8,
    itemHeight: 36,
    itemMarginInline: 10,
    itemMarginBlock: 2,
    itemSelectedBg: '#EDF3FF',
    itemSelectedColor: '#2B5FE0',
    itemColor: '#5A6478',
    itemHoverBg: '#F5F7FA',
    itemHoverColor: '#0F172A',
    subMenuItemBg: 'transparent',
    iconSize: 15,
    activeBarWidth: 0,
    collapsedIconSize: 17,
  },
  Card: {
    borderRadiusLG: 12,
    paddingLG: 16,
    colorBorderSecondary: '#EDF1F7',
  },
  Button: {
    fontWeight: 500,
    borderRadius: 8,
    controlHeight: 34,
    primaryShadow: 'none',
    defaultShadow: 'none',
    dangerShadow: 'none',
    paddingInline: 13,
  },
  Input: {
    borderRadius: 8,
    controlHeight: 34,
    activeShadow: '0 0 0 3px rgba(51, 112, 255, 0.10)',
    hoverBorderColor: '#BFD3FF',
    activeBorderColor: '#3370FF',
  },
  InputNumber: {
    borderRadius: 8,
    controlHeight: 34,
    activeShadow: '0 0 0 3px rgba(51, 112, 255, 0.10)',
  },
  Select: {
    borderRadius: 8,
    controlHeight: 34,
    optionSelectedBg: '#EDF3FF',
    optionSelectedColor: '#2B5FE0',
  },
  DatePicker: {
    borderRadius: 8,
    controlHeight: 34,
    activeShadow: '0 0 0 3px rgba(51, 112, 255, 0.10)',
  },
  Table: {
    headerBg: '#FAFBFD',
    headerColor: '#5A6478',
    headerSplitColor: 'transparent',
    rowHoverBg: '#F7F9FC',
    borderColor: '#EDF1F7',
    cellPaddingBlock: 11,
    cellPaddingInline: 14,
    footerBg: '#FAFBFD',
    stickyScrollBarBg: '#D8DFEB',
  },
  Tabs: {
    inkBarColor: '#3370FF',
    itemSelectedColor: '#0F172A',
    itemColor: '#6B7688',
    itemHoverColor: '#0F172A',
    titleFontSize: 13.5,
    horizontalItemGutter: 26,
    horizontalItemPadding: '10px 0',
  },
  Tag: {
    borderRadiusSM: 4,
    defaultBg: '#F3F6FB',
    defaultColor: '#5A6478',
  },
  Modal: {
    borderRadiusLG: 14,
    titleFontSize: 15,
  },
  Dropdown: {
    borderRadiusLG: 10,
    controlItemBgHover: '#F2F6FF',
  },
  Popover: {
    borderRadiusLG: 10,
  },
  Notification: {
    borderRadiusLG: 10,
  },
  Message: {
    borderRadiusLG: 8,
  },
  Tooltip: {
    borderRadius: 6,
    colorBgSpotlight: 'rgba(15, 23, 42, 0.92)',
  },
  Pagination: {
    borderRadius: 6,
    itemActiveBg: '#EDF3FF',
  },
  Breadcrumb: {
    fontSize: 12.5,
    itemColor: '#8A94A6',
    lastItemColor: '#0F172A',
    separatorColor: '#C6CEDA',
  },
  Segmented: {
    borderRadius: 8,
    itemSelectedBg: '#FFFFFF',
    trackBg: '#F2F5FA',
  },
  Descriptions: {
    labelBg: '#FAFBFD',
  },
  Progress: {
    defaultColor: '#3370FF',
  },
  Divider: {
    colorSplit: '#EDF1F7',
  },
  Alert: {
    borderRadius: 10,
  },
  Drawer: {
    borderRadiusLG: 12,
  },
}

export const theme: ThemeConfig = {
  token: baseToken,
  components: baseComponents,
}

/** 深色主题：同一套 token，换成 antd 暗色算法与深色容器色。 */
export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseToken,
    colorTextBase: '#E8EDF7',
    colorTextSecondary: '#A7B2C6',
    colorTextTertiary: '#7B879D',
    colorBorder: '#242D3E',
    colorBorderSecondary: '#1E2534',
    colorFillAlter: '#161D2B',
    colorFillSecondary: '#1A2333',
    colorFillTertiary: '#1A2333',
    colorBgLayout: '#0C1017',
    colorBgContainer: '#131926',
    colorBgElevated: '#1A2231',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
    boxShadowSecondary: '0 24px 56px -24px rgba(0, 0, 0, 0.85)',
    boxShadowTertiary: '0 1px 2px rgba(0, 0, 0, 0.4)',
  },
  components: {
    ...baseComponents,
    Layout: {
      ...baseComponents?.Layout,
      siderBg: '#131926',
      headerBg: '#131926',
      bodyBg: '#0C1017',
    },
    Menu: {
      ...baseComponents?.Menu,
      itemSelectedBg: 'rgba(51, 112, 255, 0.16)',
      itemSelectedColor: '#9DBBFF',
      itemColor: '#A7B2C6',
      itemHoverBg: '#1A2333',
      itemHoverColor: '#E8EDF7',
    },
    Card: {
      ...baseComponents?.Card,
      colorBorderSecondary: '#1E2534',
    },
    Table: {
      ...baseComponents?.Table,
      headerBg: '#161D2B',
      headerColor: '#A7B2C6',
      rowHoverBg: '#182031',
      borderColor: '#1E2534',
      footerBg: '#131926',
    },
    Input: {
      ...baseComponents?.Input,
      activeShadow: '0 0 0 3px rgba(91, 140, 255, 0.18)',
    },
    Tag: {
      ...baseComponents?.Tag,
      defaultBg: '#1A2333',
      defaultColor: '#A7B2C6',
    },
    Segmented: {
      ...baseComponents?.Segmented,
      itemSelectedBg: '#1F2A3D',
      trackBg: '#161D2B',
    },
    Descriptions: {
      ...baseComponents?.Descriptions,
      labelBg: '#161D2B',
    },
    Tabs: {
      ...baseComponents?.Tabs,
      itemColor: '#98A5BB',
      itemHoverColor: '#E8EDF7',
      itemSelectedColor: '#E8EDF7',
      inkBarColor: '#5B8CFF',
    },
    Breadcrumb: {
      ...baseComponents?.Breadcrumb,
      itemColor: '#7B879D',
      lastItemColor: '#E8EDF7',
      separatorColor: '#3A4557',
    },
    Tooltip: {
      ...baseComponents?.Tooltip,
      colorBgSpotlight: 'rgba(232, 237, 247, 0.16)',
    },
  },
}
