/**
 * 生成 preview.html：可离线打开的 UI 预览页，默认深色（Vestia 金融面板风）。
 * 左侧：侧边栏天气组件静态稿（展开 + 收起）；右侧：qweather_card 真实卡片。
 * 数据来自 samples/sample-bundle.json（pnpm run preview 前按需更新）。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { buildCardFragment, weatherIcon } from '../lib/index.js'
import { hourLabel, isYellowOrAbove, percent, placeLabel, round1 } from '../lib/index.js'

const bundle = JSON.parse(await readFile(new URL('../samples/sample-bundle.json', import.meta.url), 'utf8'))
const now = bundle.now
const hours = (bundle.hours ?? []).slice(0, 5)
const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 2)
const fragment = buildCardFragment(bundle, 5)
const warningColorOf = (color) => ({ yellow: '#eab308', orange: '#f97316', red: '#ef4444' }[color] ?? '#eab308')

const hourCells = hours.map((h) => `
      <div class="hr">
        <span class="mut s">${hourLabel(h.time)}</span>
        <span class="ic">${weatherIcon(h.icon, 16)}</span>
        <span class="pop">${percent(h.pop)}</span>
        <span class="t">${round1(h.temp)}°</span>
      </div>`).join('')

// 迷你气温曲线（与组件 MiniCurve 同款：渐变面积 + 平滑折线 + 描点）
const temps = hours.map((h) => h.temp)
const tMin = Math.min(...temps)
const tMax = Math.max(...temps)
const tSpan = tMax - tMin || 1
const W = 320, H = 46, PAD = 12
const tXs = hours.map((_, i) => PAD + i * ((W - PAD * 2) / Math.max(1, hours.length - 1)))
const tYs = temps.map((t) => H - 7 - ((t - tMin) / tSpan) * (H - 16))
const tPoints = tXs.map((x, i) => `${x.toFixed(1)},${tYs[i].toFixed(1)}`).join(' ')
const tArea = `M${tXs[0].toFixed(1)},${H} L${tPoints} L${tXs[tXs.length - 1].toFixed(1)},${H} Z`
const sideCurve = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;margin-top:5px">`
  + '<defs><linearGradient id="side-fill" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.26"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>'
  + `<path d="${tArea}" fill="url(#side-fill)"/>`
  + `<polyline points="${tPoints}" style="fill:none;stroke:var(--primary);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke"/>`
  + tXs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${tYs[i].toFixed(1)}" r="2.4" style="fill:var(--panel);stroke:var(--primary);stroke-width:1.6"/>`).join('')
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
  --page:#0b0f1a; --panel:#1f2937; --cell:#111827;
  --text:#f9fafb; --mut:#9ca3af; --sub:#6b7280;
  --border:rgba(255,255,255,.10); --primary:#3b82f6; --pop:#38bdf8;
  color-scheme: dark;
}
body.light {
  --page:#f1f5f9; --panel:#ffffff; --cell:#f8fafc;
  --text:#0f172a; --mut:#64748b; --sub:#94a3b8;
  --border:#e2e8f0; --primary:#2563eb; --pop:#0284c7;
  color-scheme: light;
}
* { box-sizing: border-box }
body { margin:0; padding:32px 16px; background:var(--page); color:var(--text);
  font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  -webkit-font-smoothing:antialiased; transition:background .25s }
.toggle { position:fixed; top:14px; right:14px; font-size:12px; padding:6px 14px; border-radius:10px;
  border:1px solid var(--border); background:var(--panel); color:var(--text); cursor:pointer }
.wrap { max-width:940px; margin:0 auto }
h1 { font-size:19px; margin:0 0 4px }
.sub { font-size:12px; color:var(--mut); margin:0 0 22px }
.panels { display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap }
.panel { background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:18px }
.panel h2 { font-size:12px; margin:0 0 12px; color:var(--mut); font-weight:600; letter-spacing:.4px }
.side { flex:0 0 292px }
.rail { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
  width:46px; padding:7px 0; margin:0 auto; border-radius:12px; border:1px dashed var(--border) }
.rail .tile { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px;
  background:color-mix(in srgb,var(--primary) 14%,transparent); color:var(--primary) }
.rail .r-temp { font-size:12px; font-weight:700 }
.card { display:flex; flex-direction:column; gap:10px; margin-top:14px; padding:12px;
  border:1px solid var(--border); border-radius:14px; background:var(--panel) }
.card .head { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700 }
.now { display:flex; align-items:center; gap:8px }
.now .tile { flex:none; display:flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:10px;
  background:color-mix(in srgb,var(--primary) 14%,transparent); color:var(--primary) }
.now .t { font-size:24px; font-weight:700; letter-spacing:-.4px; line-height:1 }
.now .meta { margin-left:auto; display:flex; flex-direction:column; gap:2px; color:var(--mut); font-size:10.5px; text-align:right; line-height:1.4 }
.now .meta b { color:var(--text); font-weight:600 }
.hours { display:grid; grid-template-columns:repeat(5,1fr); gap:4px }
.hr { display:flex; flex-direction:column; align-items:center; gap:2px; padding:6px 1px 5px;
  border:1px solid var(--border); border-radius:10px; background:var(--cell) }
.hr .s { font-size:9.5px }
.hr .ic { color:var(--primary); display:inline-flex }
.hr .pop { color:var(--pop); font-size:9.5px }
.hr .t { font-size:12px; font-weight:600 }
.alert { font-size:10.5px; line-height:1.45; padding:5px 8px; border:1px solid var(--border); border-left:3px solid var(--c);
  border-radius:8px; background:color-mix(in srgb,var(--c) 6%,transparent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.foot { display:flex; justify-content:space-between; font-size:10px; color:var(--mut); border-top:1px dashed var(--border); padding-top:7px }
.tool { color:var(--mut); font-size:12px; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.cardpanel { flex:1 1 480px; min-width:340px }
.num { font-variant-numeric:tabular-nums }
</style>
</head>
<body class="dark">
<script>if (location.search.indexOf('light') !== -1) document.body.classList.add('light')</script>
<button class="toggle" onclick="document.body.classList.toggle('light')">明 / 暗</button>
<div class="wrap">
  <h1>dsh-qweather 预览</h1>
  <p class="sub">视觉风格参考 uupm.cc/demo/investment-platform · 左侧 = 侧边栏组件（收起 / 展开）· 右侧 = qweather_card 对话内卡片 · 数据来自真实 API 样例</p>
  <div class="panels">
    <div class="panel side">
      <h2>侧边栏收起（仅图标 + 气温）</h2>
      <div class="rail">
        <span class="tile">${weatherIcon(now.icon, 18)}</span>
        <span class="r-temp num">${round1(now.temp)}°</span>
      </div>
      <h2 style="margin-top:18px">侧边栏展开（完整卡片）</h2>
      <div class="card">
        <div class="head"><span>${placeLabel(bundle.place)}</span><span style="color:var(--mut);font-weight:400">↻</span></div>
        <div class="now">
          <span class="tile">${weatherIcon(now.icon, 24)}</span>
          <span class="t num">${round1(now.temp)}°</span>
          <span class="mut" style="font-size:12px">${now.text}</span>
          <span class="meta"><span>体感 <b class="num">${round1(now.feelsLike)}°</b></span><span>湿度 <b class="num">${now.humidity}%</b></span></span>
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
      ${fragment}
    </div>
  </div>
</div>
</body>
</html>
`

await writeFile(new URL('../preview.html', import.meta.url), html)
console.log('preview.html 已生成：', html.length, '字符')
