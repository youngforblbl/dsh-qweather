import { describe, expect, it } from 'vitest'
import {
  ERROR_CATALOG, QWeatherApiError, QWeatherError, errorCodeOf, isQWeatherError, toQWeatherError,
} from '../src/qweather/errors.ts'

describe('ERROR_CATALOG', () => {
  it('每条错误码都有分类 / 可重试性 / 修复提示', () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.category).toBeTruthy()
      expect(typeof entry.retryable).toBe('boolean')
      expect(entry.hint.length).toBeGreaterThan(0)
    }
  })
  it('网络 / 超时 / 上游 5xx 可重试，配置类不可重试', () => {
    expect(ERROR_CATALOG.QW_NETWORK.retryable).toBe(true)
    expect(ERROR_CATALOG.QW_TIMEOUT.retryable).toBe(true)
    expect(ERROR_CATALOG.QW_HTTP_ERROR.retryable).toBe(true)
    expect(ERROR_CATALOG.QW_DISABLED.retryable).toBe(false)
    expect(ERROR_CATALOG.QW_NO_API_KEY.retryable).toBe(false)
  })
})

describe('QWeatherError', () => {
  it('携带 code / category / retryable / hint', () => {
    const err = new QWeatherError('QW_NO_API_KEY', '尚未配置 KEY')
    expect(err.name).toBe('QWeatherError')
    expect(err.code).toBe('QW_NO_API_KEY')
    expect(err.category).toBe('config')
    expect(err.retryable).toBe(false)
    expect(err.message).toBe('尚未配置 KEY')
  })
  it('缺省 message 使用目录 hint', () => {
    expect(new QWeatherError('QW_DISABLED').message).toBe(ERROR_CATALOG.QW_DISABLED.hint)
  })
  it('可覆盖 hint / retryable，保留 cause', () => {
    const cause = new Error('root')
    const err = new QWeatherError('QW_NETWORK', 'x', { cause, retryable: false, hint: 'h' })
    expect(err.cause).toBe(cause)
    expect(err.retryable).toBe(false)
    expect(err.hint).toBe('h')
  })
})

describe('QWeatherApiError', () => {
  it('继承 QWeatherError 并携带 status', () => {
    const err = new QWeatherApiError(404, 'QW_HTTP_ERROR', 'HTTP 404')
    expect(err).toBeInstanceOf(QWeatherError)
    expect(err.name).toBe('QWeatherApiError')
    expect(err.status).toBe(404)
    expect(err.code).toBe('QW_HTTP_ERROR')
  })
})

describe('错误识别与归一化', () => {
  it('isQWeatherError 只认插件错误', () => {
    expect(isQWeatherError(new QWeatherError('QW_INTERNAL'))).toBe(true)
    expect(isQWeatherError(new Error('x'))).toBe(false)
    expect(isQWeatherError('x')).toBe(false)
  })
  it('errorCodeOf 识别实例与反序列化对象', () => {
    expect(errorCodeOf(new QWeatherError('QW_TIMEOUT'))).toBe('QW_TIMEOUT')
    expect(errorCodeOf({ code: 'QW_NETWORK' })).toBe('QW_NETWORK')
    expect(errorCodeOf({ code: 'bogus' })).toBe('UNKNOWN')
    expect(errorCodeOf(new Error('x'))).toBe('UNKNOWN')
  })
  it('toQWeatherError 归一化且不改写已有错误', () => {
    const existing = new QWeatherError('QW_TIMEOUT')
    expect(toQWeatherError(existing)).toBe(existing)
    expect(toQWeatherError(new Error('boom')).code).toBe('QW_INTERNAL')
    expect(toQWeatherError('boom').code).toBe('QW_INTERNAL')
  })
})
