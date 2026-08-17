/**
 * 把 WeatherBundle 组织成给 LLM 看的文本（qweather_weather 工具的结果）。
 * 纯文本拼接，无 DOM / 无 I/O，vitest 可直接断言。
 */

import type { WeatherBundle } from './types.ts'
import { dayLabel, hourLabel, isYellowOrAbove, localDateTime, percent, placeLabel, round1, WARNING_NAMES, warningColor } from './types.ts'

/** 时间区间：实时 / 小时预报 / 日预报。 */
export type WeatherRange = 'now' | 'hours' | 'days'

/** 用户关心的信息类别（可组合）。 */
export type WeatherField = 'condition' | 'temp' | 'humidity' | 'wind' | 'precipitation' | 'air' | 'warnings' | 'astro'

/** 所有支持的字段名。 */
export const ALL_FIELDS: readonly WeatherField[] = ['condition', 'temp', 'humidity', 'wind', 'precipitation', 'air', 'warnings', 'astro']

/** 解析 fields 参数：逗号/空格分隔的 token；unknown / summary / all 归一化。 */
export function parseFields(raw: string | undefined): Set<WeatherField> {
  const text = (raw ?? 'summary').trim()
  if (text === '' || text === 'summary') {
    return new Set<WeatherField>(['condition', 'temp', 'humidity', 'wind', 'precipitation'])
  }
  if (text === 'all') return new Set(ALL_FIELDS)
  const wanted = new Set<WeatherField>()
  for (const token of text.toLowerCase().split(/[\s,，;；]+/)) {
    for (const field of ALL_FIELDS) {
      if (token === field) wanted.add(field)
    }
  }
  return wanted
}

/** ISO 时间 → 「2026-08-17 15:02」（本地时区）。 */
export function formatUpdateTime(iso: string): string {
  return localDateTime(iso)
}

/** 生成模型可读的天气摘要文本。 */
export function buildWeatherText(bundle: WeatherBundle, range: WeatherRange, fields: Set<WeatherField>): string {
  const lines: string[] = []
  lines.push(`天气信息 · ${placeLabel(bundle.place)}`)
  if (bundle.now !== undefined && range === 'now') {
    const now = bundle.now
    const head = ['实时天气']
    if (fields.has('condition')) head.push(now.text || '未知')
    if (fields.has('temp')) head.push(`${round1(now.temp)}℃`)
    if (fields.has('temp') && now.feelsLike !== undefined) head.push(`体感 ${round1(now.feelsLike)}℃`)
    lines.push(head.join(' · '))
    const details: string[] = []
    if (fields.has('humidity') && now.humidity !== undefined) details.push(`湿度 ${now.humidity}%`)
    if (fields.has('wind')) {
      const scale = now.windScale === undefined || now.windScale === '' ? '' : ` ${now.windScale}级`
      if (now.windDir !== undefined || scale !== '') details.push(`风 ${now.windDir ?? ''}${scale}`)
    }
    if (fields.has('precipitation') && now.precip !== undefined) details.push(`降水量 ${now.precip}mm`)
    if (now.pressure !== undefined) details.push(`气压 ${now.pressure}hPa`)
    if (now.vis !== undefined) details.push(`能见度 ${now.vis}km`)
    if (details.length > 0) lines.push(details.join(' · '))
  }
  if (bundle.hours !== undefined && bundle.hours.length > 0 && range === 'hours') {
    lines.push(`未来 ${bundle.hours.length} 小时预报：`)
    for (const hour of bundle.hours) {
      const parts: string[] = [hourLabel(hour.time)]
      if (fields.has('condition')) parts.push(hour.text || '未知')
      if (fields.has('temp')) parts.push(`${round1(hour.temp)}℃`)
      if (fields.has('precipitation')) parts.push(`降水 ${percent(hour.pop)}`)
      if (fields.has('humidity') && hour.humidity !== undefined) parts.push(`湿度 ${hour.humidity}%`)
      lines.push(`- ${parts.join(' · ')}`)
    }
  }
  if (bundle.days !== undefined && bundle.days.length > 0 && range === 'days') {
    lines.push(`未来 ${bundle.days.length} 天预报：`)
    for (const day of bundle.days) {
      const parts: string[] = [dayLabel(day.date)]
      if (fields.has('condition')) parts.push(`白天 ${day.textDay || '未知'}${day.textNight ? `，夜间 ${day.textNight}` : ''}`)
      if (fields.has('temp')) parts.push(`${round1(day.tempMin)} ~ ${round1(day.tempMax)}℃`)
      if (fields.has('precipitation') && day.pop !== undefined) parts.push(`降水 ${percent(day.pop)}`)
      if (fields.has('astro') && (day.sunrise !== undefined || day.sunset !== undefined)) {
        parts.push(`日出 ${day.sunrise ? hourLabel(day.sunrise) : '-'} 日落 ${day.sunset ? hourLabel(day.sunset) : '-'}`)
      }
      lines.push(`- ${parts.join(' · ')}`)
    }
  }
  if (fields.has('warnings')) {
    const important = (bundle.alerts ?? []).filter(isYellowOrAbove)
    if (important.length === 0) {
      lines.push('预警：无黄色及以上预警')
    } else {
      lines.push(`预警（${important.length} 条）：`)
      for (const alert of important) {
        lines.push(`- [${WARNING_NAMES[alert.color.toLowerCase()] ?? '预警'}] ${alert.headline}（${alert.sender ?? '气象台'}）`)
        if (alert.text !== undefined && alert.text.length > 0) lines.push(`  ${alert.text.trim()}`)
      }
    }
  }
  if (fields.has('air') && bundle.air !== undefined) {
    const air = bundle.air
    const parts = [`AQI ${air.aqi}`]
    if (air.category !== undefined) parts.push(air.category)
    if (air.primary !== undefined && air.primary !== '') parts.push(`首要污染物 ${air.primary}`)
    lines.push(`空气质量：${parts.join(' · ')}`)
  }
  lines.push(`数据时间：${formatUpdateTime(bundle.receivedAt)}（本地接收时间）`)
  return lines.join('\n')
}

/** 预警卡片上的色条颜色（供卡片模板使用）。 */
export function alertColorOf(color: string): string {
  return warningColor({ color })
}
