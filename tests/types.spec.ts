import { describe, expect, it } from 'vitest'
import {
  alertHeadline, curateIndices, dayLabel, escapeHtml, hourLabel, indexLabel, percent, placeLabel,
  qweatherCardMetaFrom, round1, shouldShowAlert, warningColor, windScaleLabel,
} from '../src/qweather/types.ts'

describe('预警展示过滤（蓝色及以上）', () => {
  it('蓝/黄/橙/红均展示，未知级别被过滤', () => {
    expect(shouldShowAlert({ severity: 'minor', color: 'blue' })).toBe(true)
    expect(shouldShowAlert({ severity: 'moderate', color: 'yellow' })).toBe(true)
    expect(shouldShowAlert({ severity: 'severe', color: 'orange' })).toBe(true)
    expect(shouldShowAlert({ severity: 'extreme', color: 'red' })).toBe(true)
    // v1 接口 severity 是主判据，颜色兜底
    expect(shouldShowAlert({ severity: 'unknown', color: 'orange' })).toBe(true)
    expect(shouldShowAlert({ severity: 'unknown', color: 'bogus' })).toBe(false)
    expect(shouldShowAlert({ severity: 'unknown', color: 'unknown' })).toBe(false)
  })
})

describe('展示辅助', () => {
  it('时间与数字格式化', () => {
    expect(hourLabel('2026-08-17T15:00+08:00')).toBe('15:00')
    expect(dayLabel('2026-08-17T00:00+08:00')).toBe('8/17')
    expect(round1(31.66)).toBe('31.7')
    expect(round1(30)).toBe('30')
    expect(percent(0.31)).toBe('31%')
  })
  it('地名去重拼接', () => {
    expect(placeLabel({ id: 'x', name: '东城', adm2: '北京', adm1: '北京市', lat: 1, lon: 2 })).toBe('东城 · 北京 · 北京市')
    expect(placeLabel({ id: 'x', name: '北京', adm2: '北京', adm1: '北京市', lat: 1, lon: 2 })).toBe('北京 · 北京市')
  })
  it('HTML 转义', () => {
    expect(escapeHtml('<script>"a"')).toBe('&lt;script&gt;&quot;a&quot;')
  })
  it('预警颜色兜底', () => {
    expect(warningColor({ color: 'blue' })).toBe('#3d7bd9')
    expect(warningColor({ color: 'red' })).toBe('#d9534f')
    expect(warningColor({ color: 'bogus' })).toBe('#8a94a6')
  })
  it('指数名去后缀与风级数字', () => {
    expect(indexLabel('穿衣指数')).toBe('穿衣')
    expect(indexLabel('紫外线指数')).toBe('紫外线')
    expect(windScaleLabel(3)).toBe('3')
    expect(windScaleLabel('')).toBe('')
    expect(windScaleLabel(undefined)).toBe('')
  })
})

describe('生活指数挑选', () => {
  it('只取前三个指数，避免超限', () => {
    const curated = curateIndices([
      { type: '9', name: '感冒指数', category: '少发' },
      { type: '1', name: '运动指数', category: '适宜' },
      { type: '3', name: '穿衣指数', category: '热' },
      { type: '4', name: '钓鱼指数', category: '适宜' },
    ])
    expect(curated.map((item) => item.type)).toEqual(['9', '1', '3'])
    expect(curated).toHaveLength(3)
  })
})

describe('预警简要标题', () => {
  it('仅输出某类某色预警', () => {
    expect(alertHeadline({ id: 'a', headline: 'x', severity: 'minor', color: 'blue', typeName: '雷电' })).toBe('雷电蓝色预警')
    expect(alertHeadline({ id: 'a', headline: 'x', severity: 'moderate', color: 'yellow' })).toBe('黄色预警')
  })
})

describe('卡片 meta 窄化', () => {
  it('结构不符返回 undefined', () => {
    expect(qweatherCardMetaFrom(null)).toBeUndefined()
    expect(qweatherCardMetaFrom({ kind: 'other' })).toBeUndefined()
    expect(qweatherCardMetaFrom({ kind: 'qweather-card' })).toBeUndefined()
  })
  it('结构正确时返回 meta', () => {
    const meta = qweatherCardMetaFrom({ kind: 'qweather-card', fragment: '<div>x</div>', title: 'T', location: '北京', updateTime: '2026-08-17T15:00+08:00' })
    expect(meta?.fragment).toBe('<div>x</div>')
    expect(meta?.updateTime).toBe('2026-08-17T15:00+08:00')
  })
})
