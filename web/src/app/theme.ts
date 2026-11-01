import { theme as antdTheme, type ThemeConfig } from 'antd'

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

/**
 * 「墨砚」设计基座 v2.0 —— 现代高级感的考试工作台。
 *
 * 三条主线：
 * 1. 纯白画布：全站铺白，层次只靠 1px 细边框与极轻投影，干净通透；
 * 2. 墨色语言：靛墨主色 + 批改朱语义色，稳重中带一点锋利；
 * 3. 柔和几何：8/12px 圆角、药丸页签、胶囊高亮，紧凑但不局促。
 */
const baseToken: ThemeConfig['token'] = {
  // 品牌与语义
  colorPrimary: '#2F54EB',
  colorInfo: '#2F54EB',
  colorLink: '#2F54EB',
  colorSuccess: '#0F9D76',
  colorWarning: '#D98A26',
  colorError: '#D64545',
  colorTextBase: '#111A2E',
  colorTextSecondary: '#55607A',
  colorTextTertiary: '#8B94AB',

  // 描边与表面：画布纯白，边框极淡
  colorBorder: '#E6EAF1',
  colorBorderSecondary: '#EFF2F7',
  colorFillAlter: '#F8FAFC',
  colorFillSecondary: '#F2F5FA',
  colorFillTertiary: '#F6F8FB',
  colorBgLayout: '#FFFFFF',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',

  // 形状：柔和现代
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  borderRadiusXS: 4,

  // 尺度：紧凑，适配高频录入
  controlHeight: 32,
  controlHeightSM: 26,
  controlHeightLG: 38,
  fontSize: 13,
  lineHeight: 1.5715,
  fontFamily,
  wireframe: false,

  // 层次：边框为主，投影为辅
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  boxShadowSecondary: '0 16px 48px -20px rgba(15, 23, 42, 0.24)',
  boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const baseComponents: ThemeConfig['components'] = {
  Layout: {
    siderBg: '#FFFFFF',
    headerBg: '#FFFFFF',
    bodyBg: '#FFFFFF',
    headerHeight: 56,
    headerPadding: '0 20px',
  },
  Menu: {
    itemBorderRadius: 8,
    itemHeight: 36,
    itemMarginInline: 10,
    itemMarginBlock: 2,
    itemSelectedBg: '#EEF2FE',
    itemSelectedColor: '#2F54EB',
    itemColor: '#55607A',
    itemHoverBg: '#F5F7FB',
    itemHoverColor: '#111A2E',
    subMenuItemBg: 'transparent',
    iconSize: 15,
    activeBarWidth: 0,
    collapsedIconSize: 17,
  },
  Card: {
    borderRadiusLG: 12,
    paddingLG: 18,
    colorBorderSecondary: '#EFF2F7',
    headerHeight: 46,
    headerFontSize: 14,
  },
  Statistic: {
    titleFontSize: 12,
    contentFontSize: 28,
    fontFamily,
  },
  Button: {
    fontWeight: 500,
    borderRadius: 8,
    controlHeight: 32,
    primaryShadow: '0 1px 2px rgba(47, 84, 235, 0.24)',
    defaultShadow: 'none',
    dangerShadow: 'none',
    paddingInline: 14,
    fontSize: 13,
  },
  Input: {
    borderRadius: 8,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(47, 84, 235, 0.10)',
    hoverBorderColor: '#A9BEF5',
    activeBorderColor: '#2F54EB',
  },
  InputNumber: {
    borderRadius: 8,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(47, 84, 235, 0.10)',
  },
  Select: {
    borderRadius: 8,
    controlHeight: 32,
    optionSelectedBg: '#EEF2FE',
    optionSelectedColor: '#2F54EB',
  },
  DatePicker: {
    borderRadius: 8,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(47, 84, 235, 0.10)',
  },
  Table: {
    headerBg: '#F9FAFC',
    headerColor: '#55607A',
    headerSplitColor: 'transparent',
    rowHoverBg: '#F6F9FE',
    borderColor: '#EFF2F7',
    cellPaddingBlock: 11,
    cellPaddingInline: 14,
    footerBg: '#FAFBFD',
    stickyScrollBarBg: '#D6DDE8',
    headerSortActiveBg: '#EEF2FE',
    headerSortHoverBg: '#F2F5FA',
  },
  Tabs: {
    inkBarColor: '#2F54EB',
    itemSelectedColor: '#111A2E',
    itemColor: '#8B94AB',
    itemHoverColor: '#111A2E',
    titleFontSize: 13,
    horizontalItemGutter: 24,
    horizontalItemPadding: '10px 0',
    horizontalMargin: '0 0 14px 0',
    cardPadding: '5px 12px',
    cardGutter: 6,
  },
  Tag: {
    borderRadiusSM: 5,
    defaultBg: '#F4F6FA',
    defaultColor: '#55607A',
  },
  Modal: {
    borderRadiusLG: 14,
    titleFontSize: 15,
    contentBg: '#FFFFFF',
    headerBg: '#FFFFFF',
  },
  Dropdown: {
    borderRadiusLG: 10,
    controlItemBgHover: '#F2F6FE',
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
    colorBgSpotlight: 'rgba(17, 26, 46, 0.92)',
  },
  Pagination: {
    borderRadius: 6,
    itemActiveBg: '#EEF2FE',
  },
  Breadcrumb: {
    fontSize: 12,
    itemColor: '#8B94AB',
    lastItemColor: '#111A2E',
    separatorColor: '#C7CEDB',
  },
  Segmented: {
    borderRadius: 8,
    itemSelectedBg: '#FFFFFF',
    trackBg: '#EFF2F7',
    itemSelectedColor: '#111A2E',
  },
  Descriptions: {
    labelBg: '#F9FAFC',
    titleMarginBottom: 12,
    itemPaddingBottom: 10,
  },
  Progress: {
    defaultColor: '#2F54EB',
    remainingColor: '#EFF2F7',
    lineBorderRadius: 3,
  },
  Timeline: {
    dotBg: '#FFFFFF',
    tailColor: '#E6EAF1',
    itemPaddingBottom: 16,
  },
  Empty: {
    colorTextDescription: '#8B94AB',
  },
  Result: {
    titleFontSize: 22,
    subtitleFontSize: 13,
  },
  Alert: {
    borderRadius: 10,
    withDescriptionPadding: '14px 16px',
  },
  Divider: {
    colorSplit: '#EFF2F7',
  },
  Badge: {
    textFontSize: 12,
  },
  List: {
    headerBg: 'transparent',
    footerBg: 'transparent',
  },
}

export const theme: ThemeConfig = {
  token: baseToken,
  components: baseComponents,
}

/** 深色主题：同一套语义，换成墨色容器与降低饱和的强调色。 */
export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: '#5C7CFA',
    colorInfo: '#5C7CFA',
    colorLink: '#5C7CFA',
    colorSuccess: '#35C79A',
    colorWarning: '#E5A54B',
    colorError: '#E86A6A',
    colorTextBase: '#E6EAF2',
    colorTextSecondary: '#9AA5B8',
    colorTextTertiary: '#6F7A8D',
    colorBorder: '#232B3A',
    colorBorderSecondary: '#1D2431',
    colorFillAlter: '#151C27',
    colorFillSecondary: '#19212E',
    colorFillTertiary: '#1A2230',
    colorBgLayout: '#0D1119',
    colorBgContainer: '#141A25',
    colorBgElevated: '#1B2330',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
    boxShadowSecondary: '0 20px 48px -22px rgba(0, 0, 0, 0.8)',
    boxShadowTertiary: '0 1px 2px rgba(0, 0, 0, 0.4)',
  },
  components: {
    ...baseComponents,
    Layout: {
      ...baseComponents?.Layout,
      siderBg: '#141A25',
      headerBg: '#141A25',
      bodyBg: '#0D1119',
    },
    Menu: {
      ...baseComponents?.Menu,
      itemSelectedBg: 'rgba(92, 124, 250, 0.15)',
      itemSelectedColor: '#9DB3FB',
      itemColor: '#9AA5B8',
      itemHoverBg: '#1A2230',
      itemHoverColor: '#E6EAF2',
    },
    Card: {
      ...baseComponents?.Card,
      colorBorderSecondary: '#1D2431',
    },
    Table: {
      ...baseComponents?.Table,
      headerBg: '#182030',
      headerColor: '#9AA5B8',
      rowHoverBg: '#1B2333',
      borderColor: '#1D2431',
      footerBg: '#141A25',
      headerSortActiveBg: 'rgba(92, 124, 250, 0.16)',
      headerSortHoverBg: '#1A2230',
    },
    Tabs: {
      ...baseComponents?.Tabs,
      itemColor: '#8A93A3',
      itemHoverColor: '#E6EAF2',
      itemSelectedColor: '#E6EAF2',
      inkBarColor: '#5C7CFA',
    },
    Descriptions: {
      ...baseComponents?.Descriptions,
      labelBg: '#182030',
    },
    Segmented: {
      ...baseComponents?.Segmented,
      itemSelectedBg: '#1F2A3B',
      trackBg: '#182030',
    },
    Progress: {
      ...baseComponents?.Progress,
      remainingColor: '#232B3A',
    },
    Timeline: {
      ...baseComponents?.Timeline,
      tailColor: '#232B3A',
    },
    Tag: {
      ...baseComponents?.Tag,
      defaultBg: '#1A2230',
      defaultColor: '#9AA5B8',
    },
    Breadcrumb: {
      ...baseComponents?.Breadcrumb,
      itemColor: '#6F7A8D',
      lastItemColor: '#E6EAF2',
      separatorColor: '#39424F',
    },
    Tooltip: {
      ...baseComponents?.Tooltip,
      colorBgSpotlight: 'rgba(230, 234, 242, 0.16)',
    },
  },
}
