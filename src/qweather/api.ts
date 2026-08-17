/**
 * 和风天气 API 客户端（node 半端与浏览器半端共用）。
 *
 * 对接新版 Weather API v1（经纬度路径参数）与 GeoAPI v2：
 *   GET {apiHost}/weather/v1/current/{lat}/{lng}         实时天气
 *   GET {apiHost}/weather/v1/hourly/{lat}/{lng}?hours=   逐小时（1-240）
 *   GET {apiHost}/weather/v1/daily/{lat}/{lng}?days=     逐日（1-10）
 *   GET {apiHost}/weatheralert/v1/current/{lat}/{lng}    实时预警
 *   GET {apiHost}/airquality/v1/current/{lat}/{lng}      实时空气质量
 *   GET {apiHost}/geo/v2/city/lookup?location=…          城市搜索（名称 / ID / 经纬度）
 * 认证：请求头 X-QW-Api-Key（用户密钥）。
 *
 * 兼容性说明：旧公共域名 devapi.qweather.com 不提供 /geo/v2 路径，
 * 此时城市搜索自动回退到公共 GeoAPI 域名 geoapi.qweather.com/v2；
 * 用户在控制台配置了专属 API Host（*.qweatherapi.com）后，所有请求
 * 走同一域名，无需回退。
 */

import type {
  AirNow, DailyWeather, HourlyWeather, NowWeather, Place, WeatherAlert,
} from './types.ts'

/** 默认 API Host（和风公共域名，逐步由专属 API Host 取代）。 */
export const DEFAULT_API_HOST = 'https://devapi.qweather.com'
/** 旧公共 GeoAPI 域名（仅作回退）。 */
export const GEO_FALLBACK_HOST = 'https://geoapi.qweather.com'

/** API 错误：携带 HTTP 状态码与可读信息。 */
export class QWeatherApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'QWeatherApiError'
  }
}

export interface QWeatherClientOptions {
  /** API Host，默认 https://devapi.qweather.com。 */
  apiHost?: string
  /** API KEY（控制台 → 项目和凭据）。 */
  apiKey: string
  /** 可注入的 fetch（测试用）。 */
  fetchImpl?: typeof fetch
  /** 取消信号。 */
  signal?: AbortSignal
}

/** 去掉首尾空白与结尾斜杠的 API Host。 */
export function normalizeApiHost(host: string | undefined): string {
  const trimmed = (host ?? '').trim().replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : DEFAULT_API_HOST
}

/** 是否专属 API Host（*.qweatherapi.com），专属域名提供全部路径。 */
function isDedicatedHost(apiHost: string): boolean {
  return /^https:\/\/[^/]+\.qweatherapi\.com$/iu.test(apiHost)
}

/** 16 方位 compass → 中文风向（lang=zh 时接口仍可能返回英文方位，这里兜底翻译）。 */
const COMPASS_ZH: Readonly<Record<string, string>> = {
  n: '北风', nne: '北东北风', ne: '东北风', ene: '东东北风',
  e: '东风', ese: '东东南风', se: '东南风', sse: '南东南风',
  s: '南风', ssw: '南西南风', sw: '西南风', wsw: '西西南风',
  w: '西风', wnw: '西西北风', nw: '西北风', nnw: '北西北风',
}

/** compass → 中文风向；无法翻译时原样返回。 */
export function compassZh(compass: unknown): string | undefined {
  if (typeof compass !== 'string' || compass.length === 0) return undefined
  return COMPASS_ZH[compass.toLowerCase()] ?? compass
}

/**
 * 组合取消信号：外部 signal 与超时信号先到先触发。
 * 不支持的运行环境退化为外部 signal / 无超时。
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'function' || typeof AbortSignal.timeout !== 'function') return signal
  const timeout = AbortSignal.timeout(timeoutMs)
  if (signal === undefined) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout])
  return signal
}

export class QWeatherClient {
  readonly apiHost: string
  readonly apiKey: string
  private readonly fetchImpl: typeof fetch
  private readonly signal?: AbortSignal

  constructor(options: QWeatherClientOptions) {
    this.apiHost = normalizeApiHost(options.apiHost)
    this.apiKey = options.apiKey.trim()
    // 浏览器里 window.fetch 被以实例为 this 调用会抛 Illegal invocation，
    // 统一绑定到 globalThis 后调用（Node 的 fetch 无此要求，测试注入不受影响）。
    this.fetchImpl = (options.fetchImpl ?? fetch).bind(globalThis)
    this.signal = options.signal
  }

  /** 发起一个 GET 请求并解析 JSON（自动处理 gzip、错误码与超时）。 */
  async request(path: string, params: Record<string, string | number | boolean> = {}, base?: string, timeoutMs = 15_000): Promise<any> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) query.set(key, String(value))
    const url = `${base ?? this.apiHost}${path}?${query.toString()}`
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { 'X-QW-Api-Key': this.apiKey },
        signal: withTimeout(this.signal, timeoutMs),
      })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        throw new QWeatherApiError(0, '请求超时或已取消')
      }
      throw new QWeatherApiError(0, `网络错误：${cause instanceof Error ? cause.message : String(cause)}`)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new QWeatherApiError(response.status, `和风天气 API 返回 HTTP ${response.status}${body ? `：${body.slice(0, 200)}` : ''}`)
    }
    const data = (await response.json()) as any
    // GeoAPI 兼容旧 envelope：{ code: "200", location: [...] }；非 200 视为错误。
    if (typeof data?.code === 'string' && data.code !== '200') {
      throw new QWeatherApiError(Number(data.code) || 0, `和风天气 API 返回错误码 ${data.code}`)
    }
    return data
  }

  /** 城市搜索：支持名称 / LocationID / "经度,纬度"。 */
  async geocode(query: string): Promise<Place[]> {
    const params = { location: query.trim(), number: 5, lang: 'zh' }
    try {
      const data = await this.request('/geo/v2/city/lookup', params)
      return this.parsePlaces(data)
    } catch (error) {
      // 旧公共域名没有 /geo/v2 路径（404）：回退到公共 GeoAPI 域名。
      if (error instanceof QWeatherApiError && error.status === 404 && !isDedicatedHost(this.apiHost)) {
        const data = await this.request('/v2/city/lookup', params, GEO_FALLBACK_HOST)
        return this.parsePlaces(data)
      }
      throw error
    }
  }

  private parsePlaces(data: any): Place[] {
    const rows = Array.isArray(data?.location) ? data.location : []
    return rows.map((row: any) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      adm1: row.adm1 === undefined ? undefined : String(row.adm1),
      adm2: row.adm2 === undefined ? undefined : String(row.adm2),
      lat: Number(row.lat),
      lon: Number(row.lon),
    })).filter((place: Place) => place.id.length > 0 && Number.isFinite(place.lat) && Number.isFinite(place.lon))
  }

  /** 实时天气。 */
  async current(lat: number, lon: number): Promise<NowWeather> {
    const data = await this.request(`/weather/v1/current/${lat.toFixed(2)}/${lon.toFixed(2)}`, { localTime: true, lang: 'zh' })
    return {
      temp: Number(data?.temperature?.value),
      feelsLike: data?.feelsLike?.value === undefined ? undefined : Number(data.feelsLike.value),
      icon: String(data?.condition?.icon ?? '999'),
      text: String(data?.condition?.text ?? ''),
      humidity: data?.humidity === undefined ? undefined : Math.round(Number(data.humidity) * 100),
      windDir: compassZh(data?.wind?.direction?.compass),
      windScale: data?.wind?.scale,
      precip: data?.precipitation?.amount?.value === undefined ? undefined : Number(data.precipitation.amount.value),
      pressure: data?.pressure?.value === undefined ? undefined : Number(data.pressure.value),
      // 接口单位是米，展示用公里
      vis: data?.visibility?.value === undefined ? undefined : Math.round(Number(data.visibility.value) / 100) / 10,
      cloud: data?.cloudCover === undefined ? undefined : Math.round(Number(data.cloudCover) * 100),
    }
  }

  /** 逐小时预报（1-240 小时）。 */
  async hourly(lat: number, lon: number, hours: number): Promise<HourlyWeather[]> {
    const data = await this.request(`/weather/v1/hourly/${lat.toFixed(2)}/${lon.toFixed(2)}`, { hours, localTime: true, lang: 'zh' })
    return (Array.isArray(data?.hours) ? data.hours : []).map((row: any): HourlyWeather => ({
      time: String(row.forecastTime ?? ''),
      temp: Number(row?.temperature?.value),
      icon: String(row?.condition?.icon ?? '999'),
      text: String(row?.condition?.text ?? ''),
      pop: Number(row?.precipitation?.probability ?? 0),
      precip: row?.precipitation?.amount?.value === undefined ? undefined : Number(row.precipitation.amount.value),
      humidity: row?.humidity === undefined ? undefined : Math.round(Number(row.humidity) * 100),
      windDir: compassZh(row?.wind?.direction?.compass),
      windScale: row?.wind?.scale,
    }))
  }

  /** 逐日预报（1-10 天）。 */
  async daily(lat: number, lon: number, days: number): Promise<DailyWeather[]> {
    const data = await this.request(`/weather/v1/daily/${lat.toFixed(2)}/${lon.toFixed(2)}`, { days, localTime: true, lang: 'zh' })
    return (Array.isArray(data?.days) ? data.days : []).map((row: any): DailyWeather => ({
      date: String(row.forecastStartTime ?? ''),
      tempMax: Number(row?.temperatureMax?.value),
      tempMin: Number(row?.temperatureMin?.value),
      iconDay: String(row?.daytime?.condition?.icon ?? '999'),
      textDay: String(row?.daytime?.condition?.text ?? ''),
      iconNight: row?.nighttime?.condition?.icon === undefined ? undefined : String(row.nighttime.condition.icon),
      textNight: row?.nighttime?.condition?.text === undefined ? undefined : String(row.nighttime.condition.text),
      sunrise: row?.astro?.sunrise,
      sunset: row?.astro?.sunset,
      moonPhase: row?.astro?.moonPhase,
      pop: row?.daytime?.precipitation?.probability === undefined ? undefined : Number(row.daytime.precipitation.probability),
    }))
  }

  /** 实时预警（黄色及以上由调用方用 isYellowOrAbove 过滤）。 */
  async alerts(lat: number, lon: number): Promise<WeatherAlert[]> {
    const data = await this.request(`/weatheralert/v1/current/${lat.toFixed(2)}/${lon.toFixed(2)}`, { localTime: true, lang: 'zh' })
    return (Array.isArray(data?.alerts) ? data.alerts : []).map((row: any): WeatherAlert => ({
      id: String(row.id ?? ''),
      sender: row?.senderName,
      pubTime: row?.issuedTime,
      headline: String(row?.headline ?? row?.eventType?.name ?? '天气预警'),
      typeName: row?.eventType?.name,
      severity: String(row?.severity ?? 'unknown'),
      color: String(row?.color?.code ?? 'unknown'),
      text: row?.description,
      instruction: row?.instruction,
    }))
  }

  /** 实时空气质量（优先中文标准 cn-mee）。 */
  async air(lat: number, lon: number): Promise<AirNow | undefined> {
    const data = await this.request(`/airquality/v1/current/${lat.toFixed(2)}/${lon.toFixed(2)}`, { lang: 'zh' })
    const indexes = Array.isArray(data?.indexes) ? data.indexes : []
    const row = indexes.find((item: any) => item?.code === 'cn-mee') ?? indexes[0]
    if (row === undefined) return undefined
    return {
      aqi: Number(row.aqi),
      category: row?.category,
      level: row?.level === undefined ? undefined : String(row.level),
      primary: row?.primaryPollutant ?? undefined,
    }
  }

  /**
   * 把任意位置输入解析成一个地理实体：
   * 支持 "经度,纬度"、LocationID、以及城市 / 区县名称（取第一个结果）。
   */
  async resolvePlace(query: string): Promise<Place> {
    const places = await this.geocode(query)
    if (places.length === 0) throw new QWeatherApiError(0, `找不到位置「${query}」，请改用更精确的名称（如“北京 海淀”）、LocationID 或“经度,纬度”`)
    return places[0]!
  }
}
