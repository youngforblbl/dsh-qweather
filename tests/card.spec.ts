import { describe, expect, it } from 'vitest'
import { buildCardFragment, tempChartSvg } from '../src/qweather/card.ts'
import { iconKindOf, weatherIcon } from '../src/qweather/icons.ts'
import type { WeatherBundle } from '../src/qweather/types.ts'

const bundle: WeatherBundle = {
  place: { id: '101010100', name: '北京', adm1: '北京市', adm2: '北京', lat: 39.9, lon: 116.4 },
  receivedAt: '2026-08-17T15:02:00+08:00',
  now: { temp: 31, feelsLike: 30, icon: '104', text: '阴', humidity: 43, windDir: '东北风', windScale: 3 },
  hours: [
    { time: '2026-08-17T15:00+08:00', temp: 30, icon: '100', text: '晴', pop: 0 },
    { time: '2026-08-17T16:00+08:00', temp: 31, icon: '101', text: '多云', pop: 0.2 },
    { time: '2026-08-17T17:00+08:00', temp: 33, icon: '104', text: '阴', pop: 0.5 },
    { time: '2026-08-17T18:00+08:00', temp: 32, icon: '305', text: '小雨', pop: 0.8 },
    { time: '2026-08-17T19:00+08:00', temp: 29, icon: '302', text: '雷阵雨', pop: 0.9 },
  ],
  alerts: [
    { id: 'a1', headline: '大风蓝色预警', severity: 'minor', color: 'blue' },
    { id: 'a2', headline: '暴雨黄色预警', severity: 'moderate', color: 'yellow', text: '<预计>今晚有暴雨' },
  ],
}

describe('buildCardFragment', () => {
  const fragment = buildCardFragment(bundle, 5)

  it('包含当前天气：图标、文字、气温', () => {
    expect(fragment).toContain('31°')
    expect(fragment).toContain('阴')
    expect(fragment).toContain('qw-now')
  })
  it('包含未来 5 小时 + 降水概率 + 气温曲线', () => {
    expect(fragment.match(/qw-hr-temp/g)).toHaveLength(5)
    expect(fragment).toContain('50%')
    expect(fragment).toContain('qw-chart')
    expect(fragment).toContain('polyline')
  })
  it('预警只保留黄色及以上，文本被转义', () => {
    expect(fragment).toContain('暴雨黄色预警')
    expect(fragment).not.toContain('大风蓝色预警')
    expect(fragment).toContain('&lt;预计&gt;')
  })
  it('包含信息更新时间与数据来源', () => {
    expect(fragment).toContain('更新于 15:02')
    expect(fragment).toContain('数据来源：和风天气')
  })
  it('不含文档骨架标签（fragment 契约）', () => {
    expect(fragment).not.toMatch(/<!doctype|<html|<head|<body/i)
  })
})

describe('tempChartSvg', () => {
  it('少于 2 个点时不输出', () => {
    expect(tempChartSvg([])).toBe('')
    expect(tempChartSvg([{ time: 'x', temp: 1, icon: '100', text: '晴', pop: 0 }])).toBe('')
  })
  it('2 个以上输出折线与标签', () => {
    const svg = tempChartSvg(bundle.hours!)
    expect(svg).toContain('qw-cv-line')
    expect(svg).toContain('33°')
  })
})

describe('weatherIcon', () => {
  it('代码映射与未知回退', () => {
    expect(iconKindOf('100')).toBe('sun')
    expect(iconKindOf('150')).toBe('moon')
    expect(iconKindOf('302')).toBe('thunder')
    expect(iconKindOf('406')).toBe('sleet')
    expect(iconKindOf('501')).toBe('fog')
    expect(iconKindOf('999')).toBe('unknown')
  })
  it('输出内联 SVG（无外部引用）', () => {
    const svg = weatherIcon('100')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<img')
    expect(svg).not.toContain('http')
  })
})
