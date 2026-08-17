import { describe, expect, it } from 'vitest'
import { buildCardFragment } from '../src/qweather/card.ts'
import { iconKindOf, raindropIcon, weatherIcon, windArrow } from '../src/qweather/icons.ts'
import type { WeatherBundle } from '../src/qweather/types.ts'

const bundle: WeatherBundle = {
  place: { id: '101010100', name: '北京', adm1: '北京市', adm2: '北京', lat: 39.9, lon: 116.4 },
  receivedAt: '2026-08-17T15:02:00+08:00',
  now: { temp: 31, feelsLike: 30, icon: '104', text: '阴', humidity: 43, windDir: '东北风', windScale: 3 },
  hours: [
    { time: '2026-08-17T15:00+08:00', temp: 30, icon: '100', text: '晴', pop: 0, windDir: '北风', windScale: 2, windDegree: 0 },
    { time: '2026-08-17T16:00+08:00', temp: 31, icon: '101', text: '多云', pop: 0.2, windDir: '东北风', windScale: 3, windDegree: 45 },
    { time: '2026-08-17T17:00+08:00', temp: 33, icon: '104', text: '阴', pop: 0.5, windDir: '东风', windScale: 3, windDegree: 90 },
    { time: '2026-08-17T18:00+08:00', temp: 32, icon: '305', text: '小雨', pop: 0.8, windDir: '东南风', windScale: 4, windDegree: 135 },
    { time: '2026-08-17T19:00+08:00', temp: 29, icon: '302', text: '雷阵雨', pop: 0.9, windDir: '南风', windScale: 4, windDegree: 180 },
  ],
  alerts: [
    { id: 'a1', headline: '大风蓝色预警', typeName: '大风', severity: 'minor', color: 'blue' },
    { id: 'a2', headline: '暴雨黄色预警', typeName: '暴雨', severity: 'moderate', color: 'yellow', text: '<预计>今晚有暴雨' },
  ],
  air: { aqi: 33, category: '优', primary: 'PM2.5' },
  days: [{
    date: '2026-08-17', tempMax: 33, tempMin: 24, iconDay: '104', textDay: '阴',
    sunrise: '2026-08-17T05:28+08:00', sunset: '2026-08-17T19:11+08:00',
    moonrise: '2026-08-17T06:00+08:00', moonset: '2026-08-17T20:00+08:00',
  }],
  indices: [
    { type: '3', name: '穿衣指数', category: '热' },
    { type: '1', name: '运动指数', category: '较不宜' },
    { type: '5', name: '紫外线指数', category: '强' },
  ],
}

describe('buildCardFragment', () => {
  const fragment = buildCardFragment(bundle, 5)

  it('必须内联样式表（回归：缺少 style 时 SVG 会落入黑色默认填充）', () => {
    expect(fragment).toContain('<style>')
    expect(fragment).toContain('.qw-card{')
    expect(fragment).toContain('light-dark(')
    expect(fragment).toContain('backdrop-filter')
  })
  it('包含当前天气：图标、文字、气温（单位 ℃）', () => {
    expect(fragment).toContain('阴')
    expect(fragment).toContain('qw-now-icon')
    expect(fragment).toContain('qw-now-meta')
    expect(fragment).toContain('℃')
  })
  it('气温归入小时格，且不再有气温曲线', () => {
    expect(fragment.match(/class="qw-hr-time"/g)).toHaveLength(5)
    expect(fragment).toContain('qw-hr-temp')
    expect(fragment).toContain('33<span class="deg">℃</span>') // 气温直接标在小时格内
    expect(fragment).not.toContain('qw-chart')
    expect(fragment).not.toContain('qw-chart-svg')
  })
  it('小时格含降水概率（前置雨滴图标）', () => {
    expect(fragment).toContain('50%')
    expect(fragment.match(/class="qw-hr-pop"/g)).toHaveLength(5)
    // 雨滴图标路径
    expect(fragment).toContain('M12 3.2c3.6')
  })
  it('小时格含风向箭头与风级数字', () => {
    expect(fragment.match(/class="qw-hr-wind"/g)).toHaveLength(5)
    expect(fragment).toContain('M12 2.6L18.6') // 风向箭头
    expect(fragment).toContain('>2<') // 风级数字
    expect(fragment).toContain('>4<')
  })
  it('小时数钳制为 5（回归：传 12 曾导致多行堆叠）', () => {
    const manyHours = [...bundle.hours!]
    for (let i = 0; i < 10; i++) {
      manyHours.push({ time: `2026-08-18T0${i}:00+08:00`, temp: 30 + i, icon: '100', text: '晴', pop: 0 })
    }
    const frag = buildCardFragment({ ...bundle, hours: manyHours }, 12)
    expect(frag.match(/class="qw-hr-time"/g)).toHaveLength(5)
    expect(frag).toContain('未来 5 小时')
  })
  it('预警展示蓝色及以上，文本被转义', () => {
    expect(fragment).toContain('大风蓝色预警')
    expect(fragment).toContain('暴雨黄色预警')
    expect(fragment).toContain('&lt;预计&gt;')
    expect(fragment).toContain('qw-badge')
  })
  it('包含空气质量 / 日月起落 / 生活指数', () => {
    expect(fragment).toContain('空气质量')
    expect(fragment).toContain('AQI 33')
    expect(fragment).toContain('日月起落')
    expect(fragment).toContain('日出 05:28')
    expect(fragment).toContain('日落 19:11')
    expect(fragment).toContain('月出 06:00')
    expect(fragment).toContain('生活指数')
    expect(fragment).toContain('穿衣') // 指数名去「指数」后缀
    expect(fragment).toContain('强')
  })
  it('包含信息更新时间与数据来源', () => {
    expect(fragment).toContain('更新于 15:02')
    expect(fragment).toContain('数据来源：和风天气')
  })
  it('不含文档骨架标签（fragment 契约）', () => {
    expect(fragment).not.toMatch(/<!doctype|<html|<head|<body/i)
  })
})

describe('weatherIcon', () => {
  it('代码映射与未知回退', () => {
    expect(iconKindOf('100')).toBe('sun')
    expect(iconKindOf('150')).toBe('moon')
    expect(iconKindOf('302')).toBe('thunder')
    expect(iconKindOf('406')).toBe('sleet')
    expect(iconKindOf('501')).toBe('fog')
    expect(iconKindOf('502')).toBe('haze')
    expect(iconKindOf('503')).toBe('dust')
    expect(iconKindOf('504')).toBe('dust')
    expect(iconKindOf('507')).toBe('sandstorm')
    expect(iconKindOf('508')).toBe('sandstorm')
    expect(iconKindOf('900')).toBe('hot')
    expect(iconKindOf('901')).toBe('cold')
    expect(iconKindOf('999')).toBe('unknown')
  })
  it('输出内联 SVG（无外部引用）', () => {
    const svg = weatherIcon('100')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<img')
    expect(svg).not.toContain('http')
  })
})

describe('windArrow / raindropIcon', () => {
  it('风向箭头按角度旋转，上指为北', () => {
    expect(windArrow(0, 12)).toContain('rotate(0 12 12)')
    expect(windArrow(90, 12)).toContain('rotate(90 12 12)')
    expect(windArrow(undefined, 12)).toContain('rotate(0 12 12)')
    expect(windArrow(400, 12)).toContain('rotate(40 12 12)') // 取模
  })
  it('雨滴图标为内联 SVG', () => {
    const svg = raindropIcon(11)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('fill="currentColor"')
  })
})
