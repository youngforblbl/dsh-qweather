/**
 * 主机端工具定义：qweather_weather（查天气数据给 LLM）与 qweather_card
 * （把天气渲染成对话内卡片）。两个工具都直接调用和风天气 API，配置从
 * 设置命名空间实时读取（用户改设置无需重启）。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type JsonValue, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { QWeatherClient } from './qweather/api.ts'
import { QWeatherError, errorCodeOf, toQWeatherError } from './qweather/errors.ts'
import { createLogger, type Logger } from './qweather/log.ts'
import { buildWeatherText, parseFields, type WeatherField, type WeatherRange } from './qweather/format.ts'
import { buildCardFragment, byteLength } from './qweather/card.ts'
import type { WeatherBundle } from './qweather/types.ts'
import {
  CARD_META_KIND, CARD_TOOL_NAME, placeLabel, qweatherCardMetaFrom, WEATHER_TOOL_NAME,
} from './qweather/types.ts'

// 工具名 / meta 判别字段 / 窄化函数放在共享纯模块 types.ts（客户端同样使用）。
export { CARD_META_KIND, CARD_TOOL_NAME, qweatherCardMetaFrom, WEATHER_TOOL_NAME }
export type { QWeatherCardMeta } from './qweather/types.ts'

/** 工具运行时读取的插件配置（来自设置命名空间的实时值）。 */
export interface QWeatherRuntimeConfig {
  enabled: boolean
  apiHost?: string
  apiKey?: string
  location?: string
}

/** 用当前配置构造 API 客户端；主开关关闭 / 未配置密钥时给出明确指引（带错误码）。 */
function clientFrom(config: QWeatherRuntimeConfig, signal: AbortSignal | undefined, logger: Logger): QWeatherClient {
  if (!config.enabled) {
    throw new QWeatherError('QW_DISABLED', '和风天气插件已在设置中被关闭：请到 设置 → 插件 → 和风天气 打开总开关')
  }
  const apiKey = config.apiKey?.trim() ?? ''
  if (apiKey.length === 0) {
    throw new QWeatherError('QW_NO_API_KEY', '尚未配置和风天气 API KEY：请到 设置 → 插件 → 和风天气 填写密钥')
  }
  return new QWeatherClient({ apiHost: config.apiHost, apiKey, signal, logger })
}

/** 解析目标位置：工具参数优先，其次设置里的默认位置。 */
function targetOf(locationArg: string | undefined, config: QWeatherRuntimeConfig): string {
  const target = locationArg?.trim() || config.location?.trim() || ''
  if (target.length === 0) throw new QWeatherError('QW_NO_LOCATION', '未指定位置：请传入 location 参数，或到设置里配置默认位置')
  return target
}

/** 归一化 hours / days 参数（超出范围取边界，非法取默认）。 */
function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** 按 range 与 fields 拉取一份天气数据包。 */
async function fetchBundle(
  client: QWeatherClient,
  place: Awaited<ReturnType<QWeatherClient['resolvePlace']>>,
  range: WeatherRange,
  rangeHours: number,
  rangeDays: number,
  fields: Set<WeatherField>,
): Promise<WeatherBundle> {
  const bundle: WeatherBundle = { place, receivedAt: new Date().toISOString() }
  if (range === 'now') bundle.now = await client.current(place.lat, place.lon)
  if (range === 'hours') bundle.hours = await client.hourly(place.lat, place.lon, rangeHours)
  if (range === 'days') bundle.days = await client.daily(place.lat, place.lon, rangeDays)
  if (fields.has('warnings')) bundle.alerts = await client.alerts(place.lat, place.lon)
  if (fields.has('air')) bundle.air = await client.air(place.lat, place.lon)
  return bundle
}

/**
 * 子功能 2：qweather_weather —— 给 LLM 用的天气查询接口。
 * LLM 回答用户天气问题时调用：自动按 range/fields 选择对应 API。
 */
export function weatherTool(ctx: Context, getConfig: () => QWeatherRuntimeConfig, logger: Logger = createLogger('qweather:tools')): ToolDefinition {
  return defineTool({
    name: WEATHER_TOOL_NAME,
    description:
      '查询和风天气（QWeather）的实时或预报数据，回答用户关于天气的问题。'
      + ' location 可缺省（默认用设置里配置的位置；支持城市/区县名称、LocationID、或“经度,纬度”）。'
      + ' range 选择时间区间：now=实时天气，hours=逐小时预报（配合 hours，1-240 小时，默认 5），days=逐日预报（配合 days，1-10 天，默认 3）。'
      + ' fields 选择关心的信息，逗号分隔：condition=天气现象, temp=气温, humidity=湿度, wind=风, precipitation=降水, air=空气质量, warnings=预警, astro=日出日落；all=全部，缺省 summary。'
      + ' 结果包含数据时间。如果用户想“看图 / 画一张天气卡片”，改用 qweather_card。',
    parameters: {
      location: {
        type: 'string',
        description: '要查询的地理位置。可缺省（使用设置里的默认位置）。支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。',
      },
      range: {
        type: 'string',
        enum: ['now', 'hours', 'days'],
        description: '希望得到的天气预测时间区间：now=实时，hours=逐小时，days=逐日。默认 now。',
      },
      hours: {
        type: 'integer',
        description: 'range=hours 时的小时数，1-240，默认 5。',
      },
      days: {
        type: 'integer',
        description: 'range=days 时的天数，1-10，默认 3。',
      },
      fields: {
        type: 'string',
        description: '期望获得的天气信息，逗号分隔：condition, temp, humidity, wind, precipitation, air, warnings, astro；all=全部；缺省 summary。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          location: { type: 'string', required: true },
          range: { type: 'string', required: true, enum: ['now', 'hours', 'days'] },
          summary: { type: 'string', required: true },
          data: { type: 'object', required: true, additionalProperties: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    // 纯只读 API 调用：并发安全。
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const log = logger.child('weather')
      const config = getConfig()
      const client = clientFrom(config, exec.signal, logger)
      const range = (args.range ?? 'now') as WeatherRange
      const fields = parseFields(args.fields)
      log.debug('execute start', { location: args.location, range, fields: [...fields] })
      const startedAt = Date.now()
      const place = await client.resolvePlace(targetOf(args.location, config))
      const bundle = await fetchBundle(
        client, place, range,
        boundedInteger(args.hours, 1, 240, 5),
        boundedInteger(args.days, 1, 10, 3),
        fields,
      )
      const summary = buildWeatherText(bundle, range, fields)
      log.debug('execute ok', { location: placeLabel(place), range, ms: Date.now() - startedAt })
      return {
        location: placeLabel(place),
        range,
        summary,
        // canonical value 必须是 lossless JSON：序列化往返一次保证 JSON 安全。
        data: JSON.parse(JSON.stringify(bundle)) as Record<string, JsonValue>,
      }
    },
    presentCall: () => ({ card: 'generic', title: '天气', kind: 'other' }),
    presentResult(args, result) {
      if (result.isError) return undefined
      const location = (args as { location?: unknown }).location
      return { card: 'generic', title: typeof location === 'string' && location.length > 0 ? '天气 · ' + location : '天气' }
    },
  })
}

/**
 * 子功能 3：qweather_card —— 把天气数据画成对话内交互式 HTML 卡片。
 * 卡片 HTML 由插件生成（而非模型手写），保证结构正确、可回放。
 */
export function cardTool(ctx: Context, getConfig: () => QWeatherRuntimeConfig, logger: Logger = createLogger('qweather:tools')): ToolDefinition {
  return defineTool({
    name: CARD_TOOL_NAME,
    description:
      '在对话中渲染一张交互式天气卡片（HTML），方便用户浏览阅读。'
      + ' location 可缺省（默认用设置里配置的位置；支持城市/区县名称、LocationID、或“经度,纬度”）。'
      + ' 卡片固定显示未来 5 小时逐小时预报（每格含气温、降水概率、风向风级），并展示当前天气、蓝色及以上预警、空气质量、日月起落、生活指数与更新时间。'
      + ' 数据实时取自和风天气，用户在对话中直接看到卡片。适合用户要求“画出来 / 展示天气卡片”的场景；纯数据问答用 qweather_weather。',
    parameters: {
      location: {
        type: 'string',
        description: '要查询的地理位置。可缺省（使用设置里的默认位置）。支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', required: true },
          location: { type: 'string', required: true },
          updateTime: { type: 'string', required: true },
          sizeBytes: { type: 'integer', required: true },
          fragment: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: '已渲染「' + value.title + '」天气卡片（' + value.sizeBytes + ' 字节）。用户已在对话中看到卡片，无需复述全部数据，直接结合卡片回答用户问题即可。',
      }],
      // 把 fragment 放进持久化 meta：会话重放时逐字节还原卡片，不依赖网络。
      presentationMeta: (_args, value) => ({
        kind: CARD_META_KIND,
        fragment: value.fragment,
        title: value.title,
        location: value.location,
        updateTime: value.updateTime,
      }),
    },
    // 纯只读 API 调用：并发安全。
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const log = logger.child('card')
      const config = getConfig()
      const client = clientFrom(config, exec.signal, logger)
      log.debug('execute start', { location: args.location })
      const startedAt = Date.now()
      const place = await client.resolvePlace(targetOf(args.location, config))
      // 卡片布局（5 列小时格）按 5 小时硬编码，固定只请求/渲染 5 小时。
      const hourCount = 5
      const [now, hours, alerts] = await Promise.all([
        client.current(place.lat, place.lon),
        client.hourly(place.lat, place.lon, hourCount),
        client.alerts(place.lat, place.lon).catch((cause) => {
          log.warn('alerts failed', { code: errorCodeOf(cause), message: toQWeatherError(cause).message })
          return []
        }),
      ])
      // 附加数据（日月起落 / 空气质量 / 生活指数）失败时优雅降级，不影响卡片主体。
      const [days, air, indices] = await Promise.all([
        client.daily(place.lat, place.lon, 1).catch(() => []),
        client.air(place.lat, place.lon).catch(() => undefined),
        client.indices(place.lat, place.lon).catch((cause) => {
          log.warn('indices failed', { code: errorCodeOf(cause), message: toQWeatherError(cause).message })
          return []
        }),
      ])
      const bundle: WeatherBundle = { place, receivedAt: new Date().toISOString(), now, hours, alerts, days, air, indices }
      const location = placeLabel(place)
      const fragment = buildCardFragment(bundle, hourCount)
      log.debug('execute ok', { location, sizeBytes: byteLength(fragment), ms: Date.now() - startedAt })
      return {
        title: location + ' 天气',
        location,
        updateTime: bundle.receivedAt,
        sizeBytes: byteLength(fragment),
        fragment,
      }
    },
    presentCall: () => ({ card: 'generic', title: '天气卡片', kind: 'other' }),
    presentResult(_args, result) {
      if (result.isError) return undefined
      const meta = qweatherCardMetaFrom(result.meta)
      if (meta === undefined) return undefined
      return { card: 'generic', title: '天气 · ' + meta.location }
    },
  })
}
