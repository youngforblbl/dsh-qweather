/**
 * 子功能 1：侧边栏底部的天气组件（注册到 sidebar.footer.action 槽位）。
 * v2 视觉：新拟态 + 玻璃拟态混合——玻璃卡片 + 来光投影 + 内凹小时格 +
 * 渐变图标块 + 橙色强调。亮色 = 白/灰/浅天蓝/鲜艳橙；暗色 = 更深的海军蓝玻璃。
 * - 展开（wide）：地点、当前天气（图标块+大温度+橙色°+参数网格）、
 *   未来 5 小时（时间/图标/降水概率/气温）+ 迷你曲线、黄色以上预警、更新时间；
 * - 收起（rail）：仅图标 + 气温，点击展开侧边栏。
 */

import type { CSSProperties } from 'react'
import { weatherIcon } from '../qweather/icons.ts'
import type { WeatherBundle } from '../qweather/types.ts'
import { hourLabel, isYellowOrAbove, percent, placeLabel, round1 } from '../qweather/types.ts'
import { useSettingsSnapshot, useWeather, type SettingsScopeLike } from './use-qweather.ts'

/** 槽位组合属性。 */
export interface SidebarWeatherWidgetProps {
  wide: boolean
  scope: SettingsScopeLike
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

// 卡片主体：纯玻璃渐变；主题色在卡片外部的对角光效阴影上（左上蓝、右下橙），
// 内部保持白高光 + 黑投影的新拟态光影。
const card: CSSProperties = {
  position: 'relative', display: 'flex', flexDirection: 'column', gap: 10,
  margin: '6px 0', padding: '13px 13px 11px',
  border: '1px solid ' + bd, borderRadius: 16,
  background: 'linear-gradient(150deg,' + glassA + ',' + glassB + ')',
  backdropFilter: 'blur(14px) saturate(1.15)', WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
  boxShadow: '-14px -13px 32px light-dark(rgba(56,189,248,.32),rgba(76,141,255,.20)),14px 13px 32px light-dark(rgba(249,115,22,.22),rgba(251,146,60,.13)),0 12px 28px light-dark(rgba(100,116,139,.20),rgba(0,0,0,.45)),8px 8px 20px ' + shDark + ',-8px -8px 20px ' + shLight + ',inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.07))',
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const hourGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }
const hourCell: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  padding: '7px 1px 6px', borderRadius: 11, border: '1px solid ' + bd,
  background: 'linear-gradient(145deg,' + cellA + ',' + cellB + ')',
  boxShadow: 'inset 2px 2px 5px ' + shDark + ',inset -2px -2px 5px ' + shLight,
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

/**
 * 迷你气温曲线（简洁单线，新拟态光影）：
 * 一条渐变曲线——高处（高温）橙色、低处（低温）天蓝；
 * 下方黑色细投影 + 上方白色细高光脊，无面积、无描点；
 * HTML 百分比定位的温度标签芯片（℃）任意宽度不变形，与小时格中心对齐。
 */
function MiniCurve({ hours }: { hours: readonly { temp: number }[] }) {
  if (hours.length < 2) return null
  const W = 320
  const H = 56
  const temps = hours.map((hour) => hour.temp)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const xs = hours.map((_, index) => 32 + index * 64) // 320 * (10% + i*20%)
  const ys = temps.map((temp) => H - 8 - ((temp - min) / span) * (H - 30))
  const points = xs.map((x, index) => x.toFixed(1) + ',' + ys[index]!.toFixed(1)).join(' ')
  return (
    <div style={{ position: 'relative', height: H, marginTop: 8 }} aria-label="气温曲线">
      <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: H }}>
        <defs>
          <linearGradient id="qw-side-chart-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="48">
            <stop offset="0%" style={{ stopColor: orange }} />
            <stop offset="100%" style={{ stopColor: sky }} />
          </linearGradient>
        </defs>
        <polyline points={points} transform="translate(0,1.3)" style={{ fill: 'none', stroke: 'light-dark(rgba(0,0,0,.26),rgba(0,0,0,.55))', strokeWidth: 3.6, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.38, vectorEffect: 'non-scaling-stroke' }} />
        <polyline points={points} style={{ fill: 'none', stroke: 'url(#qw-side-chart-stroke)', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' }} />
        <polyline points={points} transform="translate(0,-0.8)" style={{ fill: 'none', stroke: 'light-dark(rgba(255,255,255,.95),rgba(255,255,255,.22))', strokeWidth: 1, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.8, vectorEffect: 'non-scaling-stroke' }} />
      </svg>
      {hours.map((hour, index) => {
        const left = 10 + index * 20
        const top = ys[index]! / H * 100
        return (
          <span key={index} style={{
            position: 'absolute', left: left + '%', top: 'calc(' + top.toFixed(1) + '% - 6px)',
            transform: 'translate(-50%,-100%)', fontSize: 9, fontWeight: 700, color: fg,
            background: 'linear-gradient(150deg,' + cellA + ',' + cellB + ')', border: '1px solid ' + bd,
            borderRadius: 6, padding: '0 4px', boxShadow: '1px 2px 4px ' + shDark, ...num,
          }}>{round1(hour.temp)}℃</span>
        )
      })}
    </div>
  )
}

/**
 * 预警区：排版与对话内天气卡片完全一致——
 * 章节标题（渐变竖条 + 计数徽章）+ 左侧色条、着色渐变玻璃底、
 * 标题（正文字色加粗）+ 正文（弱化色）两行结构。
 */
function AlertRows({ bundle }: { bundle: WeatherBundle }) {
  const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 2)
  if (alerts.length === 0) return null
  const badgeColor = warningColorOf(alerts[0]!.color)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.6px', color: muted }}>
        <span style={{ width: 3.5, height: 11, borderRadius: 2, background: 'linear-gradient(180deg,' + sky + ',' + orange + ')' }} />
        重要预警
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16,
          padding: '0 5px', borderRadius: 8, fontSize: 9.5, fontWeight: 800, color: orange,
          background: 'linear-gradient(150deg,color-mix(in srgb,' + badgeColor + ' 16%,transparent),transparent 70%)',
          border: '1px solid color-mix(in srgb,' + badgeColor + ' 35%,transparent)',
          ...num,
        }}>{alerts.length}</span>
      </div>
      {alerts.map((alert) => (
        <div key={alert.id} style={{
          display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 9,
          border: '1px solid ' + bd, borderLeft: '3px solid ' + warningColorOf(alert.color),
          background: 'linear-gradient(150deg,color-mix(in srgb,' + warningColorOf(alert.color) + ' 12%,transparent),transparent 60%)',
          boxShadow: '1px 2px 6px ' + shDark,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: fg }}>{alert.headline}</div>
          {alert.text !== undefined && alert.text.trim().length > 0 && (
            <div style={{
              fontSize: 10.5, color: muted, lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{alert.text}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function warningColorOf(color: string): string {
  return ({ yellow: '#eab308', orange: '#f97316', red: '#ef4444' } as Record<string, string>)[color] ?? '#eab308'
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
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontSize: 24, fontWeight: 800, lineHeight: 1, letterSpacing: '-.4px', ...num }}>
            <span>{round1(now.temp)}</span><span style={{ fontSize: 11, fontWeight: 800, color: orange, marginTop: 1.5 }}>℃</span>
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
                <span style={{ fontSize: 9.5, color: faint, ...num }}>{hourLabel(hour.time)}</span>
                <Icon code={hour.icon} size={16} uid={'h' + index} />
                <span style={{ fontSize: 9.5, color: pop, fontWeight: 600, ...num }}>{percent(hour.pop)}</span>
              </div>
            ))}
          </div>
          <MiniCurve hours={hours} />
        </div>
      )}
      <AlertRows bundle={bundle} />
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
  const settings = useSettingsSnapshot(props.scope)
  const { state, refresh } = useWeather(settings, props.saveAuto)
  if (settings?.enabled !== true) return null
  return props.wide
    ? <WideView bundle={state.bundle} status={state.status} error={state.error} refreshing={state.refreshing}
        onRefresh={() => void refresh()} t={props.qw} />
    : <RailView bundle={state.bundle} status={state.status} error={state.error} onExpand={props.onExpand} />
}
