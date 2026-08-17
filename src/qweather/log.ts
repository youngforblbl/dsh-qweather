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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
}

/** 命中即脱敏的键名（大小写不敏感）。 */
const SECRET_KEY = /(?:api[_-]?key|token|secret|password|credential|authorization)/iu

/** 从环境变量解析默认级别（浏览器无 process 时静默回退 warn）。 */
function envLevel(): LogLevel {
  try {
    const process = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    const raw = process?.env?.QW_LOG_LEVEL
    if (raw !== undefined && raw in LEVEL_WEIGHT) return raw as LogLevel
  } catch {
    /* ignore */
  }
  return 'warn'
}

let globalLevel: LogLevel = envLevel()

/** 全局调整日志级别（如设置页 / 测试中调用）。 */
export function setLogLevel(level: LogLevel): void {
  globalLevel = level
}

/** 读取当前全局日志级别。 */
export function getLogLevel(): LogLevel {
  return globalLevel
}

/**
 * 递归脱敏：对象里命中 SECRET_KEY 的键值替换为 [redacted]。
 * 只处理普通对象 / 数组 / 原始值，不追踪循环引用（超出深度直接截断）。
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[max-depth]'
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)
    }
    return out
  }
  return value
}

/** 日志输出槽（默认 console；测试可注入内存槽）。 */
export interface LogSink {
  debug(message: string, extra?: unknown): void
  info(message: string, extra?: unknown): void
  warn(message: string, extra?: unknown): void
  error(message: string, extra?: unknown): void
}

/** 默认 console 槽（环境无 console 时退化为 no-op，保证模块永不抛错）。 */
const defaultSink: LogSink = (() => {
  const consoleLike = (globalThis as { console?: Partial<Console> }).console
  const pick = (name: 'debug' | 'info' | 'warn' | 'error') =>
    (message: string, extra?: unknown): void => {
      const fn = consoleLike?.[name] as ((...args: unknown[]) => void) | undefined
      if (fn === undefined) return
      if (extra === undefined) fn(message)
      else fn(message, extra)
    }
  return { debug: pick('debug'), info: pick('info'), warn: pick('warn'), error: pick('error') }
})()

/** 带命名空间前缀的分级 logger。 */
export interface Logger {
  readonly namespace: string
  debug(message: string, extra?: unknown): void
  info(message: string, extra?: unknown): void
  warn(message: string, extra?: unknown): void
  error(message: string, extra?: unknown): void
  /** 派生子 logger（namespace 追加 :scope）。 */
  child(scope: string): Logger
}

/**
 * 创建一个 logger。
 * @param namespace 命名空间（如 'qweather:api'）
 * @param options.level 本实例级别（缺省跟随全局 setLogLevel / QW_LOG_LEVEL）
 * @param options.sink 输出槽（缺省 console）
 */
/** 可写出的日志方法（silent 仅作阈值，不是方法）。 */
type LogMethod = 'debug' | 'info' | 'warn' | 'error'

export function createLogger(namespace: string, options: { level?: LogLevel; sink?: LogSink } = {}): Logger {
  const sink = options.sink ?? defaultSink
  const write = (level: LogMethod, message: string, extra?: unknown): void => {
    const effective = options.level ?? globalLevel
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[effective]) return
    const prefixed = `[${namespace}] ${message}`
    if (extra === undefined) sink[level](prefixed)
    else sink[level](prefixed, redact(extra))
  }
  return {
    namespace,
    debug: (m, e) => write('debug', m, e),
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
    child: (scope) => createLogger(`${namespace}:${scope}`, { level: options.level, sink }),
  }
}
