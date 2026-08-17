/**
 * 对话内交互式天气卡片（qweather_card）的 HTML fragment 生成器。
 *
 * v3 视觉：新拟态 + 玻璃拟态混合。
 * - 卡片 = 毛玻璃面板（半透明渐变 + backdrop-filter + 顶部内高光 + 来光投影）；
 * - 小时格 = 内凹新拟态；图标块 = 外凸新拟态；气温曲线 = 内凹玻璃「凹槽」，
 *   渐变面积 + 平滑折线（SVG 内辉光）+ HTML 定位的描点与温度标签芯片——
 *   文字永不随卡片宽度拉伸，描点 x 与上方 5 列小时格中心对齐；
 * - 温度只标注在曲线上，小时格内不重复；
 * - 配色：亮色 = 白 + 灰 + 浅天蓝 + 鲜艳橙；暗色 = 更深的海军蓝玻璃；
 * - 温度单位统一 ℃。颜色经 light-dark() 自适配（外壳负责 color-scheme）。
 */

import type { HourlyWeather, WeatherBundle } from './types.ts'
import { escapeHtml, hourLabel, isYellowOrAbove, percent, placeLabel, round1, warningColor } from './types.ts'
import { weatherIcon } from './icons.ts'

/** 卡片样式表（fragment 必须内联带上，否则 SVG 落入默认黑色填充）。 */
const CARD_CSS = `
.qw,.qw *{box-sizing:border-box}
.qw{font:13px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  --f:light-dark(#3a4a61,#e8eefb);
  --m:light-dark(#64748b,#9fb0c7);
  --s:light-dark(#8fa0b5,#5f7089);
  --sky:light-dark(#38bdf8,#4c8dff);
  --sky-deep:light-dark(#0284c7,#2f6bff);
  --orange:light-dark(#f97316,#fb923c);
  --pop:light-dark(#0ea5e9,#56bad9);
  --glass-a:light-dark(rgba(255,255,255,.88),rgba(40,55,84,.86));
  --glass-b:light-dark(rgba(255,255,255,.55),rgba(17,26,44,.78));
  --cell-a:light-dark(rgba(255,255,255,.85),rgba(46,60,90,.80));
  --cell-b:light-dark(rgba(233,239,247,.75),rgba(20,30,50,.72));
  --bd:light-dark(rgba(255,255,255,.75),rgba(255,255,255,.10));
  --sh-dark:light-dark(rgba(148,163,184,.42),rgba(0,0,0,.6));
  --sh-light:light-dark(rgba(255,255,255,.95),rgba(96,116,150,.16));
  color:var(--f)}
/* 卡片主体：纯玻璃渐变（无蓝橙内部渐变）；主题色放在卡片外部的对角光效阴影上——
   左上偏天蓝、右下偏橙，内部仍保持白高光 + 黑投影的新拟态光影。 */
.qw-card{position:relative;display:flex;flex-direction:column;gap:12px;border-radius:18px;padding:16px 18px 14px;border:1px solid var(--bd);
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b));
  backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15);
  box-shadow:
    -9px -8px 20px light-dark(rgba(56,189,248,.16),rgba(76,141,255,.10)),
    9px 8px 20px light-dark(rgba(249,115,22,.11),rgba(251,146,60,.07)),
    0 14px 34px light-dark(rgba(100,116,139,.22),rgba(0,0,0,.45)),
    10px 10px 24px var(--sh-dark),-10px -10px 24px var(--sh-light),
    inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.08))}
.qw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.qw-loc{font-size:14px;font-weight:800;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-updated{flex:none;font-size:11px;color:var(--m);font-variant-numeric:tabular-nums}
.qw-now{display:flex;align-items:center;gap:12px}
.qw-now-icon{flex:none;display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:16px;
  background:linear-gradient(145deg,light-dark(#e0f4ff,#1c2e4e),light-dark(#bfe4ff,#0e1a30));
  box-shadow:5px 5px 12px var(--sh-dark),-4px -4px 10px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09))}
.qw-now-main{display:flex;flex-direction:column;line-height:1.08}
.qw-now-temp{display:flex;align-items:flex-start;gap:1px}
.qw-now-temp .n{font-size:31px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.qw-now-temp .deg{font-size:14px;font-weight:800;color:var(--orange);margin-top:2.5px}
.qw-now-text{font-size:12px;color:var(--m)}
.qw-now-meta{margin-left:auto;display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:4px;font-size:11px;text-align:right}
.qw-now-meta .k{color:var(--s)}
.qw-now-meta .v{color:var(--f);font-weight:700;font-variant-numeric:tabular-nums}
.qw-sec-title{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--m)}
.qw-sec-title::before{content:'';flex:none;width:4px;height:13px;border-radius:2px;background:linear-gradient(180deg,var(--sky),var(--orange));box-shadow:0 1px 4px light-dark(rgba(148,163,184,.45),rgba(0,0,0,.45))}
.qw-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 6px;border-radius:10px;color:var(--orange);font-size:10.5px;font-weight:800;font-variant-numeric:tabular-nums;
  background:linear-gradient(150deg,color-mix(in srgb,var(--bc,#f97316) 16%,transparent),transparent 70%);
  border:1px solid color-mix(in srgb,var(--bc,#f97316) 35%,transparent);
  box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.7),rgba(255,255,255,.08))}
.qw-hours{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.qw-hr{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 8px;border-radius:13px;border:1px solid var(--bd);
  background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:inset 2.5px 2.5px 6px var(--sh-dark),inset -2.5px -2.5px 6px var(--sh-light)}
.qw-hr-time{font-size:11.5px;color:var(--s);font-variant-numeric:tabular-nums}
.qw-hr-icon{display:flex;align-items:center;justify-content:center;height:28px}
.qw-hr-pop{font-size:11.5px;color:var(--pop);font-weight:600;font-variant-numeric:tabular-nums}
.qw-hr-text{font-size:12px;color:var(--m);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qw-chart{position:relative;height:92px;margin-top:12px}
/* 曲线投影：与图标小卡片同款的下投影（带模糊渐隐），无高光、无复制曲线 */
.qw-chart-svg{display:block;width:100%;height:92px;filter:drop-shadow(1px 6px 7px light-dark(rgba(0,0,0,.28),rgba(0,0,0,.5)))}
.qw-chart-line{fill:none;stroke-width:12;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.qw-chart-chip{position:absolute;transform:translate(-50%,-100%);font-size:15.5px;font-weight:700;color:var(--f);font-variant-numeric:tabular-nums;white-space:nowrap;text-shadow:0 1px 0 light-dark(rgba(255,255,255,.6),rgba(0,0,0,.35))}
.qw-alert{display:flex;flex-direction:column;gap:3px;padding:9px 12px;border-radius:12px;border:1px solid var(--bd);border-left:3px solid var(--alert-c,#f59e0b);
  background:linear-gradient(150deg,color-mix(in srgb,var(--alert-c,#f59e0b) 12%,transparent),transparent 60%);
  box-shadow:2px 3px 8px var(--sh-dark),inset 0 1px 0 light-dark(rgba(255,255,255,.75),rgba(255,255,255,.06))}
.qw-alert-head{font-size:12.5px;font-weight:700;color:var(--f)}
.qw-alert-body{font-size:11.5px;color:var(--m);line-height:1.55}
.qw-empty{font-size:12px;color:var(--s)}
.qw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px dashed var(--bd);font-size:11px;color:var(--s)}
.qw-foot a{color:var(--sky-deep);text-decoration:none;font-weight:700}
.qw-foot a:hover{color:var(--orange);text-decoration:underline}
`

/** 取整到 0.1，减少路径体积。 */
function r1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 折线点 → Catmull-Rom 平滑曲线路径。 */
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

/** 图表几何：viewBox 400x92；描点 x 取 10/30/50/70/90%（与上方 5 列小时格中心对齐）。 */
const CHART_W = 400
const CHART_H = 92
const CHART_TOP = 34
const CHART_BOTTOM = CHART_H - 8

/**
 * 气温曲线（简洁单线，新拟态光影）：
 * - 只有一条渐变曲线：颜色按温度纵向渐变——高处（高温）= 鲜艳橙，
 *   低处（低温）= 浅天蓝（暗色微调）；
 * - 光效仅两笔：下方黑色细投影 + 上方白色细高光脊（与新拟态 UI 一致），
 *   不做彩色辉光、不加渐变面积、不加描点，保持曲线完整简洁；
 * - 温度标签芯片（℃）按百分比绝对定位（HTML），任意卡片宽度下文字不变形，
 *   x 与上方 5 列小时格中心对齐。
 */
export function tempChartSvg(hours: readonly HourlyWeather[]): string {
  if (hours.length < 2) return ''
  const temps = hours.map((hour) => hour.temp)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const points = hours.map((hour, index) => {
    const x = r1(40 + index * 80) // 400 * (10% + i*20%)
    const y = r1(CHART_BOTTOM - ((hour.temp - min) / span) * (CHART_BOTTOM - CHART_TOP))
    return [x, y] as const
  })
  const line = smoothPath(points)
  const svg = `<svg class="qw-chart-svg" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" aria-hidden="true">`
    + '<defs>'
    + '<linearGradient id="qw-chart-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="34" x2="0" y2="84">'
    + '<stop offset="0%" style="stop-color:var(--orange)"/>'
    + '<stop offset="100%" style="stop-color:var(--sky)"/>'
    + '</linearGradient>'
    + '</defs>'
    + `<path class="qw-chart-line" d="${line}" stroke="url(#qw-chart-stroke)"/>`
    + '</svg>'
  const overlay = hours.map((hour, index) => {
    const [x, y] = points[index]!
    const left = 10 + index * 20
    const top = r1(y / CHART_H * 100)
    return `<span class="qw-chart-chip" style="left:${left}%;top:calc(${top}% - 9px)">${escapeHtml(round1(hour.temp))}℃</span>`
  }).join('')
  return `<div class="qw-chart">${svg}${overlay}</div>`
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
  // 实时天气：新拟态图标块 + 大温度（橙色 ℃）+ 右侧参数网格
  if (now !== undefined) {
    parts.push('<div class="qw-now">')
    parts.push(`<span class="qw-now-icon">${weatherIcon(now.icon, 30, 'now')}</span>`)
    parts.push('<div class="qw-now-main">')
    parts.push(`<span class="qw-now-temp"><span class="n">${escapeHtml(round1(now.temp))}</span><span class="deg">℃</span></span>`)
    parts.push(`<span class="qw-now-text">${escapeHtml(now.text || '')}</span>`)
    parts.push('</div>')
    const meta: string[] = []
    if (now.feelsLike !== undefined) meta.push(`<span class="k">体感</span><span class="v">${escapeHtml(round1(now.feelsLike))}℃</span>`)
    if (now.humidity !== undefined) meta.push(`<span class="k">湿度</span><span class="v">${now.humidity}%</span>`)
    if (now.windDir !== undefined || now.windScale !== undefined) {
      meta.push(`<span class="k">风</span><span class="v">${escapeHtml(now.windDir ?? '')}${now.windScale !== undefined ? ' ' + now.windScale + '级' : ''}</span>`)
    }
    if (meta.length > 0) parts.push(`<div class="qw-now-meta">${meta.join('')}</div>`)
    parts.push('</div>')
  }
  // 未来 N 小时：小时格（时间/图标/降水概率/天气文字，不含温度）+ 曲线凹槽（温度只在此标注）
  if (hours.length > 0) {
    parts.push('<div>')
    parts.push(`<div class="qw-sec-title">未来 ${hours.length} 小时</div>`)
    parts.push('<div class="qw-hours">')
    hours.forEach((hour, index) => {
      parts.push('<div class="qw-hr">')
      parts.push(`<span class="qw-hr-time">${escapeHtml(hourLabel(hour.time))}</span>`)
      parts.push(`<span class="qw-hr-icon">${weatherIcon(hour.icon, 22, 'h' + index)}</span>`)
      parts.push(`<span class="qw-hr-pop">${escapeHtml(percent(hour.pop))}</span>`)
      parts.push(`<span class="qw-hr-text" title="${escapeHtml(hour.text || '')}">${escapeHtml(hour.text || '')}</span>`)
      parts.push('</div>')
    })
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
  // 底部：数据来源
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
