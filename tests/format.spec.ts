import { describe, expect, it } from 'vitest'
import { buildWeatherText, parseFields } from '../src/qweather/format.ts'
import type { WeatherBundle } from '../src/qweather/types.ts'

const bundle: WeatherBundle = {
  place: { id: '101010100', name: '北京', adm1: '北京市', adm2: '北京', lat: 39.9, lon: 116.4 },
  receivedAt: '2026-08-17T15:02:00+08:00',
  now: { temp: 31, feelsLike: 30, icon: '104', text: '阴', humidity: 43, windDir: '东北风', windScale: 3, precip: 0, pressure: 1004, vis: 30 },
  hours: [
    { time: '2026-08-17T15:00+08:00', temp: 31, icon: '100', text: '晴', pop: 0 },
    { time: '2026-08-17T16:00+08:00', temp: 32, icon: '101', text: '多云', pop: 0.4 },
  ],
}

describe('parseFields', () => {
  it('缺省 / summary 返回核心字段', () => {
    expect(parseFields(undefined).has('temp')).toBe(true)
    expect(parseFields('summary').has('warnings')).toBe(false)
  })
  it('all 返回全部字段', () => {
    expect(parseFields('all').size).toBe(8)
  })
  it('逗号分词并忽略未知 token', () => {
    const fields = parseFields('temp, warnings, bogus')
    expect(fields.has('temp')).toBe(true)
    expect(fields.has('warnings')).toBe(true)
    expect((fields as Set<string>).has('bogus')).toBe(false)
  })
})

describe('buildWeatherText', () => {
  it('实时摘要包含气温与数据时间', () => {
    const text = buildWeatherText(bundle, 'now', parseFields('summary'))
    expect(text).toContain('31℃')
    expect(text).toContain('体感 30℃')
    expect(text).toContain('湿度 43%')
    expect(text).toContain('2026-08-17 15:02')
  })
  it('小时预报逐行输出时间/天气/温度/降水', () => {
    const text = buildWeatherText(bundle, 'hours', parseFields('all'))
    expect(text).toContain('15:00 · 晴 · 31℃ · 降水 0%')
    expect(text).toContain('16:00 · 多云 · 32℃ · 降水 40%')
  })
  it('预警区段只列黄色及以上', () => {
    const withAlerts: WeatherBundle = {
      ...bundle,
      alerts: [
        { id: 'a1', headline: '蓝色大风', severity: 'minor', color: 'blue' },
        { id: 'a2', headline: '黄色暴雨', severity: 'moderate', color: 'yellow', sender: '市气象台' },
      ],
    }
    const text = buildWeatherText(withAlerts, 'now', parseFields('warnings,temp'))
    expect(text).toContain('黄色暴雨')
    expect(text).not.toContain('蓝色大风')
  })
})
