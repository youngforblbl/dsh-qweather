/**
 * 生成 preview.html：可离线打开的 UI 预览页（v2 新拟态+玻璃拟态）。
 * 左侧：侧边栏天气组件静态稿（展开 + 收起）；右侧：qweather_card 真实卡片。
 * 数据来自 samples/sample-bundle.json。默认深色；?light 直达浅色。
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

const hourCells = hours.map((h, i) => `
      <div class="hr">
        <span class="mut s">${hourLabel(h.time)}</span>
        <span class="ic">${weatherIcon(h.icon, 18, 'pv-h' + i)}</span>
        <span class="pop">${percent(h.pop)}</span>
      </div>`).join('')

// 迷你气温曲线凹槽（与组件 MiniCurve 同款：拉伸的纯路径 SVG + HTML 描点/标签芯片）
const temps = hours.map((h) => h.temp)
const tMin = Math.min(...temps)
const tMax = Math.max(...temps)
const tSpan = tMax - tMin || 1
const W = 320, H = 56
const tXs = hours.map((_, i) => 32 + i * 64)
const tYs = temps.map((t) => H - 8 - ((t - tMin) / tSpan) * (H - 30))
const tPoints = tXs.map((x, i) => `${x.toFixed(1)},${tYs[i].toFixed(1)}`).join(' ')
const sideCurve = `<div class="curve" style="height:${H}px;margin-top:8px">`
  + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;width:100%;height:${H}px;filter:drop-shadow(0.8px 4.5px 5.5px var(--line-sh))">`
  + '<defs><linearGradient id="side-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="48">'
  + '<stop offset="0%" stop-color="var(--orange)"/><stop offset="100%" stop-color="var(--sky)"/></linearGradient></defs>'
  + `<polyline points="${tPoints}" style="fill:none;stroke:url(#side-stroke);stroke-width:9;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke"/>`
  + '</svg>'
  + tXs.map((x, i) => {
    const left = 10 + i * 20
    const top = (tYs[i] / H * 100).toFixed(1)
    return `<span class="chip" style="left:${left}%;top:calc(${top}% - 6px)">${round1(hours[i].temp)}℃</span>`
  }).join('')
  + '</div>'

// 侧边栏预警区（与对话内卡片排版一致）；无真实预警时用一条演示数据展示样式
const demoAlerts = alerts.length > 0
  ? alerts
  : [{ id: 'demo', headline: '高温黄色预警（演示数据）', text: '预计未来三天最高气温将达 35℃ 以上，请做好防暑降温准备。', color: 'yellow' }]
const alertRows = `<div class="sec">重要预警<span class="badge" style="--c:${warningColorOf(demoAlerts[0].color)}">${demoAlerts.length}</span></div>`
  + demoAlerts.slice(0, 2).map((a) => `<div class="alert-box" style="--c:${warningColorOf(a.color)}"><div class="ah">${a.headline}</div><div class="ab">${a.text}</div></div>`).join('')

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-qweather 预览</title>
<style>
:root {
  --page-a:#05080f; --page-b:#0b1220;
  --glass-a:rgba(40,55,84,.86); --glass-b:rgba(17,26,44,.78);
  --cell-a:rgba(46,60,90,.80); --cell-b:rgba(20,30,50,.72);
  --text:#e8eefb; --mut:#9fb0c7; --sub:#5f7089;
  --border:rgba(255,255,255,.10); --sky:#4c8dff; --sky-deep:#2f6bff; --orange:#fb923c; --pop:#56bad9;
  --sh-dark:rgba(0,0,0,.6); --sh-light:rgba(96,116,150,.16);
  --glow:rgba(0,0,0,.4); --dot:#101a2e;
  --hi:rgba(255,255,255,.08);
  --line-sh:rgba(0,0,0,.5); --line-hi:rgba(255,255,255,.16);
  --sky-aura:rgba(80,140,255,.18); --orange-aura:rgba(251,146,60,.11);
  --glow-blue:rgba(76,141,255,.11); --glow-orange:rgba(251,146,60,.08);
  color-scheme: dark;
}
body.light {
  --page-a:#e6ecf4; --page-b:#dfe7f2;
  --glass-a:rgba(255,255,255,.88); --glass-b:rgba(255,255,255,.55);
  --cell-a:rgba(255,255,255,.85); --cell-b:rgba(233,239,247,.75);
  --text:#3a4a61; --mut:#64748b; --sub:#8fa0b5;
  --border:rgba(255,255,255,.75); --sky:#38bdf8; --sky-deep:#0284c7; --orange:#f97316; --pop:#0ea5e9;
  --sh-dark:rgba(148,163,184,.42); --sh-light:rgba(255,255,255,.95);
  --glow:rgba(56,189,248,.25); --dot:#ffffff;
  --hi:rgba(255,255,255,.9);
  --line-sh:rgba(0,0,0,.30); --line-hi:rgba(255,255,255,.55);
  --sky-aura:rgba(56,189,248,.16); --orange-aura:rgba(249,115,22,.10);
  --glow-blue:rgba(56,189,248,.18); --glow-orange:rgba(249,115,22,.12);
  color-scheme: light;
}
* { box-sizing: border-box }
body { margin:0; padding:34px 16px; color:var(--text);
  background:
    radial-gradient(120% 90% at 8% -10%, var(--sky-aura,rgba(76,141,255,.12)), transparent 45%),
    radial-gradient(110% 90% at 100% 110%, var(--orange-aura,rgba(251,146,60,.08)), transparent 48%),
    linear-gradient(160deg,var(--page-a),var(--page-b));
  min-height:100vh;
  font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  -webkit-font-smoothing:antialiased; transition:background .3s }

.toggle { position:fixed; top:14px; right:14px; font-size:12px; padding:6px 14px; border-radius:10px;
  border:1px solid var(--border); color:var(--text); cursor:pointer;
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b)); backdrop-filter:blur(12px);
  box-shadow:3px 3px 8px var(--sh-dark),-2px -2px 6px var(--sh-light) }
.wrap { max-width:940px; margin:0 auto }
h1 { font-size:19px; margin:0 0 4px }
.sub { font-size:12px; color:var(--mut); margin:0 0 22px }
.panels { display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap }
.panel { border:1px solid var(--border); border-radius:20px; padding:18px;
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b)); backdrop-filter:blur(16px) saturate(1.15);
  box-shadow:0 14px 34px rgba(0,0,0,.22),10px 10px 24px var(--sh-dark),-10px -10px 24px var(--sh-light),inset 0 1px 0 var(--hi) }
.panel h2 { font-size:12px; margin:0 0 12px; color:var(--mut); font-weight:700; letter-spacing:.4px }
.side { flex:0 0 292px }
.rail { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
  width:46px; padding:7px 0; margin:0 auto; border-radius:12px; border:1px dashed var(--border) }
.rail .tile { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:9px;
  background:linear-gradient(145deg,var(--tile-a),var(--tile-b));
  box-shadow:4px 4px 10px var(--sh-dark),-3px -3px 8px var(--sh-light),inset 0 1px 0 var(--hi) }
.rail .r-temp { font-size:12px; font-weight:700 }
.card { display:flex; flex-direction:column; gap:10px; margin-top:14px; padding:13px; border-radius:16px;
  border:1px solid var(--border);
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b));
  backdrop-filter:blur(14px);
  box-shadow:-7px -6px 16px var(--glow-blue),7px 6px 16px var(--glow-orange),0 12px 28px rgba(0,0,0,.18),8px 8px 20px var(--sh-dark),-8px -8px 20px var(--sh-light),inset 0 1px 0 var(--hi) }
.card .head { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:800 }
.now { display:flex; align-items:center; gap:8px }
.now .tile { flex:none; display:flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:11px;
  background:linear-gradient(145deg,var(--tile-a),var(--tile-b));
  box-shadow:4px 4px 10px var(--sh-dark),-3px -3px 8px var(--sh-light),inset 0 1px 0 var(--hi) }
.now .t { display:flex; align-items:flex-start; gap:1px; font-size:22px; font-weight:800; letter-spacing:-.4px; line-height:1 }
.now .t .deg { font-size:10px; color:var(--orange); margin-top:1.5px }
.now .meta { margin-left:auto; display:flex; flex-direction:column; gap:2px; color:var(--mut); font-size:10.5px; text-align:right; line-height:1.4 }
.now .meta b { color:var(--text); font-weight:700 }
.hours { display:grid; grid-template-columns:repeat(5,1fr); gap:4px }
.hr { display:flex; flex-direction:column; align-items:center; gap:2px; padding:7px 1px 6px;
  border:1px solid var(--border); border-radius:11px; background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:inset 2px 2px 5px var(--sh-dark),inset -2px -2px 5px var(--sh-light) }
.hr .s { font-size:10.5px; color:var(--sub) }
.hr .ic { display:inline-flex }
.hr .pop { color:var(--pop); font-size:10.5px; font-weight:600 }
.curve { position:relative }
.chip { position:absolute; transform:translate(-50%,-100%); font-size:13.5px; font-weight:700; color:var(--text);
  text-shadow:0 1px 0 var(--hi); white-space:nowrap }

.sec { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:700; letter-spacing:.6px; color:var(--mut); margin:2px 0 6px }
.sec::before { content:''; width:3.5px; height:11px; border-radius:2px; background:linear-gradient(180deg,var(--sky),var(--orange)); box-shadow:0 1px 3px var(--sh-dark) }
.alert-box { display:flex; flex-direction:column; gap:3px; padding:6px 8px; border:1px solid var(--border); border-left:3px solid var(--c);
  border-radius:9px; background:linear-gradient(150deg,color-mix(in srgb,var(--c) 12%,transparent),transparent 60%);
  box-shadow:1px 2px 6px var(--sh-dark) }
.alert-box .ah { font-size:11.5px; font-weight:700; color:var(--text) }
.alert-box .ab { font-size:10.5px; color:var(--mut); line-height:1.45;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden }
.badge { display:inline-flex; align-items:center; justify-content:center; min-width:16px; height:16px;
  padding:0 5px; border-radius:8px; font-size:9.5px; font-weight:800; color:var(--orange);
  background:linear-gradient(150deg,color-mix(in srgb,var(--c) 16%,transparent),transparent 70%);
  border:1px solid color-mix(in srgb,var(--c) 35%,transparent) }
.foot { display:flex; justify-content:space-between; font-size:10px; color:var(--sub); border-top:1px dashed var(--border); padding-top:8px }
.tool { color:var(--mut); font-size:12px; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.cardpanel { flex:1 1 480px; min-width:340px }
.num { font-variant-numeric:tabular-nums }
:root { --tile-a:#1a2a49; --tile-b:#0d1728 }
body.light { --tile-a:#e0f4ff; --tile-b:#bfe4ff }
</style>
</head>
<body class="dark">
<script>if (location.search.indexOf('light') !== -1) document.body.classList.add('light')</script>
<button class="toggle" onclick="document.body.classList.toggle('light')">明 / 暗</button>
<div class="wrap">
  <h1>dsh-qweather 预览</h1>
  <p class="sub">v3 新拟态 + 玻璃拟态 · 左侧 = 侧边栏组件（收起 / 展开）· 右侧 = qweather_card 对话内卡片 · 数据来自真实 API 样例</p>
  <div class="panels">
    <div class="panel side">
      <h2>侧边栏收起（仅图标 + 气温）</h2>
      <div class="rail">
        <span class="tile">${weatherIcon(now.icon, 18, 'pv-rail')}</span>
        <span class="r-temp num">${round1(now.temp)}℃</span>
      </div>
      <h2 style="margin-top:18px">侧边栏展开（完整卡片）</h2>
      <div class="card">
        <div class="head"><span>${placeLabel(bundle.place)}</span><span style="color:var(--mut);font-weight:400">↻</span></div>
        <div class="now">
          <span class="tile">${weatherIcon(now.icon, 24, 'pv-now')}</span>
          <span class="t num"><span>${round1(now.temp)}</span><span class="deg">℃</span></span>
          <span class="mut" style="color:var(--mut);font-size:12px">${now.text}</span>
          <span class="meta"><span>体感 <b class="num">${round1(now.feelsLike)}℃</b></span><span>湿度 <b class="num">${now.humidity}%</b></span></span>
        </div>
        <div class="sec">未来 5 小时</div>
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
