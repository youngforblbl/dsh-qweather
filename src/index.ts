/**
 * dsh-qweather，node 半端：
 * 1) 在设置系统注册 qweather 命名空间（API Host / KEY / 位置 / 总开关）；
 * 2) 注册 qweather_weather 工具（给 LLM 查天气数据）；
 * 3) 注册 qweather_card 工具（把天气画成对话内卡片）；
 * 4) 注册内置 qweather 技能（教模型何时用哪个工具）。
 * 浏览器半端（src/client/）负责设置卡片、侧边栏组件与卡片渲染。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { weatherTool, cardTool } from './tools.ts'
import { qweatherSkillProvider } from './skill.ts'

export { WEATHER_TOOL_NAME, CARD_TOOL_NAME, CARD_META_KIND, qweatherCardMetaFrom, weatherTool, cardTool } from './tools.ts'
export type { QWeatherCardMeta, QWeatherRuntimeConfig } from './tools.ts'
export { buildCardFragment, tempChartSvg, byteLength } from './qweather/card.ts'
export { buildWeatherText, parseFields, formatUpdateTime } from './qweather/format.ts'
export { QWeatherClient, QWeatherApiError, DEFAULT_API_HOST } from './qweather/api.ts'
export { isYellowOrAbove, warningColor, placeLabel, hourLabel, dayLabel, percent, round1, localDateTime } from './qweather/types.ts'
export { weatherIcon, iconKindOf } from './qweather/icons.ts'

/** Cordis 插件名。 */
export const name = 'dsh-qweather'
/** 依赖服务：工具注册表、技能注册表（设置命名空间在 apply 内按需注入）。 */
export const inject = ['tools', 'skills']

/** 设置命名空间（客户端设置卡片用同一命名空间读写）。 */
export const QWEATHER_NS = settingsNamespace('qweather')

/**
 * 部署配置 = 设置卡片的 schema。
 * apiKey 为普通字符串（便于设置卡片回读显示）；密钥保存在本机设置文件中。
 * 如需更严格的密钥管理，可升级为 credentials 域 + role('secret')（见 README「升级路线」）。
 */
export interface Config {
  /** 总开关：一键控制侧边栏组件与两个 LLM 工具。 */
  enabled: boolean
  /** API Host（控制台 → 设置 → API Host；留空用公共域名）。 */
  apiHost: string
  /** API KEY（控制台 → 项目和凭据）。 */
  apiKey: string
  /** 项目 ID（仅记录，请求认证用不到；保留给未来 JWT 认证）。 */
  projectId: string
  /** 定位方式：auto=浏览器自动定位到市/区级，manual=手动输入。 */
  locationMode: 'auto' | 'manual'
  /** 手动位置 / 自动定位失败时的兜底位置（名称、LocationID 或“经度,纬度”）。 */
  location: string
  /** 浏览器自动定位解析出的 LocationID（由侧边栏组件写回，LLM 工具直接复用）。 */
  autoLocationId: string
  /** 自动定位解析出的位置名称（仅展示用）。 */
  autoLocationName: string
}

/** Schemastery 校验的配置 schema（Loader 用它合并默认值）。 */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  apiHost: z.string().default('https://devapi.qweather.com'),
  apiKey: z.string().default(''),
  projectId: z.string().default(''),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default('auto'),
  location: z.string().default('北京'),
  autoLocationId: z.string().default(''),
  autoLocationName: z.string().default(''),
})

/**
 * 注册设置命名空间与两个工具。
 * 设置可能不存在（极简部署），installSettingsSection 会自动降级为只读静态配置。
 */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  installSettingsSection(ctx, QWEATHER_NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })
  ctx.tools.register(weatherTool(ctx, () => current()))
  ctx.tools.register(cardTool(ctx, () => current()))
  ctx.skills.registerProvider(() => qweatherSkillProvider)
}
