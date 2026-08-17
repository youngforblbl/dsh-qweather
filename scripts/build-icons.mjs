/**
 * 生成 icons.html：全部天气图标的可运行展示页（明暗切换 + 小时格嵌套演示）。
 */
import { writeFile } from 'node:fs/promises'
import { weatherIcon, iconKindOf } from '../lib/index.js'

/** 和风天气 condition code → 中文名。 */
const CODES = [
  ['100', '晴'], ['101', '多云'], ['102', '少云'], ['103', '晴间多云'], ['104', '阴'],
  ['150', '晴（夜）'], ['151', '多云（夜）'], ['152', '少云（夜）'], ['153', '晴间多云（夜）'],
  ['300', '阵雨'], ['301', '强阵雨'], ['302', '雷阵雨'], ['303', '强雷阵雨'], ['304', '雷阵雨伴冰雹'],
  ['305', '小雨'], ['306', '中雨'], ['307', '大雨'], ['308', '极端降雨'], ['309', '毛毛雨'],
  ['310', '暴雨'], ['311', '大暴雨'], ['312', '特大暴雨'], ['313', '冻雨'], ['314', '小到中雨'],
  ['315', '中到大雨'], ['316', '大到暴雨'], ['317', '暴雨到大暴雨'], ['318', '大暴雨到特大暴雨'],
  ['350', '阵雨'], ['351', '强阵雨'], ['399', '雨'],
  ['400', '小雪'], ['401', '中雪'], ['402', '大雪'], ['403', '暴雪'], ['404', '雨夹雪'],
  ['405', '雨雪天气'], ['406', '阵雨夹雪'], ['407', '阵雪'], ['408', '小到中雪'], ['409', '中到大雪'],
  ['410', '大到暴雪'], ['456', '阵雨夹雪'], ['457', '阵雪'], ['499', '雪'],
  ['500', '薄雾'], ['501', '雾'], ['502', '霾'], ['503', '扬沙'], ['504', '浮尘'],
  ['507', '沙尘暴'], ['508', '强沙尘暴'], ['509', '浓雾'], ['510', '强浓雾'], ['511', '中度霾'],
  ['512', '重度霾'], ['513', '严重霾'], ['514', '大雾'], ['515', '特强浓雾'],
  ['900', '热'], ['901', '冷'], ['999', '未知'],
]

const tiles = CODES.map(([code, name]) => `
      <div class="tile">
        <span class="ic">${weatherIcon(code, 36, 'g-' + code)}</span>
        <span class="nm">${name}</span>
        <span class="cd">${code} · ${iconKindOf(code)}</span>
      </div>`).join('')

// 夜间小时格嵌套演示：时间文本 + 图标同列堆叠，验证图标不与文字重叠
const nightCells = [['21:00', '150'], ['22:00', '151'], ['23:00', '152'], ['00:00', '153']]
  .map(([time, code]) => `
      <div class="hr">
        <span class="time">${time}</span>
        <span class="ic">${weatherIcon(code, 16, 'n-' + code)}</span>
        <span class="pop">30%</span>
      </div>`).join('')

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-qweather 图标全集</title>
<style>
:root {
  --page-a:#05080f; --page-b:#0b1220;
  --glass-a:rgba(40,55,84,.86); --glass-b:rgba(17,26,44,.78);
  --cell-a:rgba(46,60,90,.80); --cell-b:rgba(20,30,50,.72);
  --text:#e8eefb; --mut:#9fb0c7; --sub:#5f7089;
  --border:rgba(255,255,255,.10); --sky:#4c8dff; --orange:#fb923c; --pop:#56bad9;
  --sh-dark:rgba(0,0,0,.6); --sh-light:rgba(96,116,150,.16);
  --tile-a:#1c2e4e; --tile-b:#0e1a30;
  color-scheme: dark;
}
body.light {
  --page-a:#e6ecf4; --page-b:#dfe7f2;
  --glass-a:rgba(255,255,255,.88); --glass-b:rgba(255,255,255,.55);
  --cell-a:rgba(255,255,255,.85); --cell-b:rgba(233,239,247,.75);
  --text:#3a4a61; --mut:#64748b; --sub:#8fa0b5;
  --border:rgba(255,255,255,.75); --sky:#38bdf8; --orange:#f97316; --pop:#0ea5e9;
  --sh-dark:rgba(148,163,184,.42); --sh-light:rgba(255,255,255,.95);
  --tile-a:#e0f4ff; --tile-b:#bfe4ff;
  color-scheme: light;
}
* { box-sizing: border-box }
body { margin:0; padding:32px 16px; color:var(--text); min-height:100vh;
  background:radial-gradient(120% 90% at 8% -10%,var(--sky-aura,rgba(80,140,255,.16)),transparent 45%),radial-gradient(110% 90% at 100% 110%,var(--orange-aura,rgba(251,146,60,.10)),transparent 48%),linear-gradient(160deg,var(--page-a),var(--page-b));
  font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  -webkit-font-smoothing:antialiased }
body.light { --sky-aura:rgba(56,189,248,.16); --orange-aura:rgba(249,115,22,.10) }
.toggle { position:fixed; top:14px; right:14px; font-size:12px; padding:6px 14px; border-radius:10px;
  border:1px solid var(--border); color:var(--text); cursor:pointer;
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b)); backdrop-filter:blur(12px);
  box-shadow:3px 3px 8px var(--sh-dark),-2px -2px 6px var(--sh-light) }
.wrap { max-width:960px; margin:0 auto }
h1 { font-size:19px; margin:0 0 4px }
.sub { font-size:12px; color:var(--mut); margin:0 0 22px }
.panel { border:1px solid var(--border); border-radius:20px; padding:18px;
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b)); backdrop-filter:blur(16px) saturate(1.15);
  box-shadow:0 14px 34px rgba(0,0,0,.22),10px 10px 24px var(--sh-dark),-10px -10px 24px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.08)) }
.panel h2 { font-size:12px; margin:0 0 14px; color:var(--mut); font-weight:700; letter-spacing:.4px }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(108px,1fr)); gap:10px }
.tile { display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 4px 10px;
  border:1px solid var(--border); border-radius:14px; background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:inset 2px 2px 6px var(--sh-dark),inset -2px -2px 6px var(--sh-light) }
.tile .ic { display:flex; align-items:center; justify-content:center; width:46px; height:46px; border-radius:13px;
  background:linear-gradient(145deg,var(--tile-a),var(--tile-b));
  box-shadow:4px 4px 10px var(--sh-dark),-3px -3px 8px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09)) }
.tile .nm { font-size:11.5px; font-weight:600 }
.tile .cd { font-size:10px; color:var(--sub) }
.demo { display:flex; gap:10px; margin-top:16px }
.hr { display:flex; flex-direction:column; align-items:center; gap:3px; width:64px; padding:8px 2px;
  border:1px solid var(--border); border-radius:11px; background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:inset 2px 2px 5px var(--sh-dark),inset -2px -2px 5px var(--sh-light) }
.hr .time { font-size:10px; color:var(--sub) }
.hr .ic { display:inline-flex; height:20px; align-items:center }
.hr .pop { font-size:10px; color:var(--pop); font-weight:600 }
</style>
</head>
<body class="dark">
<script>if (location.search.indexOf('light') !== -1) document.body.classList.add('light')</script>
<button class="toggle" onclick="document.body.classList.toggle('light')">明 / 暗</button>
<div class="wrap">
  <h1>dsh-qweather 图标全集</h1>
  <p class="sub">全部和风天气 condition code 的图标映射（${CODES.length} 个）· 图标为自绘内联 SVG（渐变填充 + 投影 + 高光）· 点击右上角切换明暗</p>
  <div class="panel">
    <h2>夜间小时格嵌套演示（图标与时间/降水文本同列堆叠）</h2>
    <div class="demo">${nightCells}
    </div>
  </div>
  <div class="panel" style="margin-top:16px">
    <h2>全部图标</h2>
    <div class="grid">${tiles}
    </div>
  </div>
</div>
</body>
</html>
`

await writeFile(new URL('../icons.html', import.meta.url), html)
console.log('icons.html 已生成：', html.length, '字符，共', CODES.length, '枚图标')
