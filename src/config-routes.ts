/**
 * 插件自带的同源 HTTP 配置接口（挂在宿主 webServer 服务上，与 dshmarket 同款模式）。
 *
 * 背景：当前 DSH 版本的设置 RPC 只向 Web 客户端暴露硬编码白名单内的命名空间
 * （model 提供商 + 少数内置 section），第三方插件注册的 settings 命名空间在
 * 客户端会得到 settings-not-exposed。因此设置卡片改走本接口：
 *   GET  /dsh-qweather/config  读取当前配置（含是否开启、定位方式等）
 *   POST /dsh-qweather/config  保存部分配置（同源校验 + schema 校验后写入
 *                              宿主 settings 命名空间，持久化到 settings.yaml）
 * 宿主内部仍然通过 settings 命名空间读取配置，LLM 工具 / 侧边栏组件行为不变。
 *
 * 错误响应统一为 `{ error: string, code: QWeatherErrorCode }`：`error` 面向用户，
 * `code` 供客户端 / 日志做机器判别；HTTP 状态按错误类别映射
 * （permission→403，input→400，其余→500）。
 */

import { QWeatherError, errorCodeOf, toQWeatherError } from './qweather/errors.ts'
import { createLogger, type Logger } from './qweather/log.ts'

/** 服务上的 route 形状（dsh-host-webserver 的 register 入参）。 */
interface HttpRequest extends AsyncIterable<Uint8Array> {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: HttpRequest, response: HttpResponse) => unknown
  }): () => void
}

/** 写 JSON 响应（禁缓存）。 */
function sendJson(response: HttpResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

/** 同源校验：Origin 的 host 必须与请求 Host 一致（防跨站写配置）。 */
function sameOrigin(request: HttpRequest): boolean {
  const origin = request.headers.origin
  const host = request.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** 读取并解析 JSON 请求体（上限 16KiB）。 */
async function readJsonBody(request: HttpRequest): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 16 * 1024) throw new QWeatherError('QW_BAD_REQUEST', '请求体过大（上限 16KiB）')
    chunks.push(buffer)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (cause) {
    throw new QWeatherError('QW_BAD_REQUEST', '请求体不是合法 JSON', { cause })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new QWeatherError('QW_BAD_REQUEST', '请求体必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

/** 按错误类别映射 HTTP 状态码。 */
function statusOf(error: unknown): number {
  const qw = toQWeatherError(error)
  if (qw.category === 'permission') return 403
  if (qw.category === 'input') return 400
  return 500
}

export interface ConfigRouteDeps {
  /** 读取当前生效配置（已合并默认值）。 */
  getConfig(): Record<string, unknown>
  /** 校验并保存部分配置；返回保存后的最新配置。 */
  updateConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>>
}

/** 挂载 GET/POST /dsh-qweather/config 路由，返回整体卸载函数。 */
export function mountConfigRoutes(
  webServer: WebServerLike,
  deps: ConfigRouteDeps,
  logger: Logger = createLogger('qweather:config'),
): () => void {
  const dispose = webServer.register({
    kind: 'exact',
    path: '/dsh-qweather/config',
    handler: async (request, response) => {
      if (request.method === 'GET') {
        try {
          sendJson(response, 200, { config: deps.getConfig() })
        } catch (error) {
          const code = errorCodeOf(error)
          logger.error('GET config failed', { code, message: toQWeatherError(error).message })
          sendJson(response, statusOf(error), { error: toQWeatherError(error).message, code })
        }
        return
      }
      if (request.method === 'POST') {
        if (!sameOrigin(request)) {
          const err = new QWeatherError('QW_FORBIDDEN', '跨源请求被拒绝')
          logger.warn('POST config blocked: cross-origin')
          sendJson(response, 403, { error: err.message, code: err.code })
          return
        }
        try {
          const patch = await readJsonBody(request)
          const config = await deps.updateConfig(patch)
          logger.info('POST config saved', { keys: Object.keys(patch) })
          sendJson(response, 200, { config })
        } catch (error) {
          const code = errorCodeOf(error)
          logger.warn('POST config failed', { code, message: toQWeatherError(error).message })
          sendJson(response, statusOf(error), { error: toQWeatherError(error).message, code })
        }
        return
      }
      response.writeHead(405, { allow: 'GET, POST' })
      response.end()
    },
  })
  return () => {
    dispose()
  }
}
