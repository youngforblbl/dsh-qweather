/**
 * 浏览器端的共享数据逻辑：设置快照订阅、自动/手动定位解析、
 * 天气数据拉取与定时刷新。设置卡片与侧边栏组件共用。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { QWeatherApiError, QWeatherClient } from '../qweather/api.ts'
import type { Place, WeatherBundle } from '../qweather/types.ts'
import { placeLabel } from '../qweather/types.ts'

/** 设置命名空间（与主机端 settingsNamespace('qweather') 一致，客户端不 import 主机包）。 */
export const QWEATHER_SETTINGS_NS = 'qweather'

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

/** 设置命名空间 scope 的最小接口（便于组件与测试注入替身）。 */
export interface SettingsScopeLike {
  getSnapshot(): { status: string; value?: unknown; writable?: boolean }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<unknown>
}

/** 把 scope 快照里的 section 归一化成强类型设置。 */
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

/** 订阅设置 scope 的快照（React 状态）。 */
export function useSettingsSnapshot(scope: SettingsScopeLike): QWeatherSettings | undefined {
  const [snapshot, setSnapshot] = useState(scope.getSnapshot())
  useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])
  return normalizeSettings(snapshot.value)
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
  throw new QWeatherApiError(0, '自动定位失败，且未配置兜底位置：请到设置切换为手动位置')
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
        client.alerts(place.lat, place.lon),
      ])
      const bundle: WeatherBundle = { place, receivedAt: new Date().toISOString(), now, hours, alerts }
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
