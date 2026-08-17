/**
 * 开发脚本：在 Node 中用真实 cordis + 最小 mock 服务执行客户端 bundle 的 apply，
 * 复现并打印客户端加载错误（带完整堆栈）。
 */
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// 1) 模拟浏览器模块表
const requireReact = createRequire(import.meta.url)
const react = requireReact('react')
const jsxRuntime = requireReact('react/jsx-runtime')
const cordis = await import('@deepseek-ai/cordis')

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const sandboxRequire = (spec) => {
  if (spec === 'react') return react
  if (spec === 'react/jsx-runtime') return jsxRuntime
  if (spec === '@deepseek-ai/cordis') return cordis
  if (spec === '@deepseek-ai/dsh-client-ui-slots') return {}
  if (spec === '@deepseek-ai/dsh-client-runtime/client') return {}
  throw new Error('unexpected require: ' + spec)
}
let exports = {}
globalThis.window = {
  __ModuleLoader__: {
    load: (handoff) => {
      const module = { exports: {} }
      exports = handoff.factory(sandboxRequire)
    },
  },
}
new Function('window', 'module', 'exports', code)(globalThis.window, { exports: {} }, exports)
console.log('bundle loaded, exports:', Object.keys(exports))

// 2) 构造客户端 ctx + mock 服务
const root = new Context()
root.on('internal/plugin', () => {})
const noop = () => {}
const mockSlots = {
  inject: (key, cb) => {
    console.log('  slots.inject:', key)
    return noop
  },
  register: (options, component) => {
    console.log('  slots.register:', options.name, options.id ?? options.key ?? '')
    return noop
  },
}
const mockSettingsScope = {
  bind: (spec) => {
    console.log('  settingsScope.bind:', spec.namespace)
    return {
      getSnapshot: () => ({ status: 'ready', value: { enabled: true } }),
      subscribe: () => noop,
      set: async () => {},
      unset: async () => {},
    }
  },
}
const t = (key) => key
const mockLocale = { register: () => noop, bind: () => t }
const mockLayout = { toggleSidebar: noop }

root.plugin({
  name: 'mock-provider',
  apply: (ctx) => {
    ctx.reflect.provide('slots', mockSlots)
    ctx.reflect.provide('settingsScope', mockSettingsScope)
    ctx.reflect.provide('connection', { api: {}, isLoopback: true })
    ctx.reflect.provide('remote', { $on: () => noop })
    ctx.reflect.provide('locale', mockLocale)
    ctx.reflect.provide('layout', mockLayout)
  },
})

console.log('applying client plugin...')
try {
  root.plugin({ name: 'dsh-qweather', inject: ['slots', 'settingsScope', 'connection', 'remote', 'locale', 'layout'], apply: exports.apply })
  await new Promise((r) => setTimeout(r, 200))
  console.log('APPLY OK')
} catch (error) {
  console.error('APPLY FAILED:')
  console.error(error)
  console.error(error?.stack)
}
