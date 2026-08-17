/**
 * 对话内交互式天气卡片（qweather_card）的 HTML fragment 生成器。
 *
 * v3 视觉：新拟态 + 玻璃拟态混合。
 * - 卡片 = 毛玻璃面板（半透明渐变 + backdrop-filter + 顶部内高光），无外部辉光/投影，
 *   卡片外背景透明，直接融入对话；
 * - 小时格与图标块 = 外凸新拟态；气温直接标在小时格内（不再用气温曲线）；
 * - 小时格内容：时间 / 天气图标 / 气温 / 降水概率（带雨滴图标）/ 风向箭头 + 风级数字；
 * - 卡片追加「天气详情」：空气质量、日月起落、生活指数；
 * - 配色：亮色 = 白 + 灰 + 浅天蓝 + 鲜艳橙；暗色 = 更深的海军蓝玻璃；
 * - 温度单位统一 ℃。颜色经 light-dark() 自适配（外壳负责 color-scheme）。
 */

import type { HourlyWeather, WeatherBundle } from './types.ts'
import {
  alertHeadline, curateIndices, escapeHtml, hourLabel, indexLabel, percent, placeLabel, round1,
  shouldShowAlert, warningColor, windScaleLabel,
} from './types.ts'
import { raindropIcon, weatherIcon, windArrow } from './icons.ts'

/** 卡片样式表（fragment 必须内联带上，否则 SVG 落入默认黑色填充）。 */
const CARD_CSS = `
.qw,.qw *{box-sizing:border-box}
.qw{font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
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
  color:var(--f);background:transparent}
/* 卡片主体：纯玻璃渐变，无外部辉光/投影；仅保留内部顶缘高光，背景透明以融入对话。 */
.qw-card{position:relative;display:flex;flex-direction:column;gap:12px;border-radius:18px;padding:16px 18px 14px;border:1px solid var(--bd);
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b));
  backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15);
  box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.08))}
.qw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.qw-loc{font-size:15px;font-weight:800;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-updated{flex:none;font-size:12px;color:var(--m);font-variant-numeric:tabular-nums}
.qw-now{display:flex;align-items:center;gap:12px}
.qw-now-icon{flex:none;display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:16px;
  background:linear-gradient(145deg,light-dark(#e0f4ff,#1c2e4e),light-dark(#bfe4ff,#0e1a30));
  box-shadow:5px 5px 12px var(--sh-dark),-4px -4px 10px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09))}
.qw-now-main{display:flex;flex-direction:column;line-height:1.08}
.qw-now-temp{display:flex;align-items:flex-start;gap:1px}
.qw-now-temp .n{font-size:31px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.qw-now-temp .deg{font-size:14px;font-weight:800;color:var(--orange);margin-top:2.5px}
.qw-now-text{font-size:13px;color:var(--m)}
.qw-now-meta{margin-left:auto;display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:4px;font-size:12px;text-align:right}
.qw-now-meta .k{color:var(--s)}
.qw-now-meta .v{color:var(--f);font-weight:700;font-variant-numeric:tabular-nums}
.qw-sec-title{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.6px;color:var(--m)}
.qw-sec-title::before{content:'';flex:none;width:4px;height:13px;border-radius:2px;background:linear-gradient(180deg,var(--sky),var(--orange));box-shadow:0 1px 4px light-dark(rgba(148,163,184,.45),rgba(0,0,0,.45))}
.qw-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;color:var(--orange);font-size:11.5px;font-weight:800;font-variant-numeric:tabular-nums;
  background:linear-gradient(150deg,color-mix(in srgb,var(--bc,#f97316) 16%,transparent),transparent 70%);
  border:1px solid color-mix(in srgb,var(--bc,#f97316) 35%,transparent);
  box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.7),rgba(255,255,255,.08))}
.qw-hours{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
.qw-hr{min-width:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 8px;border-radius:13px;border:1px solid var(--bd);
  background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:3px 3px 7px var(--sh-dark),-2.5px -2.5px 6px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.08))}
.qw-hr-time{font-size:13px;color:var(--m);font-weight:600;font-variant-numeric:tabular-nums}
.qw-hr-icon{display:flex;align-items:center;justify-content:center;height:34px}
.qw-hr-temp{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.qw-hr-temp .deg{font-size:9px;font-weight:800;color:var(--orange);margin-left:1px}
.qw-hr-pop{display:inline-flex;align-items:center;gap:2.5px;font-size:12px;color:var(--m);font-weight:600;font-variant-numeric:tabular-nums}
.qw-hr-pop svg{flex:none}
.qw-hr-wind{display:inline-flex;align-items:center;gap:2px;font-size:11.5px;color:var(--m);font-variant-numeric:tabular-nums;min-height:13px}
.qw-hr-wind svg{flex:none;color:var(--sky-deep)}
.qw-hr-wind b{font-weight:600}
.qw-alerts{display:flex;flex-wrap:wrap;gap:8px}
.qw-alert{flex:1 1 130px;min-width:0;display:flex;flex-direction:column;gap:3px;padding:9px 12px;border-radius:12px;border:1px solid var(--bd);border-left:3px solid var(--alert-c,#f59e0b);
  background:linear-gradient(150deg,color-mix(in srgb,var(--alert-c,#f59e0b) 12%,transparent),transparent 60%);
  box-shadow:2px 3px 8px var(--sh-dark),inset 0 1px 0 light-dark(rgba(255,255,255,.75),rgba(255,255,255,.06))}
.qw-alert-head{font-size:13.5px;font-weight:700;color:var(--f)}
.qw-alert-body{font-size:12.5px;color:var(--m);line-height:1.55}
.qw-empty{font-size:13px;color:var(--s)}
.qw-detail{display:flex;flex-direction:column;gap:6px}
.qw-detail-row{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.5}
.qw-detail-row .k{flex:none;color:var(--s)}
.qw-detail-row>b{color:var(--f);font-weight:600}
.qw-idx-wrap{display:flex;flex-wrap:wrap;gap:6px}
.qw-idx-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--f);font-weight:600;padding:4px 9px;border-radius:9px;border:1px solid var(--bd);
  background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:2.5px 2.5px 6px var(--sh-dark),-2px -2px 5px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.07))}
.qw-idx-chip .c{color:var(--sky-deep);font-weight:700}
.qw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px dashed var(--bd);font-size:12px;color:var(--s)}
.qw-foot a{color:var(--sky-deep);text-decoration:none;font-weight:700}
.qw-foot a:hover{color:var(--orange);text-decoration:underline}
`

/** 小时格里的气温。 */
function hourTempHtml(hour: HourlyWeather): string {
  return `<span class="qw-hr-temp">${escapeHtml(round1(hour.temp))}<span class="deg">℃</span></span>`
}

/** 小时格里的降水概率（前置雨滴图标）。 */
function hourPopHtml(hour: HourlyWeather): string {
  return `<span class="qw-hr-pop">${raindropIcon(11)}<span>${escapeHtml(percent(hour.pop))}</span></span>`
}

/** 小时格里的风向箭头 + 风级数字。 */
function hourWindHtml(hour: HourlyWeather): string {
  const scale = windScaleLabel(hour.windScale)
  const arrow = hour.windDegree !== undefined ? windArrow(hour.windDegree, 11) : ''
  if (arrow === '' && scale === '') return ''
  const title = escapeHtml([hour.windDir ?? '', scale !== '' ? `${scale}级` : ''].filter(Boolean).join(' · '))
  const titleAttr = title !== '' ? ` title="${title}"` : ''
  const num = scale !== '' ? `<b>${escapeHtml(scale)}</b>` : ''
  return `<span class="qw-hr-wind"${titleAttr}>${arrow}${num}</span>`
}

/** 组装一张完整的天气卡片 fragment。 */
export function buildCardFragment(bundle: WeatherBundle, hourCount = 5): string {
  // 卡片布局（5 列网格）按 5 小时硬编码：超出会换行堆叠，这里一律钳制到 5。
  const hours = (bundle.hours ?? []).slice(0, Math.max(1, Math.min(5, hourCount)))
  const alerts = (bundle.alerts ?? []).filter(shouldShowAlert).slice(0, 6)
  const air = bundle.air
  const today = (bundle.days ?? [])[0]
  const indices = curateIndices(bundle.indices ?? [])
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
  // 未来 N 小时：小时格（时间 / 图标 / 气温 / 降水概率+雨滴 / 风向箭头+风级）
  if (hours.length > 0) {
    parts.push('<div>')
    parts.push(`<div class="qw-sec-title">未来 ${hours.length} 小时</div>`)
    parts.push('<div class="qw-hours">')
    hours.forEach((hour, index) => {
      parts.push('<div class="qw-hr">')
      parts.push(`<span class="qw-hr-time">${escapeHtml(hourLabel(hour.time))}</span>`)
      parts.push(`<span class="qw-hr-icon">${weatherIcon(hour.icon, 28, 'h' + index)}</span>`)
      parts.push(hourTempHtml(hour))
      parts.push(hourPopHtml(hour))
      parts.push(hourWindHtml(hour))
      parts.push('</div>')
    })
    parts.push('</div>')
    parts.push('</div>')
  }
  // 预警（蓝色及以上，仅展示简要标题，正文放进 title 悬停提示）
  parts.push('<div>')
  parts.push(`<div class="qw-sec-title">预警${alerts.length > 0 ? `<span class="qw-badge" style="--bc:${warningColor(alerts[0]!)};">${alerts.length}</span>` : ''}</div>`)
  if (alerts.length === 0) {
    parts.push('<div class="qw-empty">当前无预警</div>')
  } else {
    parts.push('<div class="qw-alerts">')
    for (const alert of alerts) {
      const full = [alert.sender ?? '', alert.text ?? '', alert.instruction ?? ''].filter(Boolean).join('\n')
      parts.push(`<div class="qw-alert" style="--alert-c:${warningColor(alert)}" title="${escapeHtml(full)}">`)
      parts.push(`<div class="qw-alert-head">${escapeHtml(alertHeadline(alert))}</div>`)
      parts.push('</div>')
    }
    parts.push('</div>')
  }
  parts.push('</div>')
  // 天气详情：空气质量 / 日月起落 / 生活指数
  const detail: string[] = []
  if (air !== undefined && Number.isFinite(air.aqi)) {
    const airText = [`AQI ${air.aqi}`]
    if (air.category !== undefined) airText.push(air.category)
    if (air.primary !== undefined && air.primary !== '') airText.push(`首要污染物 ${air.primary}`)
    detail.push(`<div class="qw-detail-row"><span class="k">空气质量</span><b>${escapeHtml(airText.join(' · '))}</b></div>`)
  }
  const astro: string[] = []
  if (today?.sunrise !== undefined) astro.push(`日出 ${hourLabel(today.sunrise)}`)
  if (today?.sunset !== undefined) astro.push(`日落 ${hourLabel(today.sunset)}`)
  if (today?.moonrise !== undefined) astro.push(`月出 ${hourLabel(today.moonrise)}`)
  if (today?.moonset !== undefined) astro.push(`月落 ${hourLabel(today.moonset)}`)
  if (astro.length > 0) detail.push(`<div class="qw-detail-row"><span class="k">日月起落</span><b>${escapeHtml(astro.join(' · '))}</b></div>`)
  if (indices.length > 0) {
    const chips = indices.map((idx) =>
      `<span class="qw-idx-chip">${escapeHtml(indexLabel(idx.name))}${idx.category !== undefined ? `<span class="c">${escapeHtml(idx.category)}</span>` : ''}</span>`).join('')
    detail.push(`<div class="qw-detail-row"><span class="k">生活指数</span><span class="qw-idx-wrap">${chips}</span></div>`)
  }
  if (detail.length > 0) {
    parts.push('<div>')
    parts.push('<div class="qw-sec-title">天气详情</div>')
    parts.push('<div class="qw-detail">' + detail.join('') + '</div>')
    parts.push('</div>')
  }
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
