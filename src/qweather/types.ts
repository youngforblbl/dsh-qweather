/**
 * 与和风天气 API 对应的共享数据类型与纯函数。
 * 本模块不依赖 DOM / Node / 网络，node 半端、浏览器半端与 vitest 均可直接使用。
 */

/** 地理实体（来自 GeoAPI 城市搜索）。 */
export interface Place {
  /** 和风 LocationID，如 101010100。 */
  id: string
  /** 位置名称，如「东城」。 */
  name: string
  /** 一级行政区域，如「北京市」。 */
  adm1?: string
  /** 上级行政区域，如「北京」。 */
  adm2?: string
  lat: number
  lon: number
}

/** 实时天气。 */
export interface NowWeather {
  obsTime?: string
  temp: number
  feelsLike?: number
  icon: string
  text: string
  humidity?: number
  windDir?: string
  windScale?: string | number
  precip?: number
  pressure?: number
  vis?: number
  cloud?: number
}

/** 逐小时预报中的一小时。 */
export interface HourlyWeather {
  /** ISO 时间，如 2026-08-17T15:00+08:00。 */
  time: string
  temp: number
  icon: string
  text: string
  /** 降水概率 0-1。 */
  pop: number
  precip?: number
  humidity?: number
  windDir?: string
  windScale?: string | number
}

/** 逐日预报中的一天。 */
export interface DailyWeather {
  date: string
  tempMax: number
  tempMin: number
  iconDay: string
  textDay: string
  iconNight?: string
  textNight?: string
  sunrise?: string
  sunset?: string
  moonPhase?: string
  /** 白天降水概率 0-1。 */
  pop?: number
}

/** 天气预警。 */
export interface WeatherAlert {
  id: string
  sender?: string
  pubTime?: string
  headline: string
  typeName?: string
  /** v1 API 的严重程度：minor(蓝) / moderate(黄) / severe(橙) / extreme(红)。 */
  severity: string
  /** 预警颜色代码：blue / yellow / orange / red。 */
  color: string
  text?: string
  instruction?: string
}

/** 实时空气质量（取中文标准 AQI，cn-mee）。 */
export interface AirNow {
  aqi: number
  category?: string
  level?: string
  pm2p5?: number
  pm10?: number
  no2?: number
  so2?: number
  co?: number
  o3?: number
  primary?: string
}

/** 一次完整的天气数据包：卡片与 LLM 文本都从这里生成。 */
export interface WeatherBundle {
  place: Place
  /** 数据接收时间（v1 接口不返回服务端 updateTime，用本地接收时间）。 */
  receivedAt: string
  now?: NowWeather
  hours?: HourlyWeather[]
  days?: DailyWeather[]
  alerts?: WeatherAlert[]
  air?: AirNow
}

/** 预警颜色 → 展示色。 */
export const WARNING_COLORS: Readonly<Record<string, string>> = {
  blue: '#3d7bd9',
  yellow: '#e3a008',
  orange: '#e0662d',
  red: '#d9534f',
  unknown: '#8a94a6',
}

/** 预警颜色 → 中文名称。 */
export const WARNING_NAMES: Readonly<Record<string, string>> = {
  blue: '蓝色预警',
  yellow: '黄色预警',
  orange: '橙色预警',
  red: '红色预警',
}

/** 黄色及以上（含橙、红）才算「重要预警」；蓝色与未知级别被过滤。 */
export function isYellowOrAbove(alert: Pick<WeatherAlert, 'severity' | 'color'>): boolean {
  if (alert.severity === 'moderate' || alert.severity === 'severe' || alert.severity === 'extreme') return true
  const color = alert.color.toLowerCase()
  return color === 'yellow' || color === 'orange' || color === 'red'
}

/** 预警展示颜色（未知级别用灰色兜底）。 */
export function warningColor(alert: Pick<WeatherAlert, 'color'>): string {
  return WARNING_COLORS[alert.color.toLowerCase()] ?? WARNING_COLORS['unknown']!
}

/** 补零。 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO 时间 → 「15:00」式小时标签（按本地时区显示）。 */
export function hourLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** ISO 时间 → 「2026-08-17 15:02」（按本地时区显示）。 */
export function localDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** ISO 时间 → 「8/17」式日期标签。 */
export function dayLabel(iso: string): string {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${Number(match[2])}/${Number(match[3])}` : iso
}

/** 数字 → 最多一位小数的字符串（30.0 → "30"）。 */
export function round1(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/** 百分比 0-1 → 整数百分比文本。 */
export function percent(n: number): string {
  return `${Math.round(n * 100)}%`
}

/** 安全 HTML 转义：所有进入卡片 HTML 的外部文本都必须经过这里。 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}


/** 工具名（客户端 toolview 槽位以工具名为键）。 */
export const WEATHER_TOOL_NAME = 'qweather_weather'
export const CARD_TOOL_NAME = 'qweather_card'

/** qweather_card 工具写入持久化 meta 的判别字段（客户端 toolview 槽位同键）。 */
export const CARD_META_KIND = 'qweather-card'

/** 卡片 meta（客户端据此回放渲染，与 src/tools.ts 的声明保持一致）。 */
export interface QWeatherCardMeta {
  kind: typeof CARD_META_KIND
  fragment: string
  title: string
  location: string
  updateTime: string
}

/** 从持久化 meta 中窄化出卡片 meta（结构不符返回 undefined）。 */
export function qweatherCardMetaFrom(meta: unknown): QWeatherCardMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const candidate = meta as Record<string, unknown>
  if (candidate.kind !== CARD_META_KIND || typeof candidate.fragment !== 'string'
    || typeof candidate.title !== 'string' || typeof candidate.location !== 'string') return undefined
  return {
    kind: CARD_META_KIND,
    fragment: candidate.fragment,
    title: candidate.title,
    location: candidate.location,
    updateTime: typeof candidate.updateTime === 'string' ? candidate.updateTime : '',
  }
}

/** 「东城 · 北京 · 北京市」式完整地名。 */
export function placeLabel(place: Place): string {
  return [place.name, place.adm2, place.adm1]
    .filter((part, index, parts) => part !== undefined && part.length > 0 && parts.indexOf(part) === index)
    .join(' · ')
}
