/**
 * dsh-qweather，浏览器半端：
 * 1) 设置卡片（settings.plugin.item / id=qweather）：密钥、总开关、定位方式；
 * 2) 侧边栏天气组件（sidebar.footer.action / id=qweather）：展开=完整卡片，收起=图标+气温；
 * 3) 对话内天气卡片（tool.call.toolview / key=qweather_card）：渲染主机工具生成的 fragment。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// 仅类型导入：把各槽位的 SlotMap 声明拉进本文件，保证槽位名有类型检查
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CARD_TOOL_NAME } from '../qweather/types.ts'
import { saveQWeatherConfig } from './use-qweather.ts'
import { QWeatherSettingsCard } from './settings-card.tsx'
import { SidebarWeatherWidget } from './sidebar-widget.tsx'
import { QWeatherCardView } from './card-view.tsx'

export const name = 'dsh-qweather'

/**
 * 依赖服务：槽位注册表、locale、侧边栏布局控制。
 * 配置读写走宿主挂载的同源 HTTP 接口（见 use-qweather.ts），
 * 不再依赖 settingsScope（当前版本第三方命名空间不被设置 RPC 暴露）。
 */
export const inject = ['slots', 'locale', 'layout']

const zh = {
  'card.desc': '接入和风天气：侧边栏天气组件 + LLM 天气工具（qweather_weather / qweather_card）。',
  'card.unavailable': '设置服务不可用，无法读取插件配置。',
  'card.on': '已开启',
  'card.off': '已关闭',
  'card.offHint': '总开关关闭后，侧边栏组件与 LLM 天气工具都会停用。',
  'card.hostHint': '控制台 → 设置 → API Host 可查看专属服务域名；留空默认使用公共域名 devapi.qweather.com。',
  'card.showKey': '显示密钥',
  'card.projectId': '项目 ID（可选，仅记录）',
  'card.location': '位置',
  'card.auto': '自动定位（市/区级）',
  'card.manual': '手动输入',
  'card.autoHint': '用浏览器定位反查最近市/区；首次使用需要允许定位权限，失败时回退到手动位置。',
  'card.autoResolved': '已定位',
  'card.manualHint': '支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。',
  'card.save': '保存',
  'card.saving': '保存中…',
  'card.saved': '已保存',
  'card.saveFailed': '保存失败',
  'card.test': '测试连接',
  'card.testNeedKey': '请先填写 API KEY',
  'card.testOk': '连接成功',
  'card.testFail': '连接失败',
  'card.docs': 'API 文档 ↗',
  'widget.loading': '天气加载中…',
  'widget.empty': '暂无天气数据',
  'widget.retry': '重试',
  'widget.refresh': '刷新天气',
  'widget.hourly': '未来 5 小时',
  'widget.updated': '更新于',
} as const

const en = {
  'card.desc': 'QWeather integration: sidebar weather widget + LLM weather tools (qweather_weather / qweather_card).',
  'card.unavailable': 'Settings service unavailable.',
  'card.on': 'Enabled',
  'card.off': 'Disabled',
  'card.offHint': 'When disabled, the sidebar widget and both LLM weather tools stop.',
  'card.hostHint': 'Find your dedicated API Host under Console → Settings → API Host; leave blank for the public devapi.qweather.com.',
  'card.showKey': 'Show key',
  'card.projectId': 'Project ID (optional, record only)',
  'card.location': 'Location',
  'card.auto': 'Auto-locate (city/district)',
  'card.manual': 'Manual input',
  'card.autoHint': 'Reverse-geocode the browser location to the nearest city/district; allow the permission prompt, falls back to the manual location on failure.',
  'card.autoResolved': 'Resolved',
  'card.manualHint': 'City/district name, LocationID (e.g. 101010100), or "longitude,latitude".',
  'card.save': 'Save',
  'card.saving': 'Saving…',
  'card.saved': 'Saved',
  'card.saveFailed': 'Save failed',
  'card.test': 'Test connection',
  'card.testNeedKey': 'Fill in the API KEY first',
  'card.testOk': 'Connected',
  'card.testFail': 'Connection failed',
  'card.docs': 'API docs ↗',
  'widget.loading': 'Loading weather…',
  'widget.empty': 'No weather data',
  'widget.retry': 'Retry',
  'widget.refresh': 'Refresh weather',
  'widget.hourly': 'Next 5 hours',
  'widget.updated': 'Updated',
} as const

/**
 * 注册三个 UI 槽位。
 * 注：settings.plugin.item 等槽位在已发布包里的 SlotMap 类型未声明 inject 面
 * （官方卡片自身也用 inject），因此这里用窄化的 register 类型断言绕过；
 * 运行时 SlotCore 对 inject 完全支持。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const offZh = ctx.locale.register('qweather', 'zh', zh)
    const offEn = ctx.locale.register('qweather', 'en', en)
    return () => {
      offZh()
      offEn()
    }
  }, 'qweather: dictionaries')
  const t = ctx.locale.bind('qweather')
  // 自动定位写回：通过宿主 HTTP 配置接口持久化（引用稳定，避免组件内 useEffect 重跑）
  const saveAuto = (id: string, name: string) => {
    void saveQWeatherConfig({ autoLocationId: id, autoLocationName: name }).catch(() => {})
  }
  // 注意：register 必须通过 ctx.slots.register(...) 在调用点直接调用，
  // 不能提取成脱离服务对象的函数引用（那样 this.ctx 会丢失，
  // 运行时内部 this.ctx.effect(...) 会抛 reading 'effect'）。
  type Register = (options: {
    name: string
    id?: string
    key?: string
    order?: number
    inject?: () => unknown
  }, component: unknown) => () => void
  const register = (...args: Parameters<Register>) => (ctx.slots.register as unknown as Register)(...args)

  // 1) 设置卡片
  ctx.slots.inject('settings.plugin.item', () => register({
    name: 'settings.plugin.item',
    id: 'qweather',
    order: 30,
    inject: () => ({ qw: t }),
  }, QWeatherSettingsCard))

  // 2) 侧边栏底部天气组件
  ctx.slots.inject('sidebar.footer.action', () => register({
    name: 'sidebar.footer.action',
    id: 'qweather',
    order: 10,
    inject: () => ({
      qw: t, saveAuto,
      onExpand: () => ctx.layout.toggleSidebar(),
    }),
  }, SidebarWeatherWidget))

  // 3) 对话内天气卡片 toolview
  ctx.slots.inject('tool.call.toolview', () => register({
    name: 'tool.call.toolview',
    key: CARD_TOOL_NAME,
  }, QWeatherCardView))
}
