import { describe, expect, it } from 'vitest'
import {
  dayLabel, escapeHtml, hourLabel, isYellowOrAbove, percent, placeLabel, qweatherCardMetaFrom, round1, warningColor,
} from '../src/qweather/types.ts'

describe('预警级别过滤', () => {
  it('只保留黄色及以上', () => {
    expect(isYellowOrAbove({ severity: 'moderate', color: 'yellow' })).toBe(true)
    expect(isYellowOrAbove({ severity: 'severe', color: 'orange' })).toBe(true)
    expect(isYellowOrAbove({ severity: 'extreme', color: 'red' })).toBe(true)
    expect(isYellowOrAbove({ severity: 'minor', color: 'blue' })).toBe(false)
    // v1 接口 severity 是主判据，颜色兜底
    expect(isYellowOrAbove({ severity: 'unknown', color: 'orange' })).toBe(true)
    expect(isYellowOrAbove({ severity: 'minor', color: 'blue' })).toBe(false)
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
    expect(warningColor({ color: 'red' })).toBe('#d9534f')
    expect(warningColor({ color: 'bogus' })).toBe('#8a94a6')
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
