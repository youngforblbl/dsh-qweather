import { describe, expect, it, vi } from 'vitest'
import { QWeatherApiError, QWeatherClient, normalizeApiHost } from '../src/qweather/api.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const nowBody = {
  condition: { text: '阴', code: '104', icon: '104' },
  temperature: { value: 30.68, unit: '°C' },
  feelsLike: { value: 31.15, unit: '°C' },
  humidity: 0.46,
  wind: { direction: { degree: 63, compass: 'ene' }, speed: { value: 3.24, unit: 'm/s' }, scale: 2 },
  precipitation: { amount: { value: 0, unit: 'mm' }, type: 'none' },
  pressure: { value: 1006.9, unit: 'hPa' },
  visibility: { value: 24010, unit: 'm' },
  cloudCover: 0.1,
  uvIndex: 3,
}

describe('normalizeApiHost', () => {
  it('裁剪空白与斜杠，空值回退默认域名', () => {
    expect(normalizeApiHost(undefined)).toBe('https://devapi.qweather.com')
    expect(normalizeApiHost('  https://my.qweatherapi.com/ ')).toBe('https://my.qweatherapi.com')
  })
})

describe('QWeatherClient 请求', () => {
  it('用 X-QW-Api-Key 请求并解析实时天气', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(String(url)).toContain('/weather/v1/current/39.92/116.41')
      expect((init.headers as Record<string, string>)['X-QW-Api-Key']).toBe('test-key')
      return jsonResponse(nowBody)
    })
    const client = new QWeatherClient({ apiKey: 'test-key', fetchImpl: fetchMock as typeof fetch })
    const now = await client.current(39.92, 116.41)
    expect(now.temp).toBe(30.68)
    expect(now.text).toBe('阴')
    expect(now.humidity).toBe(46)
    expect(now.windScale).toBe(2)
  })

  it('解析逐小时：降水概率 0-1', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      hours: [{
        forecastTime: '2026-08-17T15:00+08:00',
        condition: { text: '晴', code: '100', icon: '100' },
        temperature: { value: 31.66, unit: '°C' },
        humidity: 0.43,
        precipitation: { amount: { value: 0, unit: 'mm' }, probability: 0.31, type: 'rain' },
      }],
    }))
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    const hours = await client.hourly(39.92, 116.41, 5)
    expect(hours).toHaveLength(1)
    expect(hours[0]!.pop).toBe(0.31)
    expect(hours[0]!.icon).toBe('100')
  })

  it('解析逐日：白天/夜间天气与气温', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      days: [{
        forecastStartTime: '2026-08-17T00:00+08:00',
        temperatureMax: { value: 31.92, unit: '°C' },
        temperatureMin: { value: 21.38, unit: '°C' },
        daytime: { condition: { text: '少云', code: '102', icon: '102' }, precipitation: { probability: 0 } },
        nighttime: { condition: { text: '多云', code: '101', icon: '151' } },
        astro: { sunrise: '2026-08-17T05:28+08:00', sunset: '2026-08-17T19:11+08:00', moonPhase: 'waxing-crescent' },
      }],
    }))
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    const days = await client.daily(39.92, 116.41, 3)
    expect(days[0]!.textDay).toBe('少云')
    expect(days[0]!.iconNight).toBe('151')
    expect(days[0]!.tempMax).toBe(31.92)
  })

  it('解析预警：severity 与颜色代码', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      alerts: [{
        id: 'a1', senderName: '临桂区气象台', issuedTime: '2025-10-24T11:19+08:00',
        eventType: { name: '大风', code: '1006' }, severity: 'moderate',
        color: { code: 'yellow', red: 30, green: 50, blue: 205, alpha: 1 },
        headline: '大风黄色预警', description: '预计未来24小时…',
      }],
    }))
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    const alerts = await client.alerts(39.92, 116.41)
    expect(alerts[0]!.headline).toBe('大风黄色预警')
    expect(alerts[0]!.color).toBe('yellow')
    expect(alerts[0]!.severity).toBe('moderate')
  })

  it('解析空气质量：优先 cn-mee', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      indexes: [{ code: 'cn-mee', aqi: 33, level: '1', category: '优', primaryPollutant: null }],
    }))
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    const air = await client.air(39.92, 116.41)
    expect(air?.aqi).toBe(33)
    expect(air?.category).toBe('优')
  })

  it('公共域名 /geo/v2 404 时回退 geoapi.qweather.com', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/geo/v2/')) return new Response('not found', { status: 404 })
      if (String(url).startsWith('https://geoapi.qweather.com/v2/city/lookup')) {
        return jsonResponse({ code: '200', location: [{ name: '北京', id: '101010100', lat: '39.90499', lon: '116.40529', adm1: '北京市', adm2: '北京' }] })
      }
      throw new Error('unexpected url ' + url)
    })
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    const places = await client.geocode('北京')
    expect(places[0]!.id).toBe('101010100')
    expect(places[0]!.lat).toBe(39.90499)
  })

  it('HTTP 错误包装成 QWeatherApiError', async () => {
    const fetchMock = vi.fn(async () => new Response('bad', { status: 500 }))
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    await expect(client.current(1, 2)).rejects.toMatchObject({ name: 'QWeatherApiError', status: 500 })
  })

  it('找不到位置给出可读错误', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: '200', location: [] }))
    const client = new QWeatherClient({ apiKey: 'k', fetchImpl: fetchMock as typeof fetch })
    await expect(client.resolvePlace('不存在的地方')).rejects.toBeInstanceOf(QWeatherApiError)
  })
})
