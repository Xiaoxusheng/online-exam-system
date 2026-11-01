import { theme as antdTheme, type ThemeConfig } from 'antd'

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

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
  colorBorder: '#E5E9F2',
  colorBorderSecondary: '#EEF1F7',
  colorFillAlter: '#F8FAFD',
  colorFillSecondary: '#F2F5FA',
  colorFillTertiary: '#F5F8FC',
  colorBgLayout: '#F4F6FB',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  borderRadius: 10,
  borderRadiusLG: 14,
  borderRadiusSM: 8,
  borderRadiusXS: 6,
  controlHeight: 36,
  controlHeightSM: 30,
  controlHeightLG: 42,
  fontSize: 14,
  lineHeight: 1.5715,
  fontFamily,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  boxShadowSecondary: '0 18px 48px -20px rgba(15, 23, 42, 0.32)',
  boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.04)',
  wireframe: false,
}

const baseComponents: ThemeConfig['components'] = {
  Layout: {
    siderBg: '#FFFFFF',
    headerBg: '#FFFFFF',
    bodyBg: '#F4F6FB',
    headerHeight: 56,
    headerPadding: '0 20px',
  },
  Menu: {
    itemBorderRadius: 9,
    itemHeight: 38,
    itemMarginInline: 10,
    itemMarginBlock: 2,
    itemSelectedBg: '#EEF3FF',
    itemSelectedColor: '#2B5FE0',
    itemColor: '#475467',
    itemHoverBg: '#F8FAFD',
    itemHoverColor: '#0F172A',
    subMenuItemBg: 'transparent',
    iconSize: 16,
    activeBarWidth: 0,
    collapsedIconSize: 18,
  },
  Card: {
    borderRadiusLG: 14,
    paddingLG: 18,
    colorBorderSecondary: '#EEF1F7',
  },
  Button: {
    fontWeight: 500,
    borderRadius: 9,
    controlHeight: 36,
    primaryShadow: '0 1px 2px rgba(51, 112, 255, 0.28)',
    defaultShadow: 'none',
    dangerShadow: 'none',
    paddingInline: 14,
  },
  Input: {
    borderRadius: 9,
    controlHeight: 36,
    activeShadow: '0 0 0 3px rgba(51, 112, 255, 0.12)',
    hoverBorderColor: '#C9DAFF',
    activeBorderColor: '#3370FF',
  },
  InputNumber: {
    borderRadius: 9,
    controlHeight: 36,
    activeShadow: '0 0 0 3px rgba(51, 112, 255, 0.12)',
  },
  Select: {
    borderRadius: 9,
    controlHeight: 36,
    optionSelectedBg: '#EEF3FF',
    optionSelectedColor: '#2B5FE0',
  },
  DatePicker: {
    borderRadius: 9,
    controlHeight: 36,
    activeShadow: '0 0 0 3px rgba(51, 112, 255, 0.12)',
  },
  Table: {
    headerBg: '#F8FAFD',
    headerColor: '#475467',
    headerSplitColor: 'transparent',
    rowHoverBg: '#F2F6FF',
    borderColor: '#EEF1F7',
    cellPaddingBlock: 12,
    cellPaddingInline: 14,
    headerBorderRadius: 10,
    footerBg: '#FAFBFD',
    stickyScrollBarBg: '#D8DFEB',
  },
  Tabs: {
    inkBarColor: '#3370FF',
    itemSelectedColor: '#0F172A',
    itemColor: '#667085',
    itemHoverColor: '#0F172A',
    titleFontSize: 14,
    horizontalItemGutter: 28,
    horizontalItemPadding: '12px 0',
  },
  Tag: {
    borderRadiusSM: 6,
    defaultBg: '#F5F8FC',
    defaultColor: '#475467',
  },
  Modal: {
    borderRadiusLG: 16,
    titleFontSize: 15,
  },
  Dropdown: {
    borderRadiusLG: 12,
    controlItemBgHover: '#F2F6FF',
  },
  Popover: {
    borderRadiusLG: 12,
  },
  Notification: {
    borderRadiusLG: 12,
  },
  Message: {
    borderRadiusLG: 10,
  },
  Tooltip: {
    borderRadius: 8,
    colorBgSpotlight: 'rgba(15, 23, 42, 0.92)',
  },
  Pagination: {
    borderRadius: 8,
    itemActiveBg: '#EEF3FF',
  },
  Breadcrumb: {
    fontSize: 12.5,
    itemColor: '#8A94A6',
    lastItemColor: '#0F172A',
    separatorColor: '#C6CEDA',
  },
  Segmented: {
    borderRadius: 9,
    itemSelectedBg: '#FFFFFF',
    trackBg: '#F2F5FA',
  },
  Descriptions: {
    labelBg: '#F8FAFD',
  },
  Progress: {
    defaultColor: '#3370FF',
  },
  Divider: {
    colorSplit: '#EEF1F7',
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
    colorBorder: '#232C3D',
    colorBorderSecondary: '#1D2534',
    colorFillAlter: '#161D2B',
    colorFillSecondary: '#1A2333',
    colorFillTertiary: '#1A2333',
    colorBgLayout: '#0B0F17',
    colorBgContainer: '#121826',
    colorBgElevated: '#182031',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
    boxShadowSecondary: '0 24px 56px -24px rgba(0, 0, 0, 0.85)',
    boxShadowTertiary: '0 1px 2px rgba(0, 0, 0, 0.4)',
  },
  components: {
    ...baseComponents,
    Layout: {
      ...baseComponents?.Layout,
      siderBg: '#121826',
      headerBg: '#121826',
      bodyBg: '#0B0F17',
    },
    Menu: {
      ...baseComponents?.Menu,
      itemSelectedBg: 'rgba(91, 140, 255, 0.16)',
      itemSelectedColor: '#9DBBFF',
      itemColor: '#A7B2C6',
      itemHoverBg: '#1A2333',
      itemHoverColor: '#E8EDF7',
    },
    Card: {
      ...baseComponents?.Card,
      colorBorderSecondary: '#1D2534',
    },
    Table: {
      ...baseComponents?.Table,
      headerBg: '#161D2B',
      headerColor: '#A7B2C6',
      rowHoverBg: '#182235',
      borderColor: '#1D2534',
      footerBg: '#121826',
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
