import z from "@deepseek-ai/schemastery";
import { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { Context } from "@deepseek-ai/cordis";
//#region src/qweather/types.d.ts
/**
 * 与和风天气 API 对应的共享数据类型与纯函数。
 * 本模块不依赖 DOM / Node / 网络，node 半端、浏览器半端与 vitest 均可直接使用。
 */
/** 地理实体（来自 GeoAPI 城市搜索）。 */
interface Place {
  /** 和风 LocationID，如 101010100。 */
  id: string;
  /** 位置名称，如「东城」。 */
  name: string;
  /** 一级行政区域，如「北京市」。 */
  adm1?: string;
  /** 上级行政区域，如「北京」。 */
  adm2?: string;
  lat: number;
  lon: number;
}
/** 实时天气。 */
interface NowWeather {
  obsTime?: string;
  temp: number;
  feelsLike?: number;
  icon: string;
  text: string;
  humidity?: number;
  windDir?: string;
  windScale?: string | number;
  precip?: number;
  pressure?: number;
  vis?: number;
  cloud?: number;
}
/** 逐小时预报中的一小时。 */
interface HourlyWeather {
  /** ISO 时间，如 2026-08-17T15:00+08:00。 */
  time: string;
  temp: number;
  icon: string;
  text: string;
  /** 降水概率 0-1。 */
  pop: number;
  precip?: number;
  humidity?: number;
  windDir?: string;
  windScale?: string | number;
}
/** 逐日预报中的一天。 */
interface DailyWeather {
  date: string;
  tempMax: number;
  tempMin: number;
  iconDay: string;
  textDay: string;
  iconNight?: string;
  textNight?: string;
  sunrise?: string;
  sunset?: string;
  moonPhase?: string;
  /** 白天降水概率 0-1。 */
  pop?: number;
}
/** 天气预警。 */
interface WeatherAlert {
  id: string;
  sender?: string;
  pubTime?: string;
  headline: string;
  typeName?: string;
  /** v1 API 的严重程度：minor(蓝) / moderate(黄) / severe(橙) / extreme(红)。 */
  severity: string;
  /** 预警颜色代码：blue / yellow / orange / red。 */
  color: string;
  text?: string;
  instruction?: string;
}
/** 实时空气质量（取中文标准 AQI，cn-mee）。 */
interface AirNow {
  aqi: number;
  category?: string;
  level?: string;
  pm2p5?: number;
  pm10?: number;
  no2?: number;
  so2?: number;
  co?: number;
  o3?: number;
  primary?: string;
}
/** 一次完整的天气数据包：卡片与 LLM 文本都从这里生成。 */
interface WeatherBundle {
  place: Place;
  /** 数据接收时间（v1 接口不返回服务端 updateTime，用本地接收时间）。 */
  receivedAt: string;
  now?: NowWeather;
  hours?: HourlyWeather[];
  days?: DailyWeather[];
  alerts?: WeatherAlert[];
  air?: AirNow;
}
/** 黄色及以上（含橙、红）才算「重要预警」；蓝色与未知级别被过滤。 */
declare function isYellowOrAbove(alert: Pick<WeatherAlert, 'severity' | 'color'>): boolean;
/** 预警展示颜色（未知级别用灰色兜底）。 */
declare function warningColor(alert: Pick<WeatherAlert, 'color'>): string;
/** ISO 时间 → 「15:00」式小时标签（按本地时区显示）。 */
declare function hourLabel(iso: string): string;
/** ISO 时间 → 「2026-08-17 15:02」（按本地时区显示）。 */
declare function localDateTime(iso: string): string;
/** ISO 时间 → 「8/17」式日期标签。 */
declare function dayLabel(iso: string): string;
/** 数字 → 最多一位小数的字符串（30.0 → "30"）。 */
declare function round1(n: number): string;
/** 百分比 0-1 → 整数百分比文本。 */
declare function percent(n: number): string;
/** 工具名（客户端 toolview 槽位以工具名为键）。 */
declare const WEATHER_TOOL_NAME = "qweather_weather";
declare const CARD_TOOL_NAME = "qweather_card";
/** qweather_card 工具写入持久化 meta 的判别字段（客户端 toolview 槽位同键）。 */
declare const CARD_META_KIND = "qweather-card";
/** 卡片 meta（客户端据此回放渲染，与 src/tools.ts 的声明保持一致）。 */
interface QWeatherCardMeta {
  kind: typeof CARD_META_KIND;
  fragment: string;
  title: string;
  location: string;
  updateTime: string;
}
/** 从持久化 meta 中窄化出卡片 meta（结构不符返回 undefined）。 */
declare function qweatherCardMetaFrom(meta: unknown): QWeatherCardMeta | undefined;
/** 「东城 · 北京 · 北京市」式完整地名。 */
declare function placeLabel(place: Place): string;
//#endregion
//#region src/tools.d.ts
/** 工具运行时读取的插件配置（来自设置命名空间的实时值）。 */
interface QWeatherRuntimeConfig {
  enabled: boolean;
  apiHost?: string;
  apiKey?: string;
  location?: string;
}
/**
 * 子功能 2：qweather_weather —— 给 LLM 用的天气查询接口。
 * LLM 回答用户天气问题时调用：自动按 range/fields 选择对应 API。
 */
declare function weatherTool(ctx: Context, getConfig: () => QWeatherRuntimeConfig): ToolDefinition;
/**
 * 子功能 3：qweather_card —— 把天气数据画成对话内交互式 HTML 卡片。
 * 卡片 HTML 由插件生成（而非模型手写），保证结构正确、可回放。
 */
declare function cardTool(ctx: Context, getConfig: () => QWeatherRuntimeConfig): ToolDefinition;
//#endregion
//#region src/qweather/card.d.ts
/**
 * 气温曲线（新拟态 + 玻璃拟态混合，直接作用于曲线本体）：
 * - 渐变面积（天蓝→透明）+ 描边渐变折线（浅天蓝→鲜艳橙，暗色微调）+ 辉光；
 * - 折线下垫一层半透明宽投影（右下深色）、上叠一条细高光脊（左上亮色），
 *   形成“浮起的玻璃棱线”；
 * - 描点 = 玻璃凸起圆钮（径向高光 + 外环光晕 + 投影）；
 * - 描点/标签按百分比绝对定位（HTML），任意卡片宽度下文字不变形，
 *   x 与上方 5 列小时格中心对齐；温度单位 ℃，只标注在曲线上。
 */
declare function tempChartSvg(hours: readonly HourlyWeather[]): string;
/** 组装一张完整的天气卡片 fragment。 */
declare function buildCardFragment(bundle: WeatherBundle, hourCount?: number): string;
/** 卡片字节数（工具结果里向模型报告）。 */
declare function byteLength(text: string): number;
//#endregion
//#region src/qweather/format.d.ts
/** 时间区间：实时 / 小时预报 / 日预报。 */
type WeatherRange = 'now' | 'hours' | 'days';
/** 用户关心的信息类别（可组合）。 */
type WeatherField = 'condition' | 'temp' | 'humidity' | 'wind' | 'precipitation' | 'air' | 'warnings' | 'astro';
/** 解析 fields 参数：逗号/空格分隔的 token；unknown / summary / all 归一化。 */
declare function parseFields(raw: string | undefined): Set<WeatherField>;
/** ISO 时间 → 「2026-08-17 15:02」（本地时区）。 */
declare function formatUpdateTime(iso: string): string;
/** 生成模型可读的天气摘要文本。 */
declare function buildWeatherText(bundle: WeatherBundle, range: WeatherRange, fields: Set<WeatherField>): string;
//#endregion
//#region src/qweather/api.d.ts
/** 默认 API Host（和风公共域名，逐步由专属 API Host 取代）。 */
declare const DEFAULT_API_HOST = "https://devapi.qweather.com";
/** API 错误：携带 HTTP 状态码与可读信息。 */
declare class QWeatherApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string);
}
interface QWeatherClientOptions {
  /** API Host，默认 https://devapi.qweather.com。 */
  apiHost?: string;
  /** API KEY（控制台 → 项目和凭据）。 */
  apiKey: string;
  /** 可注入的 fetch（测试用）。 */
  fetchImpl?: typeof fetch;
  /** 取消信号。 */
  signal?: AbortSignal;
}
declare class QWeatherClient {
  readonly apiHost: string;
  readonly apiKey: string;
  private readonly fetchImpl;
  private readonly signal?;
  constructor(options: QWeatherClientOptions);
  /** 发起一个 GET 请求并解析 JSON（自动处理 gzip、错误码与超时）。 */
  request(path: string, params?: Record<string, string | number | boolean>, base?: string, timeoutMs?: number): Promise<any>;
  /** 城市搜索：支持名称 / LocationID / "经度,纬度"。 */
  geocode(query: string): Promise<Place[]>;
  private parsePlaces;
  /** 实时天气。 */
  current(lat: number, lon: number): Promise<NowWeather>;
  /** 逐小时预报（1-240 小时）。 */
  hourly(lat: number, lon: number, hours: number): Promise<HourlyWeather[]>;
  /** 逐日预报（1-10 天）。 */
  daily(lat: number, lon: number, days: number): Promise<DailyWeather[]>;
  /** 实时预警（黄色及以上由调用方用 isYellowOrAbove 过滤）。 */
  alerts(lat: number, lon: number): Promise<WeatherAlert[]>;
  /** 实时空气质量（优先中文标准 cn-mee）。 */
  air(lat: number, lon: number): Promise<AirNow | undefined>;
  /**
   * 把任意位置输入解析成一个地理实体：
   * 支持 "经度,纬度"、LocationID、以及城市 / 区县名称（取第一个结果）。
   */
  resolvePlace(query: string): Promise<Place>;
}
//#endregion
//#region src/qweather/icons.d.ts
/**
 * 内置天气图标（自绘、MIT、无网络依赖）。设计要点：
 * - 填充式 + 双色纵向渐变（顶部高光 → 底部深色）+ 向下偏移的深色投影，浮起立体感；
 * - 缩放统一用 centered() 变换（translate(cx,cy) scale(s) translate(-12,-12)），
 *   太阳本体永远位于光芒正中，月牙完整居中不越界；
 * - 雨滴/雪花缩小并放在云朵下方；雪花用灰色与白色云体区分；
 * - 霾/扬沙/浮尘/沙尘暴 分属 haze / dust / sandstorm 三种图样；
 * - 热/冷 使用温度计图样（橙红 / 冰蓝渐变），不再用云朵。
 */
type IconKind = 'sun' | 'moon' | 'partly' | 'partly-night' | 'cloudy' | 'rain' | 'heavy-rain' | 'thunder' | 'sleet' | 'snow' | 'fog' | 'haze' | 'dust' | 'sandstorm' | 'hot' | 'cold' | 'unknown';
/** 组装成最终 svg。 */
declare function weatherIcon(code: string, size?: number, uid?: string): string;
/**
 * condition code → 图标归类。
 * 100=晴、15x=夜间、30x/35x=雨、302-304=雷、40x=雪、404-406/456=雨夹雪、
 * 500-501/509-515=雾、502/511-513=霾、503-504=扬沙/浮尘、507-508=沙尘暴、
 * 900=热、901=冷。
 */
declare function iconKindOf(code: string): IconKind;
//#endregion
//#region src/index.d.ts
/** Cordis 插件名。 */
declare const name = "dsh-qweather";
/** 依赖服务：工具注册表、技能注册表（设置命名空间在 apply 内按需注入）。 */
declare const inject: string[];
/** 设置命名空间（客户端设置卡片用同一命名空间读写）。 */
declare const QWEATHER_NS: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/**
 * 部署配置 = 设置卡片的 schema。
 * apiKey 为普通字符串（便于设置卡片回读显示）；密钥保存在本机设置文件中。
 * 如需更严格的密钥管理，可升级为 credentials 域 + role('secret')（见 README「升级路线」）。
 */
interface Config {
  /** 总开关：一键控制侧边栏组件与两个 LLM 工具。 */
  enabled: boolean;
  /** API Host（控制台 → 设置 → API Host；留空用公共域名）。 */
  apiHost: string;
  /** API KEY（控制台 → 项目和凭据）。 */
  apiKey: string;
  /** 项目 ID（仅记录，请求认证用不到；保留给未来 JWT 认证）。 */
  projectId: string;
  /** 定位方式：auto=浏览器自动定位到市/区级，manual=手动输入。 */
  locationMode: 'auto' | 'manual';
  /** 手动位置 / 自动定位失败时的兜底位置（名称、LocationID 或“经度,纬度”）。 */
  location: string;
  /** 浏览器自动定位解析出的 LocationID（由侧边栏组件写回，LLM 工具直接复用）。 */
  autoLocationId: string;
  /** 自动定位解析出的位置名称（仅展示用）。 */
  autoLocationName: string;
}
/** Schemastery 校验的配置 schema（Loader 用它合并默认值）。 */
declare const Config: z<Config>;
/**
 * 注册设置命名空间与两个工具。
 * 设置可能不存在（极简部署），installSettingsSection 会自动降级为只读静态配置。
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { CARD_META_KIND, CARD_TOOL_NAME, Config, DEFAULT_API_HOST, QWEATHER_NS, QWeatherApiError, type QWeatherCardMeta, QWeatherClient, type QWeatherRuntimeConfig, WEATHER_TOOL_NAME, apply, buildCardFragment, buildWeatherText, byteLength, cardTool, dayLabel, formatUpdateTime, hourLabel, iconKindOf, inject, isYellowOrAbove, localDateTime, name, parseFields, percent, placeLabel, qweatherCardMetaFrom, round1, tempChartSvg, warningColor, weatherIcon, weatherTool };