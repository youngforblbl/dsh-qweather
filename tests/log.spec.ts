import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger, getLogLevel, redact, setLogLevel, type LogSink } from '../src/qweather/log.ts'

function memorySink(): LogSink & { calls: Array<{ level: string; message: string; extra?: unknown }> } {
  const calls: Array<{ level: string; message: string; extra?: unknown }> = []
  return {
    calls,
    debug: (message, extra) => calls.push({ level: 'debug', message, extra }),
    info: (message, extra) => calls.push({ level: 'info', message, extra }),
    warn: (message, extra) => calls.push({ level: 'warn', message, extra }),
    error: (message, extra) => calls.push({ level: 'error', message, extra }),
  }
}

afterEach(() => {
  setLogLevel('warn')
})

describe('redact', () => {
  it('脱敏敏感键，保留普通值', () => {
    const out = redact({ apiKey: 'secret-123', api_key: 'x', token: 't', location: '北京', nested: { Authorization: 'Bearer y' } }) as Record<string, unknown>
    expect(out.apiKey).toBe('[redacted]')
    expect(out.api_key).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.location).toBe('北京')
    expect((out.nested as Record<string, unknown>).Authorization).toBe('[redacted]')
  })
  it('数组与原始值原样处理', () => {
    expect(redact([1, { password: 'p' }])).toEqual([1, { password: '[redacted]' }])
    expect(redact('hello')).toBe('hello')
    expect(redact(42)).toBe(42)
  })
})

describe('createLogger', () => {
  it('低于级别的日志被丢弃', () => {
    const sink = memorySink()
    const log = createLogger('qweather', { sink, level: 'warn' })
    log.debug('dbg')
    log.info('inf')
    log.warn('wrn')
    log.error('err')
    expect(sink.calls.map((c) => c.level)).toEqual(['warn', 'error'])
  })
  it('消息带命名空间前缀，extra 经脱敏', () => {
    const sink = memorySink()
    const log = createLogger('qweather:api', { sink, level: 'debug' })
    log.debug('request', { url: 'https://x', apiKey: 'k' })
    expect(sink.calls[0]!.message).toBe('[qweather:api] request')
    expect((sink.calls[0]!.extra as Record<string, unknown>).apiKey).toBe('[redacted]')
  })
  it('child 派生子命名空间', () => {
    const sink = memorySink()
    const log = createLogger('qweather', { sink, level: 'debug' }).child('api')
    log.debug('x')
    expect(sink.calls[0]!.message).toBe('[qweather:api] x')
  })
})

describe('setLogLevel', () => {
  it('修改全局级别', () => {
    setLogLevel('silent')
    expect(getLogLevel()).toBe('silent')
    setLogLevel('debug')
    expect(getLogLevel()).toBe('debug')
  })
  it('silent 级别丢弃全部日志', () => {
    const sink = memorySink()
    const log = createLogger('qweather', { sink, level: 'silent' })
    log.error('e')
    expect(sink.calls).toHaveLength(0)
  })
})
