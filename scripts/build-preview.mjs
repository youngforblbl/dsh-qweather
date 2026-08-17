/**
 * 生成 preview.html：一个可离线打开的 UI 预览页。
 * 左侧：侧边栏天气组件静态稿（展开 + 收起两种形态）；
 * 右侧：qweather_card 工具渲染的对话内卡片（真实模板产物）。
 * 数据来自 samples/sample-bundle.json（pnpm run preview 前先按需更新）。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { buildCardFragment, weatherIcon } from '../lib/index.js'
import { hourLabel, isYellowOrAbove, percent, placeLabel, round1 } from '../lib/index.js'

const bundle = JSON.parse(await readFile(new URL('../samples/sample-bundle.json', import.meta.url), 'utf8'))
const now = bundle.now
const hours = (bundle.hours ?? []).slice(0, 5)
const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 2)
const fragment = buildCardFragment(bundle, 5)
const warningColorOf = (color) => ({ yellow: '#e3a008', orange: '#e0662d', red: '#d9534f' }[color] ?? '#e3a008')

const hourCells = hours.map((h) => `
    <div class="hr">
      <span class="mut">${hourLabel(h.time)}</span>
      <span class="ic" style="color:var(--qw-accent)">${weatherIcon(h.icon, 16)}</span>
      <span class="pop">${percent(h.pop)}</span>
      <span class="t">${round1(h.temp)}°</span>
    </div>`).join('')

// 侧边栏展开态的迷你气温曲线（与组件 MiniCurve 同款算法）
const temps = hours.map((h) => h.temp)
const tMin = Math.min(...temps)
const tMax = Math.max(...temps)
const tSpan = tMax - tMin || 1
const W = 320, H = 44, PAD = 8
const tXs = hours.map((_, i) => PAD + i * ((W - PAD * 2) / Math.max(1, hours.length - 1)))
const tYs = temps.map((t) => H - 8 - ((t - tMin) / tSpan) * (H - 16))
const tPoints = tXs.map((x, i) => `${x.toFixed(1)},${tYs[i].toFixed(1)}`).join(' ')
const tArea = `M${tXs[0].toFixed(1)},${H} L${tPoints} L${tXs[tXs.length - 1].toFixed(1)},${H} Z`
const sideCurve = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;margin-top:6px">`
  + `<path d="${tArea}" style="fill:var(--qw-accent);opacity:.12"/>`
  + `<polyline points="${tPoints}" style="fill:none;stroke:var(--qw-accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round"/>`
  + tXs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${tYs[i].toFixed(1)}" r="2" style="fill:transparent;stroke:var(--qw-accent);stroke-width:1.4"/>`).join('')
  + '</svg>'

const alertRows = alerts.length === 0
  ? '<div class="mut" style="font-size:11px">当前无黄色及以上预警</div>'
  : alerts.map((a) => `<div class="alert" style="--c:${warningColorOf(a.color)}">${a.headline}</div>`).join('')

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-qweather 预览</title>
<style>
:root {
  --qw-foreground:#1f2733; --qw-muted:#7a8799; --qw-border:rgba(120,140,170,.3);
  --qw-accent:#3b74f5; --qw-card:rgba(127,146,178,.07); --qw-pop:#3fa0d8;
  --dsw-alias-label-primary:#1f2733; --dsw-alias-label-caption:#7a8799;
  --dsw-alias-border-l2:rgba(120,140,170,.3); --dsw-alias-bg-layer-1:rgba(127,146,178,.07);
  --dsw-alias-brand-primary-new-colorprimary-new-color:#3b74f5;
  --dsw-alias-info-new-colorprimary-new-color:#3fa0d8;
  --page:#eef1f6; --panel:#ffffff;
}
body.dark {
  --qw-foreground:#e8eef7; --qw-muted:#8fa0b8; --qw-border:rgba(140,160,190,.25);
  --qw-accent:#6b9bff; --qw-card:rgba(127,146,178,.10); --qw-pop:#5fb4e8;
  --dsw-alias-label-primary:#e8eef7; --dsw-alias-label-caption:#8fa0b8;
  --dsw-alias-border-l2:rgba(140,160,190,.25); --dsw-alias-bg-layer-1:rgba(127,146,178,.10);
  --dsw-alias-brand-primary-new-colorprimary-new-color:#6b9bff;
  --dsw-alias-info-new-colorprimary-new-color:#5fb4e8;
  --page:#0f141c; --panel:#161d29;
}
* { box-sizing: border-box }
body { margin:0; padding:32px 16px; background:var(--page); color:var(--dsw-alias-label-primary);
  font:14px/1.55 system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
.toggle { position:fixed; top:14px; right:14px; font-size:12px; padding:6px 12px; border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2); background:var(--panel); color:inherit; cursor:pointer }
.wrap { max-width:920px; margin:0 auto }
h1 { font-size:18px; margin:0 0 4px }
.sub { font-size:12px; color:var(--qw-muted); margin:0 0 20px }
.panels { display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap }
.panel { background:var(--panel); border:1px solid var(--dsw-alias-border-l2); border-radius:14px; padding:16px }
.panel h2 { font-size:13px; margin:0 0 12px; color:var(--qw-muted); font-weight:600 }
.side { flex:0 0 280px }
.rail { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  width:44px; padding:6px 0; margin:0 auto; border-radius:10px; border:1px dashed var(--dsw-alias-border-l2) }
.rail .r-temp { font-size:13px; font-weight:600 }
.card { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding:10px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-1) }
.card .head { display:flex; justify-content:space-between; font-size:12px; font-weight:600 }
.card .head .mut { font-weight:400 }
.now { display:flex; align-items:center; gap:8px }
.now .t { font-size:26px; font-weight:600; line-height:1 }
.now .meta { margin-left:auto; color:var(--qw-muted); font-size:11px; text-align:right; line-height:1.5 }
.hours { display:grid; grid-template-columns:repeat(5,1fr); gap:4px }
.hr { display:flex; flex-direction:column; align-items:center; gap:1px; padding:5px 1px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; font-size:11px }
.hr .t { font-weight:600; font-size:12px }
.hr .pop { color:var(--qw-pop) }
.mut { color:var(--qw-muted); font-size:11px }
.alert { font-size:11px; line-height:1.4; padding:5px 8px; border:1px solid var(--dsw-alias-border-l2); border-left:3px solid var(--c); border-radius:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.foot { display:flex; justify-content:space-between; font-size:10px; color:var(--qw-muted) }
.tool { color:var(--qw-muted); font-size:12px; margin-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.cardpanel { flex:1 1 420px; min-width:320px }
.cardpanel .inner { padding:4px 8px }
</style>
</head>
<body>
<button class="toggle" onclick="document.body.classList.toggle('dark')">明 / 暗</button>
<div class="wrap">
  <h1>dsh-qweather 预览</h1>
  <p class="sub">左侧 = 侧边栏天气组件（展开 / 收起） · 右侧 = qweather_card 工具渲染的对话内卡片 · 数据来自真实 API 样例</p>
  <div class="panels">
    <div class="panel side">
      <h2>侧边栏收起（仅图标 + 气温）</h2>
      <div class="rail">
        <span class="ic" style="color:var(--qw-accent)">${weatherIcon(now.icon, 22)}</span>
        <span class="r-temp">${round1(now.temp)}°</span>
      </div>
      <h2 style="margin-top:18px">侧边栏展开（完整卡片）</h2>
      <div class="card">
        <div class="head"><span>${placeLabel(bundle.place)}</span><span class="mut">↻</span></div>
        <div class="now">
          <span style="color:var(--qw-accent)">${weatherIcon(now.icon, 34)}</span>
          <span class="t">${round1(now.temp)}°</span>
          <span class="mut">${now.text}</span>
          <span class="meta">体感 ${round1(now.feelsLike)}°<br>湿度 ${now.humidity}%</span>
        </div>
        <div class="hours">${hourCells}
        </div>
        ${sideCurve}
        ${alertRows}
        <div class="foot"><span>更新于 ${hourLabel(bundle.receivedAt)}</span><span>和风天气</span></div>
      </div>
    </div>
    <div class="panel cardpanel">
      <h2>对话内天气卡片（qweather_card）</h2>
      <div class="tool">已渲染「${placeLabel(bundle.place)} 天气」天气卡片（${fragment.length} 字符）</div>
      <div class="inner">${fragment}</div>
    </div>
  </div>
</div>
</body>
</html>
`

await writeFile(new URL('../preview.html', import.meta.url), html)
console.log('preview.html 已生成：', html.length, '字符')
