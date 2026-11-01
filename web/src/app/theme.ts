import { theme as antdTheme, type ThemeConfig } from 'antd'

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

/**
 * 「墨砚」设计基座 v2.1 —— 对齐参考风格的亮蓝配色与高信息密度。
 *
 * 三条主线：
 * 1. 纯白画布：全站铺白，层次只靠 1px 细边框与极轻投影，干净通透；
 * 2. 亮蓝语言：#2175FF 主色 + 鲜亮语义色，数字层级突出；
 * 3. 紧凑密度：小圆角、窄行距、密排卡片，信息密度高但保持呼吸感。
 */
const baseToken: ThemeConfig['token'] = {
  // 品牌与语义
  colorPrimary: '#2175FF',
  colorInfo: '#2175FF',
  colorLink: '#2175FF',
  colorSuccess: '#16A34A',
  colorWarning: '#F59E0B',
  colorError: '#EF4444',
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

  // 形状：小圆角，接近参考稿的紧凑卡片
  borderRadius: 7,
  borderRadiusLG: 10,
  borderRadiusSM: 5,
  borderRadiusXS: 3,

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
    headerHeight: 52,
    headerPadding: '0 18px',
  },
  Menu: {
    itemBorderRadius: 7,
    itemHeight: 34,
    itemMarginInline: 8,
    itemMarginBlock: 2,
    itemSelectedBg: '#EAF2FF',
    itemSelectedColor: '#2175FF',
    itemColor: '#55607A',
    itemHoverBg: '#F5F7FB',
    itemHoverColor: '#111A2E',
    subMenuItemBg: 'transparent',
    iconSize: 15,
    activeBarWidth: 0,
    collapsedIconSize: 17,
  },
  Card: {
    borderRadiusLG: 10,
    paddingLG: 16,
    colorBorderSecondary: '#EFF2F7',
    headerHeight: 44,
    headerFontSize: 13.5,
  },
  Statistic: {
    titleFontSize: 12,
    contentFontSize: 30,
    fontFamily,
  },
  Button: {
    fontWeight: 500,
    borderRadius: 7,
    controlHeight: 32,
    primaryShadow: '0 1px 2px rgba(33, 117, 255, 0.24)',
    defaultShadow: 'none',
    dangerShadow: 'none',
    paddingInline: 12,
    fontSize: 13,
  },
  Input: {
    borderRadius: 7,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(33, 117, 255, 0.10)',
    hoverBorderColor: '#8FB8FF',
    activeBorderColor: '#2175FF',
  },
  InputNumber: {
    borderRadius: 7,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(33, 117, 255, 0.10)',
  },
  Select: {
    borderRadius: 7,
    controlHeight: 32,
    optionSelectedBg: '#EAF2FF',
    optionSelectedColor: '#2175FF',
  },
  DatePicker: {
    borderRadius: 7,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(33, 117, 255, 0.10)',
  },
  Table: {
    headerBg: '#F9FAFC',
    headerColor: '#55607A',
    headerSplitColor: 'transparent',
    rowHoverBg: '#F5F9FF',
    borderColor: '#EFF2F7',
    cellPaddingBlock: 9,
    cellPaddingInline: 12,
    footerBg: '#FAFBFD',
    stickyScrollBarBg: '#D6DDE8',
    headerSortActiveBg: '#EAF2FF',
    headerSortHoverBg: '#F2F5FA',
  },
  Tabs: {
    inkBarColor: '#2175FF',
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
    borderRadiusLG: 12,
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
    itemActiveBg: '#EAF2FF',
  },
  Breadcrumb: {
    fontSize: 12,
    itemColor: '#8B94AB',
    lastItemColor: '#111A2E',
    separatorColor: '#C7CEDB',
  },
  Segmented: {
    borderRadius: 7,
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
    defaultColor: '#2175FF',
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
    colorPrimary: '#6D9AFF',
    colorInfo: '#6D9AFF',
    colorLink: '#6D9AFF',
    colorSuccess: '#3DDB9E',
    colorWarning: '#F5B04C',
    colorError: '#F87A7A',
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
      itemSelectedBg: 'rgba(109, 154, 255, 0.16)',
      itemSelectedColor: '#A9C4FF',
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
      headerSortActiveBg: 'rgba(109, 154, 255, 0.16)',
      headerSortHoverBg: '#1A2230',
    },
    Tabs: {
      ...baseComponents?.Tabs,
      itemColor: '#8A93A3',
      itemHoverColor: '#E6EAF2',
      itemSelectedColor: '#E6EAF2',
      inkBarColor: '#6D9AFF',
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
