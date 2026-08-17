/**
 * 对话内交互式天气卡片（qweather_card 工具）的 HTML fragment 生成器。
 * 卡片是纯静态 HTML + 内联 SVG + 内联 CSS，无任何脚本、无外部资源，
 * 因此可以放进 sandbox iframe 并保持字节级可回放。所有动态文本都经过
 * escapeHtml，天气图标来自 icons.ts 的内联 SVG。
 */

import type { HourlyWeather, WeatherBundle } from './types.ts'
import { escapeHtml, hourLabel, isYellowOrAbove, percent, placeLabel, round1, WARNING_NAMES, warningColor } from './types.ts'
import { weatherIcon } from './icons.ts'

/** 卡片基础样式（CSS 变量由 iframe 外壳桥接，缺省时回退到中性色）。 */
const CARD_CSS = `
.qw{font:13px/1.55 system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:var(--qw-foreground,#20293a);display:flex;flex-direction:column;gap:10px;padding:6px 2px}
.qw *{box-sizing:border-box}
.qw-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.qw-place{font-size:14px;font-weight:600;letter-spacing:.2px}
.qw-updated{font-size:11px;color:var(--qw-muted,#7a8799);white-space:nowrap}
.qw-now{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--qw-border,rgba(120,140,170,.28));border-radius:12px;background:var(--qw-card,rgba(127,146,178,.08))}
.qw-ic{display:block;flex:none}
.qw-now-temp{font-size:34px;font-weight:600;line-height:1.1;letter-spacing:-.5px}
.qw-now-text{color:var(--qw-muted,#7a8799)}
.qw-now-meta{margin-left:auto;display:flex;flex-direction:column;gap:2px;color:var(--qw-muted,#7a8799);font-size:12px;text-align:right;white-space:nowrap}
.qw-sec-title{font-size:11px;font-weight:600;color:var(--qw-muted,#7a8799);letter-spacing:.4px;margin:2px 0 6px}
.qw-hours{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.qw-hr{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px;border:1px solid var(--qw-border,rgba(120,140,170,.28));border-radius:10px;background:var(--qw-card,rgba(127,146,178,.08))}
.qw-hr-time{font-size:11px;color:var(--qw-muted,#7a8799)}
.qw-hr-pop{font-size:11px;color:var(--qw-pop,#3fa0d8)}
.qw-hr-text{font-size:11px;color:var(--qw-muted,#7a8799);white-space:nowrap;overflow:hidden;max-width:100%;text-overflow:ellipsis}
.qw-hr-temp{font-size:14px;font-weight:600}
.qw-chart{width:100%;height:64px}
.qw-chart .qw-cv-line{stroke:var(--qw-accent,#3b74f5);stroke-width:2;fill:none;stroke-linejoin:round;stroke-linecap:round}
.qw-chart .qw-cv-area{stroke:none;fill:var(--qw-accent,#3b74f5);opacity:.12}
.qw-chart .qw-cv-dot{stroke:var(--qw-accent,#3b74f5);fill:var(--qw-card,#fff)}
.qw-chart .qw-cv-label{font-size:10px;fill:var(--qw-muted,#7a8799)}
.qw-alert{display:flex;flex-direction:column;gap:2px;padding:8px 10px 8px 12px;border:1px solid var(--qw-border,rgba(120,140,170,.28));border-left:3px solid var(--qw-alert-color,#e3a008);border-radius:10px}
.qw-alert-head{font-weight:600;font-size:13px}
.qw-alert-body{color:var(--qw-muted,#7a8799);font-size:12px}
.qw-empty{color:var(--qw-muted,#7a8799);font-size:12px}
.qw-foot{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;color:var(--qw-muted,#7a8799);border-top:1px dashed var(--qw-border,rgba(120,140,170,.28));padding-top:6px}
.qw-foot a{color:var(--qw-accent,#3b74f5);text-decoration:none}
`

/** 生成 5 小时气温曲线（内联 SVG，无脚本、无外部依赖）。 */
export function tempChartSvg(hours: readonly HourlyWeather[]): string {
  if (hours.length < 2) return ''
  const W = 320
  const H = 64
  const PAD = 12
  const temps = hours.map((hour) => hour.temp)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const xs = hours.map((_, index) => PAD + index * ((W - PAD * 2) / Math.max(1, hours.length - 1)))
  const ys = temps.map((temp) => H - 16 - ((temp - min) / span) * (H - 32))
  const points = xs.map((x, index) => `${x.toFixed(1)},${ys[index]!.toFixed(1)}`).join(' ')
  const dots = xs.map((x, index) => `<circle class="qw-cv-dot" cx="${x.toFixed(1)}" cy="${ys[index]!.toFixed(1)}" r="2.6" stroke-width="1.4"/>`).join('')
  const labels = xs.map((x, index) => `<text class="qw-cv-label" x="${x.toFixed(1)}" y="${(ys[index]! - 8).toFixed(1)}" text-anchor="middle">${round1(temps[index]!)}°</text>`).join('')
  return `<svg class="qw-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="气温曲线">`
    + `<path class="qw-cv-area" d="M${xs[0]!.toFixed(1)},${H} L${points} L${xs[xs.length - 1]!.toFixed(1)},${H} Z"/>\n`
    + `<polyline class="qw-cv-line" points="${points}"/>\n${dots}\n${labels}</svg>`
}

/** 组装一张完整的天气卡片 fragment。 */
export function buildCardFragment(bundle: WeatherBundle, hourCount = 5): string {
  const hours = (bundle.hours ?? []).slice(0, Math.max(1, Math.min(24, hourCount)))
  const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 6)
  const now = bundle.now
  const parts: string[] = []
  parts.push('<div class="qw">')
  // 头部：地点 + 更新时间
  parts.push('<div class="qw-head">')
  parts.push(`<span class="qw-place">${escapeHtml(placeLabel(bundle.place))}</span>`)
  parts.push(`<span class="qw-updated">更新于 ${escapeHtml(hourLabel(bundle.receivedAt))}</span>`)
  parts.push('</div>')
  // 实时天气
  if (now !== undefined) {
    parts.push('<div class="qw-now">')
    parts.push(`<span style="color:var(--qw-accent,#3b74f5)">${weatherIcon(now.icon, 44)}</span>`)
    parts.push('<span>')
    parts.push(`<span class="qw-now-temp">${escapeHtml(round1(now.temp))}°</span> `)
    parts.push(`<span class="qw-now-text">${escapeHtml(now.text || '')}</span>`)
    parts.push('</span>')
    const meta: string[] = []
    if (now.feelsLike !== undefined) meta.push(`体感 ${escapeHtml(round1(now.feelsLike))}°`)
    if (now.humidity !== undefined) meta.push(`湿度 ${now.humidity}%`)
    if (now.windDir !== undefined || now.windScale !== undefined) meta.push(`风 ${escapeHtml(now.windDir ?? '')} ${now.windScale ?? ''}级`.trim())
    if (meta.length > 0) parts.push(`<span class="qw-now-meta">${meta.map((text) => `<span>${text}</span>`).join('')}</span>`)
    parts.push('</div>')
  }
  // 未来 5 小时
  if (hours.length > 0) {
    parts.push(`<div><div class="qw-sec-title">未来 ${hours.length} 小时</div>`)
    parts.push('<div class="qw-hours">')
    for (const hour of hours) {
      parts.push('<div class="qw-hr">')
      parts.push(`<span class="qw-hr-time">${escapeHtml(hourLabel(hour.time))}</span>`)
      parts.push(`<span style="color:var(--qw-accent,#3b74f5)">${weatherIcon(hour.icon, 22)}</span>`)
      parts.push(`<span class="qw-hr-pop">${escapeHtml(percent(hour.pop))}</span>`)
      parts.push(`<span class="qw-hr-text" title="${escapeHtml(hour.text || '')}">${escapeHtml(hour.text || '')}</span>`)
      parts.push(`<span class="qw-hr-temp">${escapeHtml(round1(hour.temp))}°</span>`)
      parts.push('</div>')
    }
    parts.push('</div>')
    parts.push(`<div style="margin-top:6px">${tempChartSvg(hours)}</div>`)
    parts.push('</div>')
  }
  // 重要预警（黄色及以上）
  parts.push('<div>')
  parts.push(`<div class="qw-sec-title">重要预警${alerts.length > 0 ? `（${alerts.length}）` : ''}</div>`)
  if (alerts.length === 0) {
    parts.push('<div class="qw-empty">当前无黄色及以上预警</div>')
  } else {
    for (const alert of alerts) {
      parts.push(`<div class="qw-alert" style="--qw-alert-color:${warningColor(alert)}">`)
      parts.push(`<div class="qw-alert-head">${escapeHtml(alert.headline)}</div>`)
      if (alert.text !== undefined && alert.text.length > 0) {
        parts.push(`<div class="qw-alert-body">${escapeHtml(alert.text.trim())}</div>`)
      }
      parts.push('</div>')
    }
  }
  parts.push('</div>')
  // 底部：数据来源与时间
  parts.push('<div class="qw-foot">')
  parts.push('<span>数据来源：和风天气</span>')
  parts.push(`<a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">QWeather.com</a>`)
  parts.push('</div>')
  parts.push('</div>')
  return parts.join('\n')
}

/** 卡片字节数（工具结果里向模型报告）。 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** 供预览脚本使用的预警中文名映射。 */
export function warningNameOf(color: string): string {
  return WARNING_NAMES[color.toLowerCase()] ?? '预警'
}
