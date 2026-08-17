/**
 * 子功能 1：侧边栏底部的天气组件（注册到 sidebar.footer.action 槽位）。
 * - 侧边栏展开（wide）：当前天气 + 未来 5 小时 + 降水概率 + 黄色以上预警 + 更新时间；
 * - 侧边栏收起（rail）：仅当前天气图标 + 气温，点击展开侧边栏。
 * 主题色全部取自 DSH 的 --dsw-alias-* 令牌，自动适配明暗主题。
 */

import type { CSSProperties } from 'react'
import { weatherIcon } from '../qweather/icons.ts'
import type { WeatherBundle } from '../qweather/types.ts'
import { hourLabel, isYellowOrAbove, percent, placeLabel, round1 } from '../qweather/types.ts'
import { useSettingsSnapshot, useWeather, type SettingsScopeLike } from './use-qweather.ts'

/** 槽位组合属性：渲染参数 wide + 注册时注入的 scope / qw / onExpand。 */
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

const railButton: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 2, width: 44, padding: '6px 0', margin: '4px 0',
  background: 'transparent', border: 'none', cursor: 'pointer', color: fg,
  borderRadius: 10,
}

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  margin: '6px 0', padding: '10px 10px 8px',
  border: '1px solid ' + border, borderRadius: 12, background: cardBg,
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const hourGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }
const hourCell: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  padding: '5px 1px', borderRadius: 8, border: '1px solid ' + border,
}

function Icon({ code, size }: { code: string; size: number }) {
  return <span style={{ color: accent, display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: weatherIcon(code, size) }} />
}

/** 迷你气温曲线（内联 SVG，随侧边栏宽度自适应）。 */
function MiniCurve({ hours }: { hours: readonly { temp: number }[] }) {
  if (hours.length < 2) return null
  const W = 320
  const H = 44
  const PAD = 8
  const temps = hours.map((hour) => hour.temp)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const xs = hours.map((_, index) => PAD + index * ((W - PAD * 2) / (hours.length - 1)))
  const ys = temps.map((temp) => H - 8 - ((temp - min) / span) * (H - 16))
  const points = xs.map((x, index) => `${x.toFixed(1)},${ys[index]!.toFixed(1)}`).join(' ')
  const area = `M${xs[0]!.toFixed(1)},${H} L${points} L${xs[xs.length - 1]!.toFixed(1)},${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, marginTop: 6 }} aria-label="气温曲线">
      <path d={area} style={{ fill: accent, opacity: 0.12 }} />
      <polyline points={points} style={{ fill: 'none', stroke: accent, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
      {xs.map((x, index) => (
        <circle key={index} cx={x} cy={ys[index]} r={2} style={{ fill: 'transparent', stroke: accent, strokeWidth: 1.4 }} />
      ))}
    </svg>
  )
}

/** 侧边栏收起（rail）：仅图标 + 气温。 */
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
        ? <Icon code={now.icon} size={22} />
        : <span style={{ fontSize: 16, opacity: 0.7 }}>⛅</span>}
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1 }}>{text}</span>
    </button>
  )
}

/** 预警行（仅黄色及以上；最多展示前两条）。 */
function AlertRows({ bundle }: { bundle: WeatherBundle }) {
  const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 2)
  if (alerts.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {alerts.map((alert) => (
        <div key={alert.id} style={{
          fontSize: 11, lineHeight: 1.4, padding: '5px 8px', borderRadius: 8,
          border: '1px solid ' + border, borderLeft: '3px solid ' + warningColorOf(alert.color),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.headline}
        </div>
      ))}
    </div>
  )
}

function warningColorOf(color: string): string {
  return ({ yellow: '#e3a008', orange: '#e0662d', red: '#d9534f' } as Record<string, string>)[color] ?? '#e3a008'
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
        <span style={{ fontSize: 12, fontWeight: 600 }}>{placeLabel(bundle.place)}</span>
        <button onClick={onRefresh} title={t('widget.refresh')} style={{ ...linkButton, fontSize: 13 }}>
          {refreshing === true ? '…' : '↻'}
        </button>
      </div>
      {now !== undefined && (
        <div style={row}>
          <Icon code={now.icon} size={34} />
          <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{round1(now.temp)}°</span>
          <span style={{ color: muted, fontSize: 12 }}>{now.text}</span>
          <span style={{ marginLeft: 'auto', color: muted, fontSize: 11, textAlign: 'right', lineHeight: 1.5 }}>
            {now.feelsLike !== undefined && <span>体感 {round1(now.feelsLike)}°<br /></span>}
            {now.humidity !== undefined && <span>湿度 {now.humidity}%</span>}
          </span>
        </div>
      )}
      {hours.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: muted, marginBottom: 4 }}>{t('widget.hourly')}</div>
          <div style={hourGrid}>
            {hours.map((hour) => (
              <div key={hour.time} style={hourCell}>
                <span style={{ fontSize: 10, color: muted }}>{hourLabel(hour.time)}</span>
                <Icon code={hour.icon} size={16} />
                <span style={{ fontSize: 10, color: 'var(--dsw-alias-info-new-colorprimary-new-color)' }}>{percent(hour.pop)}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{round1(hour.temp)}°</span>
              </div>
            ))}
          </div>
          <MiniCurve hours={hours} />
        </div>
      )}
      <AlertRows bundle={bundle} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted }}>
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
