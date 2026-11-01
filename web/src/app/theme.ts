import { theme as antdTheme, type ThemeConfig } from 'antd'

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

/**
 * 「卷墨」设计基座 —— 面向在线考试系统的精致现代风格。
 *
 * 配色取意阅卷场景：靛墨（ink）为品牌主色，批改朱（vermilion）标记错题与异常，
 * 玉青 / 琥珀 / 靛紫区分成绩与状态等级。整体以细边框 + 极轻投影建立层次，
 * 不依赖重阴影与渐变，信息密度高但保持呼吸感。
 */
const baseToken: ThemeConfig['token'] = {
  // 品牌与语义
  colorPrimary: '#2F54EB',
  colorInfo: '#2F54EB',
  colorLink: '#2F54EB',
  colorSuccess: '#0F9D76',
  colorWarning: '#D98A26',
  colorError: '#D64545',
  colorTextBase: '#101828',
  colorTextSecondary: '#4B5565',
  colorTextTertiary: '#8A93A3',

  // 描边与表面
  colorBorder: '#E3E8EF',
  colorBorderSecondary: '#EDF0F5',
  colorFillAlter: '#F8FAFC',
  colorFillSecondary: '#F1F4F9',
  colorFillTertiary: '#F5F7FA',
  colorBgLayout: '#F4F6FA',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',

  // 形状：偏方，接近纸张与印刷品的硬朗感
  borderRadius: 6,
  borderRadiusLG: 10,
  borderRadiusSM: 4,
  borderRadiusXS: 3,

  // 尺度：紧凑，适配高频录入
  controlHeight: 32,
  controlHeightSM: 26,
  controlHeightLG: 38,
  fontSize: 13,
  lineHeight: 1.5715,
  fontFamily,
  wireframe: false,

  // 层次：靠边框而非阴影
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
  boxShadowSecondary: '0 14px 34px -18px rgba(16, 24, 40, 0.28)',
  boxShadowTertiary: '0 1px 2px rgba(16, 24, 40, 0.04)',
}

const baseComponents: ThemeConfig['components'] = {
  Layout: {
    siderBg: '#FFFFFF',
    headerBg: '#FFFFFF',
    bodyBg: '#F4F6FA',
    headerHeight: 52,
    headerPadding: '0 18px',
  },
  Menu: {
    itemBorderRadius: 6,
    itemHeight: 34,
    itemMarginInline: 8,
    itemMarginBlock: 2,
    itemSelectedBg: '#EDF1FE',
    itemSelectedColor: '#2F54EB',
    itemColor: '#4B5565',
    itemHoverBg: '#F5F7FA',
    itemHoverColor: '#101828',
    subMenuItemBg: 'transparent',
    iconSize: 15,
    activeBarWidth: 0,
    collapsedIconSize: 17,
  },
  Card: {
    borderRadiusLG: 10,
    paddingLG: 16,
    colorBorderSecondary: '#EDF0F5',
    headerHeight: 44,
    headerFontSize: 13.5,
  },
  Statistic: {
    titleFontSize: 12,
    contentFontSize: 26,
    fontFamily,
  },
  Button: {
    fontWeight: 500,
    borderRadius: 6,
    controlHeight: 32,
    primaryShadow: 'none',
    defaultShadow: 'none',
    dangerShadow: 'none',
    paddingInline: 12,
    fontSize: 13,
  },
  Input: {
    borderRadius: 6,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(47, 84, 235, 0.10)',
    hoverBorderColor: '#A9BEF5',
    activeBorderColor: '#2F54EB',
  },
  InputNumber: {
    borderRadius: 6,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(47, 84, 235, 0.10)',
  },
  Select: {
    borderRadius: 6,
    controlHeight: 32,
    optionSelectedBg: '#EDF1FE',
    optionSelectedColor: '#2F54EB',
  },
  DatePicker: {
    borderRadius: 6,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(47, 84, 235, 0.10)',
  },
  Table: {
    headerBg: '#F7F9FC',
    headerColor: '#4B5565',
    headerSplitColor: 'transparent',
    rowHoverBg: '#F5F8FE',
    borderColor: '#EDF0F5',
    cellPaddingBlock: 10,
    cellPaddingInline: 13,
    footerBg: '#FAFBFD',
    stickyScrollBarBg: '#D6DDE8',
    headerSortActiveBg: '#EDF1FE',
    headerSortHoverBg: '#F1F4F9',
  },
  Tabs: {
    inkBarColor: '#2F54EB',
    itemSelectedColor: '#101828',
    itemColor: '#6B7382',
    itemHoverColor: '#101828',
    titleFontSize: 13,
    horizontalItemGutter: 24,
    horizontalItemPadding: '10px 0',
    horizontalMargin: '0 0 14px 0',
    cardPadding: '5px 12px',
    cardGutter: 4,
  },
  Tag: {
    borderRadiusSM: 4,
    defaultBg: '#F2F5F9',
    defaultColor: '#4B5565',
  },
  Modal: {
    borderRadiusLG: 12,
    titleFontSize: 15,
    contentBg: '#FFFFFF',
    headerBg: '#FFFFFF',
  },
  Dropdown: {
    borderRadiusLG: 8,
    controlItemBgHover: '#F2F6FE',
  },
  Popover: {
    borderRadiusLG: 8,
  },
  Notification: {
    borderRadiusLG: 8,
  },
  Message: {
    borderRadiusLG: 6,
  },
  Tooltip: {
    borderRadius: 4,
    colorBgSpotlight: 'rgba(16, 24, 40, 0.92)',
  },
  Pagination: {
    borderRadius: 4,
    itemActiveBg: '#EDF1FE',
  },
  Breadcrumb: {
    fontSize: 12,
    itemColor: '#8A93A3',
    lastItemColor: '#101828',
    separatorColor: '#C4CBD6',
  },
  Segmented: {
    borderRadius: 6,
    itemSelectedBg: '#FFFFFF',
    trackBg: '#EEF1F6',
    itemSelectedColor: '#101828',
  },
  Descriptions: {
    labelBg: '#F7F9FC',
    titleMarginBottom: 12,
    itemPaddingBottom: 10,
  },
  Progress: {
    defaultColor: '#2F54EB',
    remainingColor: '#EDF0F5',
    lineBorderRadius: 2,
  },
  Timeline: {
    dotBg: '#FFFFFF',
    tailColor: '#E3E8EF',
    itemPaddingBottom: 16,
  },
  Empty: {
    colorTextDescription: '#8A93A3',
  },
  Result: {
    titleFontSize: 22,
    subtitleFontSize: 13,
  },
  Alert: {
    borderRadius: 8,
    withDescriptionPadding: '14px 16px',
  },
  Divider: {
    colorSplit: '#EDF0F5',
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
