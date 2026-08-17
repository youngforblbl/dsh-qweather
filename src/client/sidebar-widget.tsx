/**
 * 子功能 1：侧边栏底部的天气组件（注册到 sidebar.footer.action 槽位）。
 * - 侧边栏展开（wide）：完整卡片——地点、当前天气（图标色块+温度+文字+参数网格）、
 *   未来 5 小时（时间/图标/降水概率/气温）+ 迷你气温曲线、黄色以上预警、更新时间；
 * - 侧边栏收起（rail）：仅图标 + 气温，点击展开侧边栏。
 * 视觉参考 https://uupm.cc/demo/investment-platform（Vestia）：
 * 圆角卡片 + 细描边 + 品牌色渐变色块图标 + tabular 数字 + 渐变面积曲线。
 * 颜色全部取自 DSH 的 --dsw-alias-* 令牌，自动适配明暗主题。
 */

import type { CSSProperties } from 'react'
import { weatherIcon } from '../qweather/icons.ts'
import type { WeatherBundle } from '../qweather/types.ts'
import { hourLabel, isYellowOrAbove, percent, placeLabel, round1 } from '../qweather/types.ts'
import { useSettingsSnapshot, useWeather, type SettingsScopeLike } from './use-qweather.ts'

/** 槽位组合属性：渲染参数 wide + 注册时注入的 scope / qw / onExpand / saveAuto。 */
export interface SidebarWeatherWidgetProps {
  wide: boolean
  scope: SettingsScopeLike
  qw: (key: string) => string
  onExpand: () => void
  /** 自动定位解析成功后把 LocationID/名称写回设置（由注册方注入，保持引用稳定）。 */
  saveAuto: (id: string, name: string) => void
}

const accent = 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)'
const fg = 'var(--dsw-alias-label-primary)'
const muted = 'var(--dsw-alias-label-caption)'
const border = 'var(--dsw-alias-border-l2)'
const cardBg = 'var(--dsw-alias-bg-layer-1)'
const pop = 'var(--dsw-alias-info-new-colorprimary-new-color)'
const cellBg = 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)'
const tint = 'color-mix(in srgb, ' + accent + ' 14%, transparent)'

const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' }

const railButton: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 3, width: 46, padding: '7px 0', margin: '4px 0',
  background: 'transparent', border: 'none', cursor: 'pointer', color: fg, borderRadius: 12,
}

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  margin: '6px 0', padding: '12px 12px 10px',
  border: '1px solid ' + border, borderRadius: 14, background: cardBg,
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const hourGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }
const hourCell: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  padding: '6px 1px 5px', borderRadius: 10, border: '1px solid ' + border, background: cellBg,
}

function Icon({ code, size }: { code: string; size: number }) {
  return <span style={{ color: accent, display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: weatherIcon(code, size) }} />
}

/** 品牌色圆角色块图标（Vestia feature-icon 风格）。 */
function IconTile({ code, size, tile }: { code: string; size: number; tile: number }) {
  return (
    <span style={{
      flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: tile, height: tile, borderRadius: Math.round(tile * 0.26), background: tint, color: accent,
    }} dangerouslySetInnerHTML={{ __html: weatherIcon(code, size) }} />
  )
}

/** 迷你气温曲线（渐变面积 + 平滑曲线 + 描点，随侧边栏宽度自适应）。 */
function MiniCurve({ hours }: { hours: readonly { temp: number }[] }) {
  if (hours.length < 2) return null
  const W = 320
  const H = 46
  const PAD = 12
  const temps = hours.map((hour) => hour.temp)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const xs = hours.map((_, index) => PAD + index * ((W - PAD * 2) / Math.max(1, hours.length - 1)))
  const ys = temps.map((temp) => H - 7 - ((temp - min) / span) * (H - 16))
  const points = xs.map((x, index) => x.toFixed(1) + ',' + ys[index]!.toFixed(1)).join(' ')
  const area = 'M' + xs[0]!.toFixed(1) + ',' + H + ' L' + points + ' L' + xs[xs.length - 1]!.toFixed(1) + ',' + H + ' Z'
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ width: '100%', height: H, marginTop: 5 }} aria-label="气温曲线">
      <defs>
        <linearGradient id="qw-side-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.26} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#qw-side-chart-fill)" />
      <polyline points={points} style={{ fill: 'none', stroke: accent, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' }} />
      {xs.map((x, index) => (
        <circle key={index} cx={x} cy={ys[index]} r={2.4} style={{ fill: cardBg, stroke: accent, strokeWidth: 1.6 }} />
      ))}
    </svg>
  )
}

/** 预警行（仅黄色及以上，最多 2 条）。 */
function AlertRows({ bundle }: { bundle: WeatherBundle }) {
  const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 2)
  if (alerts.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {alerts.map((alert) => (
        <div key={alert.id} style={{
          fontSize: 10.5, lineHeight: 1.45, padding: '5px 8px', borderRadius: 8,
          border: '1px solid ' + border, borderLeft: '3px solid ' + warningColorOf(alert.color),
          background: 'color-mix(in srgb, ' + warningColorOf(alert.color) + ' 6%, transparent)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.headline}
        </div>
      ))}
    </div>
  )
}

function warningColorOf(color: string): string {
  return ({ yellow: '#eab308', orange: '#f97316', red: '#ef4444' } as Record<string, string>)[color] ?? '#eab308'
}

/** 侧边栏收起（rail）：仅图标色块 + 气温。 */
function RailView({ bundle, status, error, onExpand }: {
  bundle?: WeatherBundle; status: string; error?: string; onExpand: () => void
}) {
  const now = bundle?.now
  let text: string
  if (now !== undefined) text = round1(now.temp) + '°'
  else if (status === 'loading') text = '…'
  else if (status === 'error') text = '—'
  else text = '·'
  return (
    <button style={railButton} title={error ?? '和风天气'} onClick={onExpand} aria-label="展开侧边栏查看天气">
      {now !== undefined
        ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: tint, color: accent }} dangerouslySetInnerHTML={{ __html: weatherIcon(now.icon, 18) }} />
        : <span style={{ width: 30, height: 30, borderRadius: 8, background: tint, color: accent, fontSize: 15, lineHeight: '30px' }}>☁</span>}
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
        <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeLabel(bundle.place)}</span>
        <button onClick={onRefresh} title={t('widget.refresh')} style={{ ...linkButton, fontSize: 13, width: 22, height: 22, borderRadius: 8 }}>
          {refreshing === true ? '…' : '↻'}
        </button>
      </div>
      {now !== undefined && (
        <div style={row}>
          <IconTile code={now.icon} size={24} tile={38} />
          <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, letterSpacing: '-.4px', ...num }}>{round1(now.temp)}°</span>
          <span style={{ color: muted, fontSize: 12 }}>{now.text}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10.5, textAlign: 'right', color: muted, lineHeight: 1.4 }}>
            {now.feelsLike !== undefined && <span>体感 <b style={{ color: fg, fontWeight: 600, ...num }}>{round1(now.feelsLike)}°</b></span>}
            {now.humidity !== undefined && <span>湿度 <b style={{ color: fg, fontWeight: 600, ...num }}>{now.humidity}%</b></span>}
          </span>
        </div>
      )}
      {hours.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.5px', color: muted, marginBottom: 5 }}>{t('widget.hourly')}</div>
          <div style={hourGrid}>
            {hours.map((hour) => (
              <div key={hour.time} style={hourCell}>
                <span style={{ fontSize: 9.5, color: muted, ...num }}>{hourLabel(hour.time)}</span>
                <Icon code={hour.icon} size={16} />
                <span style={{ fontSize: 9.5, color: pop, ...num }}>{percent(hour.pop)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, ...num }}>{round1(hour.temp)}°</span>
              </div>
            ))}
          </div>
          <MiniCurve hours={hours} />
        </div>
      )}
      <AlertRows bundle={bundle} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted, borderTop: '1px dashed ' + border, paddingTop: 7 }}>
        <span>{t('widget.updated')} {hourLabel(bundle.receivedAt)}</span>
        <span>和风天气</span>
      </div>
    </div>
  )
}

const linkButton: CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, padding: 0,
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
