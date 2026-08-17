/**
 * 对话内交互式天气卡片（qweather_card 工具）的 HTML fragment 生成器。
 *
 * 视觉风格参考 https://uupm.cc/demo/investment-platform（Vestia 金融面板）：
 *   - 面板卡片：elevated 背景 + 10% 白描边 + 16px 圆角 + 12px 间距
 *   - 数据排版：左侧标题 / 右侧数值，tabular-nums 对齐，mono 感数字
 *   - 曲线图：品牌色渐变面积（0.28 → 0）+ 2px 平滑曲线 + 描点
 *   - 图标：彩色 icon 放在品牌色 14% 圆角色块内（同 demo 的 feature-icon）
 *
 * 颜色优先级：iframe 外壳桥接的 --qw-*（跟随 DSH 明暗主题）→ light-dark() 兜底。
 * 卡片是纯静态 HTML + 内联 SVG，无脚本、无外部资源，可放进 sandbox iframe
 * 并逐字节回放；所有动态文本经过 escapeHtml。
 */

import type { HourlyWeather, WeatherBundle } from './types.ts'
import { escapeHtml, hourLabel, isYellowOrAbove, percent, placeLabel, round1, warningColor } from './types.ts'
import { weatherIcon } from './icons.ts'

/** 卡片样式表（必须在 fragment 内带上，否则 SVG 会落入浏览器默认黑色填充）。 */
const CARD_CSS = `
.qw,.qw *{box-sizing:border-box}
.qw{font:13px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  --f:var(--qw-foreground,light-dark(#0f172a,#f9fafb));
  --m:var(--qw-muted,light-dark(#64748b,#9ca3af));
  --s:light-dark(#94a3b8,#6b7280);
  --card:var(--qw-card,light-dark(#ffffff,#1f2937));
  --cell:light-dark(#f8fafc,#111827);
  --bd:var(--qw-border,light-dark(#e2e8f0,rgba(255,255,255,.10)));
  --ac:var(--qw-accent,light-dark(#2563eb,#3b82f6));
  --pop:var(--qw-pop,light-dark(#0284c7,#38bdf8));
  color:var(--f)}
.qw-card{display:flex;flex-direction:column;gap:12px;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:14px 16px 12px}
.qw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.qw-loc{font-size:14px;font-weight:700;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-updated{flex:none;font-size:11px;color:var(--m);font-variant-numeric:tabular-nums}
.qw-now{display:flex;align-items:center;gap:12px}
.qw-now-icon{flex:none;display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:12px;background:color-mix(in srgb,var(--ac) 14%,transparent);color:var(--ac)}
.qw-now-main{display:flex;flex-direction:column;line-height:1.08}
.qw-now-temp{font-size:30px;font-weight:700;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.qw-now-text{font-size:12px;color:var(--m)}
.qw-now-meta{margin-left:auto;display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:4px;font-size:11px;text-align:right}
.qw-now-meta .k{color:var(--s)}
.qw-now-meta .v{color:var(--f);font-weight:600;font-variant-numeric:tabular-nums}
.qw-sec-title{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.5px;color:var(--m)}
.qw-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:color-mix(in srgb,var(--bc,#f59e0b) 16%,transparent);color:var(--bc,#f59e0b);font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums}
.qw-hours{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.qw-hr{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 2px 7px;background:var(--cell);border:1px solid var(--bd);border-radius:12px}
.qw-hr-time{font-size:10px;color:var(--s);font-variant-numeric:tabular-nums}
.qw-hr-icon{display:flex;align-items:center;justify-content:center;height:22px;color:var(--ac)}
.qw-hr-pop{font-size:10px;color:var(--pop);font-variant-numeric:tabular-nums}
.qw-hr-text{font-size:10.5px;color:var(--m);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qw-hr-temp{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.qw-chart{display:block;width:100%;height:80px;margin-top:8px}
.qw-chart-line{fill:none;stroke:var(--ac);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.qw-chart-dot{fill:var(--card);stroke:var(--ac);stroke-width:2;vector-effect:non-scaling-stroke}
.qw-chart-label{font-size:10px;fill:var(--s);font-variant-numeric:tabular-nums}
.qw-alert{display:flex;flex-direction:column;gap:3px;padding:8px 12px;border:1px solid var(--bd);border-left:3px solid var(--alert-c,#f59e0b);border-radius:10px;background:color-mix(in srgb,var(--alert-c,#f59e0b) 6%,transparent)}
.qw-alert-head{font-size:12.5px;font-weight:600;color:var(--f)}
.qw-alert-body{font-size:11.5px;color:var(--m);line-height:1.55}
.qw-empty{font-size:12px;color:var(--s)}
.qw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px dashed var(--bd);font-size:11px;color:var(--s)}
.qw-foot a{color:var(--ac);text-decoration:none;font-weight:600}
.qw-foot a:hover{text-decoration:underline}
`

/** 取整到 0.1，减少路径体积。 */
function r1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * 折线点 → Catmull-Rom 平滑曲线路径（同 demo 的 Q/T 贝塞尔观感）。
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 2) return ''
  let d = 'M' + points[0]![0] + ',' + points[0]![1]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? p2
    const c1x = r1(p1[0] + (p2[0] - p0[0]) / 6)
    const c1y = r1(p1[1] + (p2[1] - p0[1]) / 6)
    const c2x = r1(p2[0] - (p3[0] - p1[0]) / 6)
    const c2y = r1(p2[1] - (p3[1] - p1[1]) / 6)
    d += ' C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1]
  }
  return d
}

/** 图表坐标尺寸（viewBox 400x96，preserveAspectRatio=none 自适应宽度）。 */
const CHART_W = 400
const CHART_H = 80
const CHART_PAD_X = 18
const CHART_TOP = 26
const CHART_BOTTOM = CHART_H - 8

/**
 * 生成 5 小时气温曲线（品牌色渐变面积 + 平滑曲线 + 描点 + 温度标签）。
 */
export function tempChartSvg(hours: readonly HourlyWeather[]): string {
  if (hours.length < 2) return ''
  const temps = hours.map((hour) => hour.temp)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const step = (CHART_W - CHART_PAD_X * 2) / Math.max(1, hours.length - 1)
  const points = hours.map((hour, index) => {
    const x = r1(CHART_PAD_X + index * step)
    const y = r1(CHART_BOTTOM - ((hour.temp - min) / span) * (CHART_BOTTOM - CHART_TOP))
    return [x, y] as const
  })
  const line = smoothPath(points)
  const last = points[points.length - 1]!
  const first = points[0]!
  const area = line + ' L' + last[0] + ',' + CHART_H + ' L' + first[0] + ',' + CHART_H + ' Z'
  const dots = points.map(([x, y]) => `<circle class="qw-chart-dot" cx="${x}" cy="${y}" r="3"/>`).join('')
  const labels = points.map(([x, y], index) => `<text class="qw-chart-label" x="${x}" y="${r1(y - 9)}" text-anchor="middle">${round1(temps[index]!)}°</text>`).join('')
  return `<svg class="qw-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" aria-label="气温曲线">`
    + `<defs><linearGradient id="qw-chart-fill" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" stop-color="var(--ac)" stop-opacity="0.28"/>`
    + `<stop offset="100%" stop-color="var(--ac)" stop-opacity="0"/>`
    + `</linearGradient></defs>`
    + `<path class="qw-chart-area" d="${area}" fill="url(#qw-chart-fill)"/>`
    + `<path class="qw-chart-line" d="${line}"/>`
    + dots + labels
    + `</svg>`
}

/** 组装一张完整的天气卡片 fragment。 */
export function buildCardFragment(bundle: WeatherBundle, hourCount = 5): string {
  const hours = (bundle.hours ?? []).slice(0, Math.max(1, Math.min(24, hourCount)))
  const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 6)
  const now = bundle.now
  const parts: string[] = []
  parts.push('<div class="qw">')
  parts.push('<style>' + CARD_CSS + '</style>')
  parts.push('<div class="qw-card">')
  // 头部：地点 + 更新时间
  parts.push('<div class="qw-head">')
  parts.push(`<span class="qw-loc" title="${escapeHtml(placeLabel(bundle.place))}">${escapeHtml(placeLabel(bundle.place))}</span>`)
  parts.push(`<span class="qw-updated">更新于 ${escapeHtml(hourLabel(bundle.receivedAt))}</span>`)
  parts.push('</div>')
  // 实时天气：icon 色块 + 大温度 + 右侧参数网格
  if (now !== undefined) {
    parts.push('<div class="qw-now">')
    parts.push(`<span class="qw-now-icon">${weatherIcon(now.icon, 28)}</span>`)
    parts.push('<div class="qw-now-main">')
    parts.push(`<span class="qw-now-temp">${escapeHtml(round1(now.temp))}°</span>`)
    parts.push(`<span class="qw-now-text">${escapeHtml(now.text || '')}</span>`)
    parts.push('</div>')
    const meta: string[] = []
    if (now.feelsLike !== undefined) meta.push(`<span class="k">体感</span><span class="v">${escapeHtml(round1(now.feelsLike))}°</span>`)
    if (now.humidity !== undefined) meta.push(`<span class="k">湿度</span><span class="v">${now.humidity}%</span>`)
    if (now.windDir !== undefined || now.windScale !== undefined) {
      meta.push(`<span class="k">风</span><span class="v">${escapeHtml(now.windDir ?? '')}${now.windScale !== undefined ? ' ' + now.windScale + '级' : ''}</span>`)
    }
    if (meta.length > 0) parts.push(`<div class="qw-now-meta">${meta.join('')}</div>`)
    parts.push('</div>')
  }
  // 未来 N 小时：小时格 + 气温曲线
  if (hours.length > 0) {
    parts.push('<div>')
    parts.push(`<div class="qw-sec-title">未来 ${hours.length} 小时</div>`)
    parts.push('<div class="qw-hours">')
    for (const hour of hours) {
      parts.push('<div class="qw-hr">')
      parts.push(`<span class="qw-hr-time">${escapeHtml(hourLabel(hour.time))}</span>`)
      parts.push(`<span class="qw-hr-icon">${weatherIcon(hour.icon, 20)}</span>`)
      parts.push(`<span class="qw-hr-pop">${escapeHtml(percent(hour.pop))}</span>`)
      parts.push(`<span class="qw-hr-text" title="${escapeHtml(hour.text || '')}">${escapeHtml(hour.text || '')}</span>`)
      parts.push(`<span class="qw-hr-temp">${escapeHtml(round1(hour.temp))}°</span>`)
      parts.push('</div>')
    }
    parts.push('</div>')
    parts.push(tempChartSvg(hours))
    parts.push('</div>')
  }
  // 重要预警（黄色及以上）
  parts.push('<div>')
  parts.push(`<div class="qw-sec-title">重要预警${alerts.length > 0 ? `<span class="qw-badge" style="--bc:${warningColor(alerts[0]!)};">${alerts.length}</span>` : ''}</div>`)
  if (alerts.length === 0) {
    parts.push('<div class="qw-empty">当前无黄色及以上预警</div>')
  } else {
    for (const alert of alerts) {
      parts.push(`<div class="qw-alert" style="--alert-c:${warningColor(alert)}">`)
      parts.push(`<div class="qw-alert-head">${escapeHtml(alert.headline)}</div>`)
      if (alert.text !== undefined && alert.text.trim().length > 0) {
        parts.push(`<div class="qw-alert-body">${escapeHtml(alert.text.trim())}</div>`)
      }
      parts.push('</div>')
    }
  }
  parts.push('</div>')
  // 底部：数据来源与时间
  parts.push('<div class="qw-foot">')
  parts.push('<span>数据来源：和风天气</span>')
  parts.push(`<a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">QWeather.com ↗</a>`)
  parts.push('</div>')
  parts.push('</div>')
  parts.push('</div>')
  return parts.join('\n')
}

/** 卡片字节数（工具结果里向模型报告）。 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
