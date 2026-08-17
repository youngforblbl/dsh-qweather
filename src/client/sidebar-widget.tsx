/**
 * 子功能 1：侧边栏底部的天气组件（注册到 sidebar.footer.action 槽位）。
 * v2 视觉：新拟态 + 玻璃拟态混合——玻璃卡片 + 来光投影 + 外凸小时格 +
 * 渐变图标块 + 橙色强调。亮色 = 白/灰/浅天蓝/鲜艳橙；暗色 = 更深的海军蓝玻璃。
 * - 展开（wide）：地点、当前天气（图标块+大温度+橙色°+参数网格）、
 *   未来 5 小时（时间/图标/气温/降水概率+雨滴/风向箭头+风级）、蓝色以上预警、
 *   空气质量/日月起落、更新时间；
 * - 收起（rail）：仅图标 + 气温，点击展开侧边栏。
 */

import type { CSSProperties, ReactNode } from 'react'
import { raindropIcon, weatherIcon, windArrow } from '../qweather/icons.ts'
import type { WeatherBundle } from '../qweather/types.ts'
import { alertHeadline, hourLabel, percent, placeLabel, round1, shouldShowAlert, warningColor, windScaleLabel } from '../qweather/types.ts'
import { useQWeatherSettings, useWeather } from './use-qweather.ts'

/** 槽位组合属性。 */
export interface SidebarWeatherWidgetProps {
  wide: boolean
  qw: (key: string) => string
  onExpand: () => void
  saveAuto: (id: string, name: string) => void
}

// 与卡片一致的 v3 调色板（light-dark() 随宿主 color-scheme 切换）
const sky = 'light-dark(#38bdf8,#4c8dff)'
const skyDeep = 'light-dark(#0284c7,#2f6bff)'
const orange = 'light-dark(#f97316,#fb923c)'
const fg = 'light-dark(#3a4a61,#e8eefb)'
const muted = 'light-dark(#64748b,#9fb0c7)'
const faint = 'light-dark(#8fa0b5,#5f7089)'
const pop = 'light-dark(#0ea5e9,#56bad9)'
const glassA = 'light-dark(rgba(255,255,255,.88),rgba(40,55,84,.86))'
const glassB = 'light-dark(rgba(255,255,255,.55),rgba(17,26,44,.78))'
const cellA = 'light-dark(rgba(255,255,255,.85),rgba(46,60,90,.80))'
const cellB = 'light-dark(rgba(233,239,247,.75),rgba(20,30,50,.72))'
const bd = 'light-dark(rgba(255,255,255,.75),rgba(255,255,255,.10))'
const shDark = 'light-dark(rgba(148,163,184,.42),rgba(0,0,0,.6))'
const shLight = 'light-dark(rgba(255,255,255,.95),rgba(96,116,150,.16))'

const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' }

const railButton: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 3, width: 46, padding: '7px 0', margin: '4px 0',
  background: 'transparent', border: 'none', cursor: 'pointer', color: fg, borderRadius: 12,
}

/**
 * 与 dsh-cost-meter 等 footer 小组件的排布约定：
 * 宿主 footerActions 容器默认是横向 flex，小组件会左右并排；cost-meter 还会把
 * 自己的 DOM 节点挪到首位。这里从 qweather 一侧用纯 CSS 修正为上下排布：
 * - rc.6 起宿主把每个 slot 渲染进 `div[data-slot="sidebar.footer.action"]`
 *   （display:contents 包裹层），`.qw-sidebar-wide` / `.qw-sidebar-rail` 不再
 *   是 footerActions 的直接子元素，旧的选择器 `div:has(> .qw-sidebar-wide)` 只
 *   命中这层透明包裹层而失效。现在用 data-slot 属性的后代关系精确定位真正的
 *   容器（footerActions），把它改为纵向 flex；!important 压过 cost-meter 对
 *   内联样式的清除，且纯 CSS 无时序竞争。两种结构都覆盖，向后兼容旧宿主；
 * - 展开态（wide）：`align-items:stretch` + 根元素 `width:100%`，天气卡片独占
 *   整行侧边栏；根元素 `order:-1` 让天气组件在视觉上始终排在最上（flex order
 *   不受 DOM 顺序影响，不跟 cost-meter 的 insertBefore 打架）；
 * - 收起态（rail）：同样改为纵向 flex，`align-items:center` 让各小组件图标在
 *   窄轨道里上下堆叠、水平居中，不再左右并排溢出。收起态根元素是
 *   display:contents，按钮本身作为 flex item，靠 DOM 顺序（priority -1000
 *   最先渲染，cost-meter 自 append 到末尾）天然排在费用之上。
 */
let sidebarLayoutStyleEl: HTMLStyleElement | undefined
function ensureSidebarLayoutStyle(): void {
  if (sidebarLayoutStyleEl !== undefined) return
  sidebarLayoutStyleEl = document.createElement('style')
  sidebarLayoutStyleEl.textContent =
    'div:has(> .qw-sidebar-wide),div:has(> div[data-slot="sidebar.footer.action"] > .qw-sidebar-wide)'
    + '{flex-direction:column!important;align-items:stretch!important}'
    + 'div:has(> .qw-sidebar-rail),div:has(> div[data-slot="sidebar.footer.action"] > .qw-sidebar-rail)'
    + '{flex-direction:column!important;align-items:center!important}'
    + '.qw-sidebar-wide{order:-1;width:100%}'
  document.head.appendChild(sidebarLayoutStyleEl)
}

// 卡片主体：纯玻璃渐变；主题色在卡片外部的对角光效阴影上（左上蓝、右下橙），
// 内部保持白高光 + 黑投影的新拟态光影。
const card: CSSProperties = {
  position: 'relative', display: 'flex', flexDirection: 'column', gap: 14,
  margin: '6px 0', padding: '16px 15px 14px',
  border: '1px solid ' + bd, borderRadius: 16,
  background: 'linear-gradient(150deg,' + glassA + ',' + glassB + ')',
  backdropFilter: 'blur(14px) saturate(1.15)', WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
  boxShadow: '-7px -6px 16px light-dark(rgba(56,189,248,.18),rgba(76,141,255,.11)),7px 6px 16px light-dark(rgba(249,115,22,.12),rgba(251,146,60,.08)),0 12px 28px light-dark(rgba(100,116,139,.20),rgba(0,0,0,.45)),8px 8px 20px ' + shDark + ',-8px -8px 20px ' + shLight + ',inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.07))',
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const hourGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4 }
const hourCell: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  minWidth: 0, overflow: 'hidden',
  padding: '9px 1px 8px', borderRadius: 11, border: '1px solid ' + bd,
  background: 'linear-gradient(145deg,' + cellA + ',' + cellB + ')',
  boxShadow: '4px 4px 8px ' + shDark + ',-3px -3px 7px ' + shLight + ',inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09))',
}

const tile: CSSProperties = {
  flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(145deg,light-dark(#e0f4ff,#1a2a49),light-dark(#bfe4ff,#0d1728))',
  boxShadow: '4px 4px 10px ' + shDark + ',-3px -3px 8px ' + shLight + ',inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09))',
}

function Icon({ code, size, uid }: { code: string; size: number; uid: string }) {
  return <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: weatherIcon(code, size, uid) }} />
}

/** 新拟态图标块。 */
function IconTile({ code, size, tileSize, uid }: { code: string; size: number; tileSize: number; uid: string }) {
  return (
    <span style={{ ...tile, width: tileSize, height: tileSize, borderRadius: Math.round(tileSize * 0.3) }}
      dangerouslySetInnerHTML={{ __html: weatherIcon(code, size, uid) }} />
  )
}

/** 雨滴图标（标注降水概率指标）。 */
function Raindrop({ size = 10 }: { size?: number }) {
  return <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: raindropIcon(size) }} />
}

/** 风向箭头 + 风级数字。 */
function WindMark({ degree, scale, dir }: { degree?: number; scale: string; dir?: string }) {
  if (degree === undefined && scale === '') return null
  const title = [dir ?? '', scale !== '' ? `${scale}级` : ''].filter(Boolean).join(' · ')
  return (
    <span title={title || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, fontSize: 10.5, color: muted, ...num, minHeight: 12 }}>
      {degree !== undefined && <span style={{ display: 'inline-flex', color: skyDeep }} dangerouslySetInnerHTML={{ __html: windArrow(degree, 10) }} />}
      {scale !== '' && <b style={{ fontWeight: 600 }}>{scale}</b>}
    </span>
  )
}

/** 天气详情：空气质量 / 日月起落。 */
function DetailSection({ bundle }: { bundle: WeatherBundle }) {
  const air = bundle.air
  const today = (bundle.days ?? [])[0]
  const rows: ReactNode[] = []
  if (air !== undefined && Number.isFinite(air.aqi)) {
    const parts = [`AQI ${air.aqi}`]
    if (air.category !== undefined) parts.push(air.category)
    if (air.primary !== undefined && air.primary !== '') parts.push(`首要污染物 ${air.primary}`)
    rows.push(
      <div key="air" style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10.5 }}>
        <span style={{ flex: 'none', color: faint }}>空气质量</span>
        <b style={{ color: fg, fontWeight: 600 }}>{parts.join(' · ')}</b>
      </div>,
    )
  }
  const astro: string[] = []
  if (today?.sunrise !== undefined) astro.push(`日出 ${hourLabel(today.sunrise)}`)
  if (today?.sunset !== undefined) astro.push(`日落 ${hourLabel(today.sunset)}`)
  if (today?.moonrise !== undefined) astro.push(`月出 ${hourLabel(today.moonrise)}`)
  if (today?.moonset !== undefined) astro.push(`月落 ${hourLabel(today.moonset)}`)
  if (astro.length > 0) {
    rows.push(
      <div key="astro" style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10.5 }}>
        <span style={{ flex: 'none', color: faint }}>日月起落</span>
        <b style={{ color: fg, fontWeight: 600 }}>{astro.join(' · ')}</b>
      </div>,
    )
  }
  if (rows.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.6px', color: muted }}>
        <span style={{ width: 3.5, height: 11, borderRadius: 2, background: 'linear-gradient(180deg,' + sky + ',' + orange + ')' }} />
        天气详情
      </div>
      {rows}
    </div>
  )
}

/** 预警区：标题 + 计数徽章；多条预警横向并排（随文字宽度 2-3 个/行）。 */
function AlertRows({ bundle }: { bundle: WeatherBundle }) {
  const alerts = (bundle.alerts ?? []).filter(shouldShowAlert).slice(0, 3)
  if (alerts.length === 0) return null
  const badgeColor = warningColor(alerts[0]!)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.6px', color: muted }}>
        <span style={{ width: 3.5, height: 11, borderRadius: 2, background: 'linear-gradient(180deg,' + sky + ',' + orange + ')' }} />
        预警
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16,
          padding: '0 5px', borderRadius: 8, fontSize: 9.5, fontWeight: 800, color: orange,
          background: 'linear-gradient(150deg,color-mix(in srgb,' + badgeColor + ' 16%,transparent),transparent 70%)',
          border: '1px solid color-mix(in srgb,' + badgeColor + ' 35%,transparent)',
          ...num,
        }}>{alerts.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {alerts.map((alert) => (
          <div key={alert.id} title={[alert.sender ?? '', alert.text ?? '', alert.instruction ?? ''].filter(Boolean).join('\n') || undefined} style={{
            flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 9,
            border: '1px solid ' + bd, borderLeft: '3px solid ' + warningColor(alert),
            background: 'linear-gradient(150deg,color-mix(in srgb,' + warningColor(alert) + ' 12%,transparent),transparent 60%)',
            boxShadow: '1px 2px 6px ' + shDark,
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: fg, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{alertHeadline(alert)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 侧边栏收起（rail）：仅图标块 + 气温。 */
function RailView({ bundle, status, error, onExpand }: {
  bundle?: WeatherBundle; status: string; error?: string; onExpand: () => void
}) {
  const now = bundle?.now
  let text: string
  if (now !== undefined) text = round1(now.temp) + '℃'
  else if (status === 'loading') text = '…'
  else if (status === 'error') text = '—'
  else text = '·'
  return (
    <button style={railButton} title={error ?? '和风天气'} onClick={onExpand} aria-label="展开侧边栏查看天气">
      {now !== undefined
        ? <span style={{ ...tile, width: 30, height: 30, borderRadius: 9 }} dangerouslySetInnerHTML={{ __html: weatherIcon(now.icon, 18, 'rail') }} />
        : <span style={{ ...tile, width: 30, height: 30, borderRadius: 9, color: sky, fontSize: 15, lineHeight: '30px' }}>☁</span>}
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, ...num }}>{text}</span>
    </button>
  )
}

/** 侧边栏展开（wide）：完整天气卡片。 */
function WideView({ bundle, status, error, refreshing, onRefresh, t }: {
  bundle?: WeatherBundle; status: string; error?: string; refreshing?: boolean
  onRefresh: () => void; t: (key: string) => string
}) {
  if (status === 'loading') {
    return <div style={card}><span style={{ color: muted, fontSize: 12 }}>{t('widget.loading')}</span></div>
  }
  if (bundle === undefined) {
    return (
      <div style={card}>
        <span style={{ color: muted, fontSize: 12 }}>{error ?? t('widget.empty')}</span>
        {status === 'error' && <button onClick={onRefresh} style={linkButton}>{t('widget.retry')}</button>}
      </div>
    )
  }
  const now = bundle.now
  const hours = (bundle.hours ?? []).slice(0, 5)
  return (
    <div style={card}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeLabel(bundle.place)}</span>
        <button onClick={onRefresh} title={t('widget.refresh')} style={{ ...linkButton, fontSize: 13, width: 22, height: 22, borderRadius: 8 }}>
          {refreshing === true ? '…' : '↻'}
        </button>
      </div>
      {now !== undefined && (
        <div style={row}>
          <IconTile code={now.icon} size={24} tileSize={38} uid="now" />
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontSize: 19, fontWeight: 800, lineHeight: 1, letterSpacing: '-.4px', ...num }}>
            <span>{round1(now.temp)}</span><span style={{ fontSize: 9, fontWeight: 800, color: orange, marginTop: 1.5 }}>℃</span>
          </span>
          <span style={{ color: muted, fontSize: 12 }}>{now.text}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, textAlign: 'right', color: muted, lineHeight: 1.4 }}>
            {now.feelsLike !== undefined && <span>体感 <b style={{ color: fg, fontWeight: 700, ...num }}>{round1(now.feelsLike)}℃</b></span>}
            {now.humidity !== undefined && <span>湿度 <b style={{ color: fg, fontWeight: 700, ...num }}>{now.humidity}%</b></span>}
          </span>
        </div>
      )}
      {hours.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.6px', color: muted, marginBottom: 6 }}>
            <span style={{ width: 3.5, height: 11, borderRadius: 2, background: 'linear-gradient(180deg,' + sky + ',' + orange + ')' }} />
            {t('widget.hourly')}
          </div>
          <div style={hourGrid}>
            {hours.map((hour, index) => (
              <div key={hour.time} style={hourCell}>
                <span style={{ fontSize: 12, color: muted, fontWeight: 600, ...num }}>{hourLabel(hour.time)}</span>
                <Icon code={hour.icon} size={22} uid={'h' + index} />
                <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.1, ...num }}>{round1(hour.temp)}<span style={{ fontSize: 8, fontWeight: 800, color: orange, marginLeft: 1 }}>℃</span></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, color: muted, fontWeight: 600, ...num }}><Raindrop size={10} />{percent(hour.pop)}</span>
                <WindMark degree={hour.windDegree} scale={windScaleLabel(hour.windScale)} dir={hour.windDir} />
              </div>
            ))}
          </div>
        </div>
      )}
      <AlertRows bundle={bundle} />
      <DetailSection bundle={bundle} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: faint, borderTop: '1px dashed ' + bd, paddingTop: 8 }}>
        <span>{t('widget.updated')} {hourLabel(bundle.receivedAt)}</span>
        <span>和风天气</span>
      </div>
    </div>
  )
}

const linkButton: CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', color: skyDeep, fontSize: 12, padding: 0,
}

/** 槽位入口组件。 */
export function SidebarWeatherWidget(props: SidebarWeatherWidgetProps) {
  ensureSidebarLayoutStyle()
  const settings = useQWeatherSettings()
  const { state, refresh } = useWeather(settings, props.saveAuto)
  if (settings?.enabled !== true) return null
  const wide = props.wide
  // 展开态：根元素挂 .qw-sidebar-wide（order:-1 + 宿主容器改纵向，上下排布）；
  // 收起态：display:contents 让按钮保持原 DOM 结构（窄栏布局不变）。
  return (
    <div className={wide ? 'qw-sidebar-wide' : 'qw-sidebar-rail'} style={wide ? undefined : { display: 'contents' }}>
      {wide
        ? <WideView bundle={state.bundle} status={state.status} error={state.error} refreshing={state.refreshing}
            onRefresh={() => void refresh()} t={props.qw} />
        : <RailView bundle={state.bundle} status={state.status} error={state.error} onExpand={props.onExpand} />}
    </div>
  )
}
