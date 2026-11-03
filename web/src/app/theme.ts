import { theme as antdTheme, type ThemeConfig } from 'antd'

const fontFamily =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

/**
 * v3.0 设计基座 —— Light SaaS Dashboard + Soft Mint + Clean Enterprise Admin。
 *
 * 四条主线（详见 docs/ui-design-spec.md）：
 * 1. 分层画布：灰底 #F4F6FA + 白卡 + 1px 描边，卡片真正「浮」起来；
 * 2. 品牌克制：主色仍是亮蓝 #2175FF，薄荷 #17A67C 只承担成功/在线/完成度；
 * 3. 近黑侧栏：#0A0A0C + 层级描边，用亮度而非色彩做层级；
 * 4. 动效只服务于状态：120/160/240ms 三档，ease-out，reduced-motion 下只留 opacity。
 */
const baseToken: ThemeConfig['token'] = {
  // 品牌与语义
  colorPrimary: '#2175FF',
  colorInfo: '#2175FF',
  colorLink: '#2175FF',
  colorSuccess: '#17A67C',
  colorWarning: '#E8930C',
  colorError: '#DC4B4B',
  colorTextBase: '#111A2E',
  colorTextSecondary: '#5B6579',
  colorTextTertiary: '#8C96A9',

  // 中性层：画布下沉一档，白卡靠描边与极轻投影分层
  colorBorder: '#E6EAF1',
  colorBorderSecondary: '#EEF1F6',
  colorFillAlter: '#FAFBFD',
  colorFillSecondary: '#F1F4F9',
  colorFillTertiary: '#F5F8FE',
  colorBgLayout: '#F4F6FA',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBgSpotlight: 'rgba(17, 26, 46, 0.92)',

  // 形状：圆角分级，控件 7 / 卡片 10 / 浮层 12
  borderRadius: 7,
  borderRadiusLG: 10,
  borderRadiusSM: 6,
  borderRadiusXS: 4,

  // 尺度：紧凑但不挤
  controlHeight: 32,
  controlHeightSM: 26,
  controlHeightLG: 40,
  fontSize: 13,
  lineHeight: 1.5715,
  fontFamily,
  wireframe: false,

  // 层次：边框为主，投影克制
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
  boxShadowSecondary: '0 12px 32px -16px rgba(16, 24, 40, 0.18)',
  boxShadowTertiary: '0 6px 18px -10px rgba(16, 24, 40, 0.14)',
}

const baseComponents: ThemeConfig['components'] = {
  Layout: {
    siderBg: '#0A0A0C',
    headerBg: '#FFFFFF',
    bodyBg: '#F4F6FA',
    headerHeight: 56,
    headerPadding: '0 20px',
  },
  // 侧栏为近黑底，菜单走暗色层级
  Menu: {
    darkItemBg: 'transparent',
    darkPopupBg: '#101014',
    darkItemColor: '#A7ADBA',
    darkItemHoverBg: 'rgba(255, 255, 255, 0.055)',
    darkItemHoverColor: '#EAECF0',
    darkItemDisabledColor: '#5C6270',
    darkSubMenuItemBg: 'transparent',
    itemBorderRadius: 8,
    itemHeight: 36,
    itemMarginInline: 10,
    itemMarginBlock: 2,
    itemSelectedBg: 'rgba(33, 117, 255, 0.18)',
    itemSelectedColor: '#FFFFFF',
    itemColor: '#A7ADBA',
    itemHoverBg: 'rgba(255, 255, 255, 0.055)',
    itemHoverColor: '#EAECF0',
    subMenuItemBg: 'transparent',
    iconSize: 16,
    activeBarWidth: 0,
    collapsedIconSize: 18,
  },
  Card: {
    borderRadiusLG: 10,
    paddingLG: 16,
    colorBorderSecondary: '#EEF1F6',
    headerHeight: 44,
    headerFontSize: 13.5,
    headerBg: 'transparent',
  },
  Statistic: {
    titleFontSize: 12,
    contentFontSize: 26,
    fontFamily,
  },
  Button: {
    fontWeight: 500,
    borderRadius: 7,
    controlHeight: 32,
    primaryShadow: '0 1px 2px rgba(33, 117, 255, 0.22)',
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
    optionSelectedColor: '#1B5FE0',
  },
  DatePicker: {
    borderRadius: 7,
    controlHeight: 32,
    activeShadow: '0 0 0 3px rgba(33, 117, 255, 0.10)',
  },
  Table: {
    headerBg: '#FAFBFD',
    headerColor: '#5B6579',
    headerSplitColor: 'transparent',
    rowHoverBg: '#F5F8FE',
    borderColor: '#EEF1F6',
    cellPaddingBlock: 13,
    cellPaddingInline: 16,
    footerBg: '#FAFBFD',
    stickyScrollBarBg: '#D7DEE9',
    headerSortActiveBg: '#EAF2FF',
    headerSortHoverBg: '#F1F4F9',
  },
  Tabs: {
    inkBarColor: '#2175FF',
    itemSelectedColor: '#111A2E',
    itemColor: '#8C96A9',
    itemHoverColor: '#111A2E',
    titleFontSize: 13,
    horizontalItemGutter: 24,
    horizontalItemPadding: '10px 0',
    horizontalMargin: '0 0 16px 0',
    cardPadding: '5px 12px',
    cardGutter: 6,
  },
  Tag: {
    borderRadiusSM: 6,
    defaultBg: '#F1F4F9',
    defaultColor: '#5B6579',
  },
  Modal: {
    borderRadiusLG: 12,
    titleFontSize: 15,
    contentBg: '#FFFFFF',
    headerBg: '#FFFFFF',
  },
  Drawer: {
    colorBgElevated: '#FFFFFF',
  },
  Dropdown: {
    borderRadiusLG: 12,
    paddingBlock: 4,
    controlItemBgHover: '#F1F4F9',
  },
  Popover: {
    borderRadiusLG: 12,
  },
  Notification: {
    borderRadiusLG: 12,
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
    itemColor: '#8C96A9',
    lastItemColor: '#111A2E',
    separatorColor: '#C7CEDB',
  },
  Segmented: {
    borderRadius: 7,
    itemSelectedBg: '#FFFFFF',
    trackBg: '#EEF1F6',
    itemSelectedColor: '#111A2E',
  },
  Descriptions: {
    labelBg: '#FAFBFD',
    titleMarginBottom: 12,
    itemPaddingBottom: 10,
  },
  Progress: {
    defaultColor: '#2175FF',
    remainingColor: '#EEF1F6',
    lineBorderRadius: 3,
  },
  Timeline: {
    dotBg: '#FFFFFF',
    tailColor: '#E6EAF1',
    itemPaddingBottom: 16,
  },
  Empty: {
    colorTextDescription: '#8C96A9',
  },
  Result: {
    titleFontSize: 20,
    subtitleFontSize: 13,
  },
  Alert: {
    borderRadius: 10,
    withDescriptionPadding: '14px 16px',
  },
  Divider: {
    colorSplit: '#EEF1F6',
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

/**
 * 暗黑模式：重新分层而非反色。
 * 靠描边与亮度分层（阴影几乎无效），语义色降饱和但保持可辨，表头比行亮一档。
 */
export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: '#6D9AFF',
    colorInfo: '#6D9AFF',
    colorLink: '#6D9AFF',
    colorSuccess: '#34C79A',
    colorWarning: '#F5B04C',
    colorError: '#F87A7A',
    colorTextBase: '#E6EAF2',
    colorTextSecondary: '#9AA5B8',
    colorTextTertiary: '#6F7A8D',
    colorBorder: '#232B3A',
    colorBorderSecondary: '#1B2230',
    colorFillAlter: '#101722',
    colorFillSecondary: '#18212E',
    colorFillTertiary: '#18212E',
    colorBgLayout: '#0B0F16',
    colorBgContainer: '#131A25',
    colorBgElevated: '#18212E',
    colorBgSpotlight: 'rgba(230, 234, 242, 0.16)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
    boxShadowSecondary: '0 16px 40px -20px rgba(0, 0, 0, 0.8)',
    boxShadowTertiary: '0 6px 18px -10px rgba(0, 0, 0, 0.6)',
  },
  components: {
    ...baseComponents,
    Layout: {
      ...baseComponents?.Layout,
      siderBg: '#0A0A0C',
      headerBg: '#131A25',
      bodyBg: '#0B0F16',
    },
    Menu: {
      ...baseComponents?.Menu,
      darkPopupBg: '#101014',
      itemSelectedBg: 'rgba(109, 154, 255, 0.20)',
      itemHoverBg: 'rgba(255, 255, 255, 0.06)',
    },
    Card: {
      ...baseComponents?.Card,
      colorBorderSecondary: '#1B2230',
    },
    Table: {
      ...baseComponents?.Table,
      headerBg: '#101722',
      headerColor: '#9AA5B8',
      rowHoverBg: '#18212E',
      borderColor: '#1B2230',
      footerBg: '#131A25',
      headerSortActiveBg: 'rgba(109, 154, 255, 0.16)',
      headerSortHoverBg: '#18212E',
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
      labelBg: '#101722',
    },
    Segmented: {
      ...baseComponents?.Segmented,
      itemSelectedBg: '#1F2A3B',
      trackBg: '#101722',
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
      defaultBg: '#18212E',
      defaultColor: '#9AA5B8',
    },
    Breadcrumb: {
      ...baseComponents?.Breadcrumb,
      itemColor: '#6F7A8D',
      lastItemColor: '#E6EAF2',
      separatorColor: '#39424F',
    },
    Select: {
      ...baseComponents?.Select,
      optionSelectedBg: 'rgba(109, 154, 255, 0.16)',
      optionSelectedColor: '#A9C4FF',
    },
    Pagination: {
      ...baseComponents?.Pagination,
      itemActiveBg: 'rgba(109, 154, 255, 0.16)',
    },
  },
}
