import z from "@deepseek-ai/schemastery";
import { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { Context } from "@deepseek-ai/cordis";
//#region src/qweather/log.d.ts
/**
 * dsh-qweather 轻量日志器：分级 + 命名空间 + 密钥脱敏。
 *
 * 设计目标（三端共享：node / browser / vitest，零依赖）：
 * - 默认级别 warn：正常运行静默，只打印问题，避免刷屏；
 * - 用环境变量 QW_LOG_LEVEL 覆盖（debug|info|warn|error|silent），
 *   排查问题时设为 debug 即可看到每次 API 请求与耗时；
 * - 所有结构化附加数据先经过 redact()：key/token/secret/password 等
 *   敏感字段的值一律替换为 [redacted]，杜绝把 API KEY 写进日志；
 * - 通过 createLogger(namespace) 派生带前缀的子 logger，日志行形如
 *   `[qweather:api] request ...`，便于按模块过滤。
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
/** 全局调整日志级别（如设置页 / 测试中调用）。 */
declare function setLogLevel(level: LogLevel): void;
/** 读取当前全局日志级别。 */
declare function getLogLevel(): LogLevel;
/**
 * 递归脱敏：对象里命中 SECRET_KEY 的键值替换为 [redacted]。
 * 只处理普通对象 / 数组 / 原始值，不追踪循环引用（超出深度直接截断）。
 */
declare function redact(value: unknown, depth?: number): unknown;
/** 日志输出槽（默认 console；测试可注入内存槽）。 */
interface LogSink {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}
/** 带命名空间前缀的分级 logger。 */
interface Logger {
  readonly namespace: string;
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
  /** 派生子 logger（namespace 追加 :scope）。 */
  child(scope: string): Logger;
}
declare function createLogger(namespace: string, options?: {
  level?: LogLevel;
  sink?: LogSink;
}): Logger;
//#endregion
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
  /** 风向角度（0-360，正北为 0，顺时针）；用于绘制风向箭头。 */
  windDegree?: number;
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
  moonrise?: string;
  moonset?: string;
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
/** 天气指数（生活指数，如穿衣 / 运动 / 紫外线）。 */
interface WeatherIndex {
  /** 指数类型编码，如 "1"=运动、"3"=穿衣、"5"=紫外线。 */
  type: string;
  /** 指数名称，如「运动指数」。 */
  name: string;
  /** 等级数字，如 "1"。 */
  level?: string;
  /** 等级描述，如「适宜」「强」。 */
  category?: string;
  /** 建议文案。 */
  text?: string;
  date?: string;
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
  indices?: WeatherIndex[];
}
/** 展示阈值下调至蓝色：蓝/黄/橙/红均展示，仅未知级别（无法识别的 severity/color）被过滤。 */
declare function shouldShowAlert(alert: Pick<WeatherAlert, 'severity' | 'color'>): boolean;
/** 预警展示颜色（未知级别用灰色兜底）。 */
declare function warningColor(alert: Pick<WeatherAlert, 'color'>): string;
/** 预警简要标题：仅「某类某色预警」（如「雷电蓝色预警」），不罗列正文与防御指引。 */
declare function alertHeadline(alert: WeatherAlert): string;
/** 指数名称去掉「指数」后缀，用于紧凑展示（「穿衣指数」→「穿衣」）。 */
declare function indexLabel(name: string): string;
/** 风级 → 数字文本（缺省返回空串）。 */
declare function windScaleLabel(scale: string | number | undefined): string;
/** 从 API 返回的指数中取前三个，避免指数区超限换行溢出。 */
declare function curateIndices(indices: readonly WeatherIndex[]): WeatherIndex[];
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
declare function weatherTool(ctx: Context, getConfig: () => QWeatherRuntimeConfig, logger?: Logger): ToolDefinition;
/**
 * 子功能 3：qweather_card —— 把天气数据画成对话内交互式 HTML 卡片。
 * 卡片 HTML 由插件生成（而非模型手写），保证结构正确、可回放。
 */
declare function cardTool(ctx: Context, getConfig: () => QWeatherRuntimeConfig, logger?: Logger): ToolDefinition;
//#endregion
//#region src/qweather/card.d.ts
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
//#region src/qweather/errors.d.ts
/**
 * dsh-qweather 统一错误模型。
 *
 * 目标：插件对外抛出的每一个错误都携带一个稳定、可检索的机器错误码
 * （QWeatherErrorCode），并附上「分类 / 是否可重试 / 修复提示」三要素，
 * 便于日志检索、监控告警与自动重试判定。三端共享（node / browser / vitest），
 * 零依赖，不引用 DOM / Node 专有对象。
 *
 * 约定：
 * - 面向用户的文案仍写在抛错处（message），错误码只做机器判别；
 * - 日志里统一打印 `code`（见 log.ts），不要只依赖 message 文本；
 * - 新增错误码时先补 ERROR_CATALOG 条目，再在代码中引用，禁止散落魔法字符串。
 */
/** 稳定错误码。 */
type QWeatherErrorCode =
/** 插件总开关已关闭。 */
'QW_DISABLED' |
/** 未配置 API KEY。 */
'QW_NO_API_KEY' |
/** 未指定位置（参数与设置都为空）。 */
'QW_NO_LOCATION' |
/** 城市搜索无结果。 */
'QW_LOCATION_NOT_FOUND' |
/** 浏览器定位不可用。 */
'QW_GEOCODE_UNAVAILABLE' |
/** API Host 非法。 */
'QW_BAD_HOST' |
/** 本地网络失败。 */
'QW_NETWORK' |
/** 请求超时。 */
'QW_TIMEOUT' |
/** 请求被调用方取消。 */
'QW_CANCELLED' |
/** 上游返回非 2xx HTTP 状态。 */
'QW_HTTP_ERROR' |
/** 上游返回业务错误码（GeoAPI envelope code != 200）。 */
'QW_UPSTREAM_ERROR' |
/** 上游响应无法解析为 JSON。 */
'QW_BAD_RESPONSE' |
/** 本地请求不合法（体积超限 / 非 JSON 对象 / schema 校验失败）。 */
'QW_BAD_REQUEST' |
/** 跨源请求被拒绝。 */
'QW_FORBIDDEN' |
/** 设置服务不可用。 */
'QW_SETTINGS_UNAVAILABLE' |
/** 插件内部未知错误。 */
'QW_INTERNAL';
/** 错误分类（用于告警路由与统计）。 */
type QWeatherErrorCategory = 'config' | 'input' | 'permission' | 'network' | 'upstream' | 'internal';
/** 一条错误码的完整说明。 */
interface QWeatherErrorInfo {
  code: QWeatherErrorCode;
  category: QWeatherErrorCategory;
  /** 是否值得自动重试（网络抖动、超时、上游 5xx 等）。 */
  retryable: boolean;
  /** 面向用户的修复建议。 */
  hint: string;
}
/** 全部错误码的权威目录（新增错误码在此登记）。 */
declare const ERROR_CATALOG: Readonly<Record<QWeatherErrorCode, QWeatherErrorInfo>>;
interface QWeatherErrorOptions {
  /** 原始异常（日志里用做 cause，便于追根因）。 */
  cause?: unknown;
  /** 覆盖目录里的修复建议。 */
  hint?: string;
  /** 覆盖目录里的可重试性。 */
  retryable?: boolean;
}
/** 插件统一错误基类：必带稳定错误码。 */
declare class QWeatherError extends Error {
  readonly code: QWeatherErrorCode;
  readonly category: QWeatherErrorCategory;
  readonly retryable: boolean;
  readonly hint: string;
  readonly cause?: unknown;
  constructor(code: QWeatherErrorCode, message?: string, options?: QWeatherErrorOptions);
}
/** 携带 HTTP 状态码的 API 错误（network / upstream 类别）。 */
declare class QWeatherApiError extends QWeatherError {
  /** HTTP 状态码；0 表示非 HTTP 层失败（网络 / 超时 / 取消）。 */
  readonly status: number;
  constructor(status: number, code: QWeatherErrorCode, message?: string, options?: QWeatherErrorOptions);
}
/** 是否为插件统一错误。 */
declare function isQWeatherError(error: unknown): error is QWeatherError;
/**
 * 从任意值中提取错误码（跨 realm / 反序列化后的对象也可识别）。
 * 无法识别时返回 'UNKNOWN'。
 */
declare function errorCodeOf(error: unknown): QWeatherErrorCode | 'UNKNOWN';
/** 把任意异常归一化成 QWeatherError（不改变已有 QWeatherError）。 */
declare function toQWeatherError(error: unknown): QWeatherError;
//#endregion
//#region src/qweather/api.d.ts
/** 默认 API Host（和风公共域名，逐步由专属 API Host 取代）。 */
declare const DEFAULT_API_HOST = "https://devapi.qweather.com";
interface QWeatherClientOptions {
  /** API Host，默认 https://devapi.qweather.com。 */
  apiHost?: string;
  /** API KEY（控制台 → 项目和凭据）。 */
  apiKey: string;
  /** 可注入的 fetch（测试用）。 */
  fetchImpl?: typeof fetch;
  /** 取消信号。 */
  signal?: AbortSignal;
  /** 单次请求超时（毫秒）。 */
  timeoutMs?: number;
  /** 日志器（缺省 'qweather:api'，可注入静默 / 内存槽用于测试）。 */
  logger?: Logger;
}
declare class QWeatherClient {
  readonly apiHost: string;
  readonly apiKey: string;
  private readonly fetchImpl;
  private readonly signal?;
  private readonly timeoutMs;
  private readonly log;
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
  /** 实时预警（蓝色及以上由调用方用 shouldShowAlert 过滤）。 */
  alerts(lat: number, lon: number): Promise<WeatherAlert[]>;
  /** 实时空气质量（优先中文标准 cn-mee）。 */
  air(lat: number, lon: number): Promise<AirNow | undefined>;
  /** 天气指数（生活指数）：type=0 拉全部类型，1 天。 */
  indices(lat: number, lon: number): Promise<WeatherIndex[]>;
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
/**
 * 风向箭头：上指为北（0°），顺时针旋转 degree 度，即箭头指向风吹来的方向。
 * 使用 SVG transform 属性（rotate(angle cx cy)）绕视图中心旋转，避免 CSS
 * transform-origin 在不同浏览器下解析不一致导致箭头被甩出小时格。
 */
declare function windArrow(degree: number | undefined, size?: number): string;
/** 小雨滴图标（用于标注降水概率指标）。 */
declare function raindropIcon(size?: number): string;
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
 * 注册设置命名空间、HTTP 配置接口与两个工具。
 *
 * 配置分层：
 * - 宿主：注册 qweather settings 命名空间（LLM 工具从 current() 实时读取）；
 * - Web 客户端：官方设置 RPC 不向第三方命名空间开放（settings-not-exposed），
 *   因此通过插件自带的同源 HTTP 接口 GET/POST /dsh-qweather/config 读写，
 *   写入走命名空间 scope.update，持久化到 settings.yaml；
 * - 极简部署（无 settings 服务）自动降级为只读静态 config。
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { CARD_META_KIND, CARD_TOOL_NAME, Config, DEFAULT_API_HOST, ERROR_CATALOG, type LogLevel, type LogSink, type Logger, QWEATHER_NS, QWeatherApiError, type QWeatherCardMeta, QWeatherClient, QWeatherError, type QWeatherErrorCategory, type QWeatherErrorCode, type QWeatherErrorInfo, type QWeatherErrorOptions, type QWeatherRuntimeConfig, WEATHER_TOOL_NAME, type WeatherIndex, alertHeadline, apply, buildCardFragment, buildWeatherText, byteLength, cardTool, createLogger, curateIndices, dayLabel, errorCodeOf, formatUpdateTime, getLogLevel, hourLabel, iconKindOf, indexLabel, inject, isQWeatherError, localDateTime, name, parseFields, percent, placeLabel, qweatherCardMetaFrom, raindropIcon, redact, round1, setLogLevel, shouldShowAlert, toQWeatherError, warningColor, weatherIcon, weatherTool, windArrow, windScaleLabel };