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
export type QWeatherErrorCode =
  /** 插件总开关已关闭。 */
  | 'QW_DISABLED'
  /** 未配置 API KEY。 */
  | 'QW_NO_API_KEY'
  /** 未指定位置（参数与设置都为空）。 */
  | 'QW_NO_LOCATION'
  /** 城市搜索无结果。 */
  | 'QW_LOCATION_NOT_FOUND'
  /** 浏览器定位不可用。 */
  | 'QW_GEOCODE_UNAVAILABLE'
  /** API Host 非法。 */
  | 'QW_BAD_HOST'
  /** 本地网络失败。 */
  | 'QW_NETWORK'
  /** 请求超时。 */
  | 'QW_TIMEOUT'
  /** 请求被调用方取消。 */
  | 'QW_CANCELLED'
  /** 上游返回非 2xx HTTP 状态。 */
  | 'QW_HTTP_ERROR'
  /** 上游返回业务错误码（GeoAPI envelope code != 200）。 */
  | 'QW_UPSTREAM_ERROR'
  /** 上游响应无法解析为 JSON。 */
  | 'QW_BAD_RESPONSE'
  /** 本地请求不合法（体积超限 / 非 JSON 对象 / schema 校验失败）。 */
  | 'QW_BAD_REQUEST'
  /** 跨源请求被拒绝。 */
  | 'QW_FORBIDDEN'
  /** 设置服务不可用。 */
  | 'QW_SETTINGS_UNAVAILABLE'
  /** 插件内部未知错误。 */
  | 'QW_INTERNAL'

/** 错误分类（用于告警路由与统计）。 */
export type QWeatherErrorCategory =
  | 'config' // 用户配置问题：开关、密钥、位置、Host
  | 'input' // 调用入参问题
  | 'permission' // 权限 / 同源拒绝
  | 'network' // 本地网络 / 超时 / 取消
  | 'upstream' // 和风天气侧错误
  | 'internal' // 插件自身缺陷

/** 一条错误码的完整说明。 */
export interface QWeatherErrorInfo {
  code: QWeatherErrorCode
  category: QWeatherErrorCategory
  /** 是否值得自动重试（网络抖动、超时、上游 5xx 等）。 */
  retryable: boolean
  /** 面向用户的修复建议。 */
  hint: string
}

/** 全部错误码的权威目录（新增错误码在此登记）。 */
export const ERROR_CATALOG: Readonly<Record<QWeatherErrorCode, QWeatherErrorInfo>> = {
  QW_DISABLED: {
    code: 'QW_DISABLED', category: 'config', retryable: false,
    hint: '到 设置 → 插件 → 和风天气 打开总开关',
  },
  QW_NO_API_KEY: {
    code: 'QW_NO_API_KEY', category: 'config', retryable: false,
    hint: '到 设置 → 插件 → 和风天气 填写 API KEY',
  },
  QW_NO_LOCATION: {
    code: 'QW_NO_LOCATION', category: 'input', retryable: false,
    hint: '传入 location 参数，或到设置里配置默认位置',
  },
  QW_LOCATION_NOT_FOUND: {
    code: 'QW_LOCATION_NOT_FOUND', category: 'input', retryable: false,
    hint: '改用更精确的名称（如“北京 海淀”）、LocationID 或「经度,纬度」',
  },
  QW_GEOCODE_UNAVAILABLE: {
    code: 'QW_GEOCODE_UNAVAILABLE', category: 'config', retryable: false,
    hint: '当前环境不支持浏览器定位，请改用手动位置',
  },
  QW_BAD_HOST: {
    code: 'QW_BAD_HOST', category: 'config', retryable: false,
    hint: 'API Host 必须是 http(s) 开头的合法域名',
  },
  QW_NETWORK: {
    code: 'QW_NETWORK', category: 'network', retryable: true,
    hint: '检查网络连接，或稍后重试',
  },
  QW_TIMEOUT: {
    code: 'QW_TIMEOUT', category: 'network', retryable: true,
    hint: '请求超时，请稍后重试',
  },
  QW_CANCELLED: {
    code: 'QW_CANCELLED', category: 'network', retryable: false,
    hint: '请求已被取消',
  },
  QW_HTTP_ERROR: {
    code: 'QW_HTTP_ERROR', category: 'upstream', retryable: true,
    hint: '检查 API Host / KEY 是否正确，或稍后重试',
  },
  QW_UPSTREAM_ERROR: {
    code: 'QW_UPSTREAM_ERROR', category: 'upstream', retryable: false,
    hint: '和风天气 API 返回业务错误码，请核对请求参数',
  },
  QW_BAD_RESPONSE: {
    code: 'QW_BAD_RESPONSE', category: 'upstream', retryable: true,
    hint: '和风天气返回了无法解析的响应，请稍后重试',
  },
  QW_BAD_REQUEST: {
    code: 'QW_BAD_REQUEST', category: 'input', retryable: false,
    hint: '请求体不合法或超过大小限制',
  },
  QW_FORBIDDEN: {
    code: 'QW_FORBIDDEN', category: 'permission', retryable: false,
    hint: '跨源请求被拒绝',
  },
  QW_SETTINGS_UNAVAILABLE: {
    code: 'QW_SETTINGS_UNAVAILABLE', category: 'internal', retryable: false,
    hint: '设置服务不可用，无法保存配置',
  },
  QW_INTERNAL: {
    code: 'QW_INTERNAL', category: 'internal', retryable: false,
    hint: '插件内部错误，请查看日志',
  },
}

export interface QWeatherErrorOptions {
  /** 原始异常（日志里用做 cause，便于追根因）。 */
  cause?: unknown
  /** 覆盖目录里的修复建议。 */
  hint?: string
  /** 覆盖目录里的可重试性。 */
  retryable?: boolean
}

/** 插件统一错误基类：必带稳定错误码。 */
export class QWeatherError extends Error {
  readonly code: QWeatherErrorCode
  readonly category: QWeatherErrorCategory
  readonly retryable: boolean
  readonly hint: string
  override readonly cause?: unknown

  constructor(code: QWeatherErrorCode, message?: string, options: QWeatherErrorOptions = {}) {
    const info = ERROR_CATALOG[code]
    super(message ?? info.hint)
    this.name = 'QWeatherError'
    this.code = code
    this.category = info.category
    this.retryable = options.retryable ?? info.retryable
    this.hint = options.hint ?? info.hint
    if (options.cause !== undefined) this.cause = options.cause
  }
}

/** 携带 HTTP 状态码的 API 错误（network / upstream 类别）。 */
export class QWeatherApiError extends QWeatherError {
  /** HTTP 状态码；0 表示非 HTTP 层失败（网络 / 超时 / 取消）。 */
  readonly status: number

  constructor(status: number, code: QWeatherErrorCode, message?: string, options?: QWeatherErrorOptions) {
    super(code, message, options)
    this.name = 'QWeatherApiError'
    this.status = status
  }
}

/** 是否为插件统一错误。 */
export function isQWeatherError(error: unknown): error is QWeatherError {
  return error instanceof QWeatherError
}

/**
 * 从任意值中提取错误码（跨 realm / 反序列化后的对象也可识别）。
 * 无法识别时返回 'UNKNOWN'。
 */
export function errorCodeOf(error: unknown): QWeatherErrorCode | 'UNKNOWN' {
  if (error instanceof QWeatherError) return error.code
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string' && code in ERROR_CATALOG) return code as QWeatherErrorCode
  return 'UNKNOWN'
}

/** 把任意异常归一化成 QWeatherError（不改变已有 QWeatherError）。 */
export function toQWeatherError(error: unknown): QWeatherError {
  if (error instanceof QWeatherError) return error
  if (error instanceof Error) return new QWeatherError('QW_INTERNAL', error.message, { cause: error })
  return new QWeatherError('QW_INTERNAL', String(error))
}
