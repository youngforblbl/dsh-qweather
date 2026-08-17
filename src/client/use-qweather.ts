/**
 * 浏览器端的共享数据逻辑：配置读取/保存（同源 HTTP）、自动/手动定位解析、
 * 天气数据拉取与定时刷新。设置卡片与侧边栏组件共用。
 *
 * 说明：当前 DSH 版本的设置 RPC 不向第三方插件命名空间开放，
 * 配置统一走宿主挂载的同源接口 GET/POST /dsh-qweather/config。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { QWeatherClient } from '../qweather/api.ts'
import { QWeatherError } from '../qweather/errors.ts'
import type { Place, WeatherBundle } from '../qweather/types.ts'
import { placeLabel } from '../qweather/types.ts'

/** 宿主配置接口路径。 */
export const CONFIG_URL = '/dsh-qweather/config'
/** 页面可能替换 window.fetch；统一绑定 globalThis 调用，避免 Illegal invocation。 */
const boundFetch: typeof fetch = fetch.bind(globalThis)
/** 配置保存成功后广播的事件（其他组件据此刷新）。 */
export const CONFIG_CHANGED_EVENT = 'dsh-qweather:config-changed'

/** 归一化后的设置项。 */
export interface QWeatherSettings {
  enabled: boolean
  apiHost: string
  apiKey: string
  projectId: string
  locationMode: 'auto' | 'manual'
  location: string
  autoLocationId: string
  autoLocationName: string
}

/** 把配置对象归一化成强类型设置。 */
export function normalizeSettings(value: unknown): QWeatherSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const section = value as Record<string, unknown>
  const str = (raw: unknown, fallback: string): string => (typeof raw === 'string' && raw.length > 0 ? raw : fallback)
  return {
    enabled: section.enabled !== false,
    apiHost: str(section.apiHost, 'https://devapi.qweather.com'),
    apiKey: str(section.apiKey, ''),
    projectId: str(section.projectId, ''),
    locationMode: section.locationMode === 'manual' ? 'manual' : 'auto',
    location: str(section.location, '北京'),
    autoLocationId: str(section.autoLocationId, ''),
    autoLocationName: str(section.autoLocationName, ''),
  }
}

/** 读取配置（GET /dsh-qweather/config）。 */
export async function fetchQWeatherConfig(): Promise<QWeatherSettings | undefined> {
  const response = await boundFetch(CONFIG_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error('读取配置失败：HTTP ' + response.status)
  const data = (await response.json()) as { config?: unknown }
  return normalizeSettings(data.config)
}

/** 保存部分配置（POST /dsh-qweather/config，宿主校验并持久化）。 */
export async function saveQWeatherConfig(patch: Record<string, unknown>): Promise<QWeatherSettings | undefined> {
  const response = await boundFetch(CONFIG_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error('保存配置失败：' + (data?.error ?? 'HTTP ' + response.status))
  }
  const data = (await response.json()) as { config?: unknown }
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT))
  return normalizeSettings(data.config)
}

/** 订阅配置（React 状态）：挂载时拉取、保存事件后刷新、每 60s 兜底轮询。 */
export function useQWeatherSettings(): QWeatherSettings | undefined {
  const [settings, setSettings] = useState<QWeatherSettings | undefined>(undefined)
  const reload = useCallback(() => {
    fetchQWeatherConfig()
      .then((next) => setSettings(next))
      .catch(() => {
        // 配置接口不可用（独立预览页等场景）保持当前值；组件侧显示占位
      })
  }, [])
  useEffect(() => {
    reload()
    const onChanged = () => reload()
    window.addEventListener(CONFIG_CHANGED_EVENT, onChanged)
    const timer = setInterval(reload, 60_000)
    return () => {
      window.removeEventListener(CONFIG_CHANGED_EVENT, onChanged)
      clearInterval(timer)
    }
  }, [reload])
  return settings
}

/** 浏览器定位：拿经纬度（自动定位到市/区级，由城市搜索接口反查）。 */
export function geolocate(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('当前环境不支持浏览器定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) => reject(new Error('浏览器定位失败：' + (error.message || error.code))),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  })
}

/**
 * 按设置解析目标位置：
 * - manual：直接搜索用户输入（名称 / LocationID / 经纬度）；
 * - auto：优先用已解析的 autoLocationId；否则浏览器定位反查并写回设置；
 *   定位失败时回退到手动兜底位置。
 */
export async function resolvePlaceForSettings(
  client: QWeatherClient,
  settings: QWeatherSettings,
  saveAuto: (id: string, name: string) => void,
): Promise<Place> {
  if (settings.locationMode === 'manual') return client.resolvePlace(settings.location)
  if (settings.autoLocationId.length > 0) {
    try {
      return await client.resolvePlace(settings.autoLocationId)
    } catch {
      // 已缓存的 ID 失效（改名/停用）：继续尝试重新定位
    }
  }
  try {
    const coords = await geolocate()
    const place = await client.resolvePlace(coords.lat.toFixed(4) + ',' + coords.lon.toFixed(4))
    saveAuto(place.id, placeLabel(place))
    return place
  } catch {
    // 定位不可用：回退到设置里的手动兜底位置
  }
  if (settings.location.trim().length > 0) return client.resolvePlace(settings.location)
  throw new QWeatherError('QW_NO_LOCATION', '自动定位失败，且未配置兜底位置：请到设置切换为手动位置')
}

/** 天气拉取状态机。 */
export interface WeatherState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  bundle?: WeatherBundle
  error?: string
  refreshing?: boolean
}

/** 拉取并缓存天气：首次加载 + 设置变化时刷新，每 10 分钟定时刷新。 */
export function useWeather(settings: QWeatherSettings | undefined, saveAuto: (id: string, name: string) => void): {
  state: WeatherState
  refresh: () => Promise<void>
} {
  const [state, setState] = useState<WeatherState>({ status: 'idle' })
  const busy = useRef(false)
  // 影响数据源的所有设置项：变化时自动重新拉取
  const settingsKey = JSON.stringify([
    settings?.enabled, settings?.apiHost, settings?.apiKey,
    settings?.locationMode, settings?.location, settings?.autoLocationId,
  ])

  const refresh = useCallback(async () => {
    if (settings === undefined || busy.current) return
    if (!settings.enabled) {
      setState({ status: 'idle' })
      return
    }
    if (settings.apiKey.trim().length === 0) {
      setState({ status: 'error', error: '未配置 API KEY：请到 设置 → 插件 → 和风天气 填写' })
      return
    }
    busy.current = true
    setState((previous) => previous.bundle === undefined ? { status: 'loading' } : { ...previous, refreshing: true })
    try {
      const client = new QWeatherClient({ apiHost: settings.apiHost, apiKey: settings.apiKey })
      const place = await resolvePlaceForSettings(client, settings, saveAuto)
      const [now, hours, alerts] = await Promise.all([
        client.current(place.lat, place.lon),
        client.hourly(place.lat, place.lon, 5),
        client.alerts(place.lat, place.lon).catch(() => []),
      ])
      // 附加数据（日月起落 / 空气质量 / 生活指数）失败时优雅降级。
      const [days, air, indices] = await Promise.all([
        client.daily(place.lat, place.lon, 1).catch(() => []),
        client.air(place.lat, place.lon).catch(() => undefined),
        client.indices(place.lat, place.lon).catch(() => []),
      ])
      const bundle: WeatherBundle = { place, receivedAt: new Date().toISOString(), now, hours, alerts, days, air, indices }
      setState({ status: 'ready', bundle })
    } catch (cause) {
      setState({ status: 'error', error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      busy.current = false
    }
  }, [settingsKey, saveAuto])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (settings?.enabled !== true) return
    const timer = setInterval(() => void refresh(), 10 * 60_000)
    return () => clearInterval(timer)
  }, [refresh, settings?.enabled])

  return { state, refresh }
}
