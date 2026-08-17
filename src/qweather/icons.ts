/**
 * 内置天气图标（自绘、MIT、无网络依赖）。设计要点：
 * - 填充式 + 双色纵向渐变（顶部高光 → 底部深色）+ 向下偏移的深色投影，浮起立体感；
 * - 缩放统一用 centered() 变换（translate(cx,cy) scale(s) translate(-12,-12)），
 *   太阳本体永远位于光芒正中，月牙完整居中不越界；
 * - 雨滴/雪花缩小并放在云朵下方；雪花用灰色与白色云体区分；
 * - 霾/扬沙/浮尘/沙尘暴 分属 haze / dust / sandstorm 三种图样；
 * - 热/冷 使用温度计图样（橙红 / 冰蓝渐变），不再用云朵。
 */

type IconKind = 'sun' | 'moon' | 'partly' | 'partly-night' | 'cloudy' | 'rain' | 'heavy-rain' | 'thunder' | 'sleet' | 'snow' | 'fog' | 'haze' | 'dust' | 'sandstorm' | 'hot' | 'cold' | 'unknown'

/** 渐变主色板（两主题通用）。 */
const PALETTE: Record<IconKind, readonly [string, string]> = {
  sun: ['#ffd08a', '#f97316'],
  moon: ['#b9c7ff', '#6f86f5'],
  partly: ['#ffffff', '#c7d6ea'],
  'partly-night': ['#ffffff', '#c7d6ea'],
  cloudy: ['#ffffff', '#c7d6ea'],
  rain: ['#ffffff', '#c7d6ea'],
  'heavy-rain': ['#ffffff', '#c7d6ea'],
  thunder: ['#ffffff', '#c7d6ea'],
  sleet: ['#ffffff', '#c7d6ea'],
  snow: ['#ffffff', '#c7d6ea'],
  fog: ['#f4f8fd', '#b9c9e0'],
  haze: ['#dbe4f0', '#9fb0c7'],
  dust: ['#f3d9a4', '#d9a45b'],
  sandstorm: ['#f0b46a', '#c77b32'],
  hot: ['#ffb35c', '#ef5f2b'],
  cold: ['#a5d8ff', '#38bdf8'],
  unknown: ['#ffffff', '#c7d6ea'],
}

/** 水/闪电渐变。 */
const WATER_A = '#8fd9ff'
const WATER_B = '#0284c7'
const BOLT_A = '#ffe082'
const BOLT_B = '#fb923c'
const SUN_A = '#ffd08a'
const SUN_B = '#f97316'
const MOON_A = '#b9c7ff'
const MOON_B = '#6f86f5'
/** 雪花灰（与白色云体区分）。 */
const SNOW_GRAY = '#b7c6da'
const SNOW_GRAY_LIGHT = '#dbe6f2'

/** 生成一条纵向渐变（id 用 uid 隔离）。 */
function grad(uid: string, a: string, b: string): string {
  return `<defs><linearGradient id="qw-ic-${uid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
}

const U = (uid: string): string => `url(#qw-ic-${uid})`

/**
 * 以 (cx,cy) 为中心、scale s 的缩放变换：先平移回原点、缩放、再平移到目标中心。
 */
function centered(cx: number, cy: number, s: number): string {
  return `translate(${cx},${cy}) scale(${s}) translate(-12,-12)`
}

/** 云体轮廓：三个圆 + 圆角底边（基准 y 约 12.5-18.8）。 */
function cloudShapes(uid: string, color: string): string {
  const f = color.startsWith('url') ? color : color
  return `<circle cx="9" cy="14.8" r="3.5" fill="${f}"/>`
    + `<circle cx="13.4" cy="12.4" r="4.3" fill="${f}"/>`
    + `<circle cx="17.8" cy="15.2" r="3" fill="${f}"/>`
    + `<rect x="6.9" y="14.2" width="13.6" height="4.6" rx="2.3" fill="${f}"/>`
}

/** 云底阴影。 */
function cloudShade(): string {
  return '<rect x="6.9" y="16" width="13.6" height="2.8" rx="1.4" fill="#7d95b8" opacity=".28"/>'
}

/** 雨滴（泪滴形 + 高光），围绕 (cx,cy) 居中。 */
function drop(cx: number, cy: number, s: number, color: string): string {
  return `<g transform="${centered(cx, cy, s)}">`
    + '<path d="M12.4 12.2c0 2.5 1.5 4.1 3 4.1s3-1.6 3-4.1c0-2.2-3-4.7-3-4.7s-3 2.5-3 4.7z" fill="' + color + '"/>'
    + '</g>'
    + `<circle cx="${cx - 0.6 * s}" cy="${cy + 0.1 * s}" r="${0.6 * s}" fill="#ffffff" opacity=".75"/>`
}

/** 雪花（三条圆头短线 + 中心点），颜色可指定。 */
function flake(cx: number, cy: number, s: number, color: string): string {
  return `<g transform="${centered(cx, cy, s)}" stroke="${color}" stroke-width="2.1" stroke-linecap="round">`
    + '<path d="M12 7.4v9.2M8 9.6l8 4.8M16 9.6l-8 4.8"/></g>'
    + `<circle cx="${cx}" cy="${cy}" r="${1 * s}" fill="${color}"/>`
}

/** 太阳本体 + 光芒（fill/line 双色渐变）。 */
function sun(uid: string, cx: number, cy: number, s: number, rays: boolean): string {
  const c = U(uid)
  const lines = rays
    ? `<g transform="${centered(cx, cy, s)}" stroke="${c}" stroke-width="2.3" stroke-linecap="round">`
      + '<path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></g>'
    : ''
  return lines
    + `<circle cx="${cx}" cy="${cy}" r="${4.5 * s}" fill="${c}"/>`
    + `<circle cx="${cx - 1.2 * s}" cy="${cy - 1.2 * s}" r="${1.8 * s}" fill="#ffffff" opacity=".4"/>`
}

/** 月牙 + 星光：紧凑居中（包围盒约 x4-19 / y4-20），小尺寸下不挤压文字。 */
function moon(uid: string, cx: number, cy: number, s: number): string {
  const c = U(uid)
  return `<path transform="${centered(cx, cy, s)}" d="M19.2 12.2A7.6 7.6 0 1 1 11.8 3.9a6.3 6.3 0 0 0 7.4 8.3z" fill="${c}"/>`
    + `<circle cx="${cx - 2.6 * s}" cy="${cy - 4.2 * s}" r="${0.9 * s}" fill="#ffffff" opacity=".85"/>`
    + `<circle cx="${cx - 0.8 * s}" cy="${cy - 1.4 * s}" r="${0.55 * s}" fill="#ffffff" opacity=".6"/>`
}

/** 温度计（热=橙红渐变，冷=冰蓝渐变）。 */
function thermometer(uid: string): string {
  const c = U(uid)
  return `<path d="M12 4a2.2 2.2 0 0 0-2.2 2.2v6.9a3.8 3.8 0 1 0 4.4 0V6.2A2.2 2.2 0 0 0 12 4z" fill="${c}"/>`
    + '<circle cx="12" cy="16.9" r="1.7" fill="#ffffff" opacity=".55"/>'
    + '<circle cx="12" cy="4.6" r="0.9" fill="#ffffff" opacity=".5"/>'
}

/** 投影层：同几何的深色副本向下偏移，制造“浮起”。 */
function shadow(inner: string): string {
  return inner
    .replaceAll('fill="url(#qw-ic-', 'fill="#0b1220" data-u="')
    .replaceAll('stroke="url(#qw-ic-', 'stroke="#0b1220" data-u="')
}

/** 组装成最终 svg。 */
export function weatherIcon(code: string, size = 24, uid = 'ic'): string {
  const kind = iconKindOf(code)
  const [a, b] = PALETTE[kind]
  const body = BODIES[kind]?.(uid, a, b) ?? BODIES['unknown']!(uid, a, b)
  const shadowLayer = body.includes('data-u')
    ? body
    : `<g transform="translate(0,1.35)" opacity=".20">${shadow(body)}</g>`
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">`
    + grad(uid, a, b)
    + shadowLayer
    + body
    + '</svg>'
}

/** 各图标的主体绘制（uid=渐变隔离, a/b=云/雾类渐变两端）。 */
const BODIES: Record<IconKind, (uid: string, a: string, b: string) => string> = {
  sun: (uid) => sun(uid, 12, 12, 1, true),
  moon: (uid) => moon(uid, 12, 12, 1),
  // 晴间多云：太阳在右上、云体实心覆盖左下方，前后层分明
  partly: (uid) => {
    const c = U(uid)
    return grad('pw' + uid, SUN_A, SUN_B)
      + sun('pw' + uid, 15.2, 7.8, 0.68, true)
      + `<g transform="translate(-0.6,0.6)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + '<circle cx="12.6" cy="11" r="1.4" fill="#ffffff" opacity=".65"/>'
  },
  'partly-night': (uid) => {
    const c = U(uid)
    return grad('mn' + uid, MOON_A, MOON_B)
      + moon('mn' + uid, 15.6, 7.6, 0.66)
      + `<g transform="translate(-0.6,0.6)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + '<circle cx="12.6" cy="11" r="1.4" fill="#ffffff" opacity=".65"/>'
  },
  cloudy: (uid) => {
    const c = U(uid)
    return `<g transform="translate(2.2,-2.4) scale(0.82)" opacity=".85">${cloudShapes(uid, c)}</g>`
      + cloudShapes(uid, c) + cloudShade()
      + '<circle cx="12.6" cy="11.2" r="1.5" fill="#ffffff" opacity=".7"/>'
  },
  // 小雨：云上移，两滴小雨滴挂在云下
  rain: (uid) => {
    const c = U(uid)
    const w = `url(#qw-ic-${uid}-w)`
    return `<g transform="translate(0,-1.8)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>`
      + drop(9.8, 20.2, 0.7, w) + drop(14.8, 20.2, 0.7, w)
  },
  'heavy-rain': (uid) => {
    const c = U(uid)
    const w = `url(#qw-ic-${uid}-w)`
    return `<g transform="translate(0,-2)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>`
      + drop(8, 20.4, 0.66, w) + drop(12.4, 20.4, 0.66, w) + drop(16.8, 20.4, 0.66, w)
  },
  thunder: (uid) => {
    const c = U(uid)
    const bolt = `url(#qw-ic-${uid}-bolt)`
    return `<g transform="translate(0,-1.6)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-bolt" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${BOLT_A}"/><stop offset="100%" style="stop-color:${BOLT_B}"/></linearGradient></defs>`
      + `<path d="M13.6 12.8l3.6-4.4h-2.4l1-3.2-3.9 4.6h2.5z" fill="${bolt}" stroke="${bolt}" stroke-width="1.2" stroke-linejoin="round"/>`
      + '<path d="M13.9 9.6l1.2-1.4" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".8"/>'
  },
  // 雨夹雪：云上移，小水滴 + 灰色小雪花在云下
  sleet: (uid) => {
    const c = U(uid)
    const w = `url(#qw-ic-${uid}-w)`
    return `<g transform="translate(0,-1.8)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>`
      + drop(9.6, 20.4, 0.62, w) + flake(15.2, 20.6, 0.52, SNOW_GRAY)
  },
  // 雪：云上移，三枚灰色小雪花在云下（灰色与白色云体区分）
  snow: (uid) => {
    const c = U(uid)
    return `<g transform="translate(0,-2)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + flake(8.2, 20.6, 0.52, SNOW_GRAY)
      + flake(12.4, 20.9, 0.52, SNOW_GRAY_LIGHT)
      + flake(16.6, 20.6, 0.52, SNOW_GRAY)
  },
  fog: (uid, a, b) => {
    const c = U(uid)
    const l = `url(#qw-ic-${uid}-f)`
    return `<g transform="translate(0,-1.6)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0">`
      + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
      + `<g stroke="${l}" stroke-width="2.2" stroke-linecap="round">`
      + '<path d="M6 17h12M8 19.8h8"/></g>'
  },
  // 霾：灰蓝细横线 + 悬浮颗粒
  haze: (uid, a, b) => {
    const l = `url(#qw-ic-${uid}-f)`
    return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0">`
      + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
      + `<g stroke="${l}" stroke-width="2.2" stroke-linecap="round">`
      + '<path d="M4.5 8.5h15M6.5 12.5h11M4.5 16.5h15"/></g>'
      + `<circle cx="16.8" cy="5.8" r="1" fill="${l}" opacity=".75"/>`
      + `<circle cx="9.5" cy="20" r="0.9" fill="${l}" opacity=".75"/>`
  },
  // 扬沙/浮尘：沙色飘浮颗粒 + 短斜线
  dust: (uid, a, b) => {
    const l = `url(#qw-ic-${uid}-f)`
    return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0">`
      + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
      + `<g fill="${l}">`
      + '<circle cx="6.5" cy="7.5" r="1.2"/><circle cx="10.8" cy="5.4" r="1"/><circle cx="15.2" cy="7" r="1.25"/>'
      + '<circle cx="8.4" cy="11.6" r="1"/><circle cx="12.8" cy="10.2" r="1.1"/><circle cx="17" cy="12.4" r="1.15"/>'
      + '<circle cx="6.8" cy="15.6" r="1"/><circle cx="11.2" cy="17.4" r="1.2"/><circle cx="15.6" cy="15.8" r="1.05"/><circle cx="18.8" cy="18.4" r=".9"/>'
      + '</g>'
      + `<g stroke="${l}" stroke-width="1.8" stroke-linecap="round" opacity=".85">`
      + '<path d="M5 20.4l3-1.8M15.5 21.2l3.5-2"/></g>'
  },
  // 沙尘暴：斜向粗风带 + 沙粒
  sandstorm: (uid, a, b) => {
    const l = `url(#qw-ic-${uid}-f)`
    return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0">`
      + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
      + `<g stroke="${l}" stroke-width="2.6" stroke-linecap="round">`
      + '<path d="M4.5 8l15 5.4M4.5 12.6l15 5.4M4.5 17.2l15 5.4"/></g>'
      + `<g fill="${l}" opacity=".85">`
      + '<circle cx="7.8" cy="5.4" r="1"/><circle cx="12.6" cy="3.8" r="1.15"/><circle cx="17.2" cy="6" r=".95"/>'
      + '</g>'
  },
  // 热 / 冷：温度计图样
  hot: (uid) => thermometer(uid) + '<circle cx="18" cy="5" r="1" fill="#ffffff" opacity=".65"/>',
  cold: (uid) => thermometer(uid) + flake(18.4, 4.8, 0.42, SNOW_GRAY_LIGHT),
  unknown: (uid) => {
    const c = U(uid)
    return cloudShapes(uid, c) + cloudShade() + '<circle cx="12.2" cy="11.2" r="1.4" fill="#ffffff" opacity=".7"/>'
  },
}

/**
 * condition code → 图标归类。
 * 100=晴、15x=夜间、30x/35x=雨、302-304=雷、40x=雪、404-406/456=雨夹雪、
 * 500-501/509-515=雾、502/511-513=霾、503-504=扬沙/浮尘、507-508=沙尘暴、
 * 900=热、901=冷。
 */
export function iconKindOf(code: string): IconKind {
  const n = Number(code)
  if (!Number.isFinite(n)) return 'unknown'
  if (n === 100) return 'sun'
  if (n === 150) return 'moon'
  if (n === 101 || n === 102 || n === 103) return 'partly'
  if (n === 151 || n === 152 || n === 153) return 'partly-night'
  if (n === 104) return 'cloudy'
  if (n === 302 || n === 303 || n === 304) return 'thunder'
  if (n >= 300 && n < 400) {
    return n === 306 || n === 307 || n === 308 || n === 310 || n === 311 || n === 312
      || n === 315 || n === 316 || n === 317 || n === 318 ? 'heavy-rain' : 'rain'
  }
  if (n === 404 || n === 405 || n === 406 || n === 456) return 'sleet'
  if (n >= 400 && n < 500) return 'snow'
  if (n === 502 || n === 511 || n === 512 || n === 513) return 'haze'
  if (n === 503 || n === 504) return 'dust'
  if (n === 507 || n === 508) return 'sandstorm'
  if (n >= 500 && n < 600) return 'fog'
  if (n === 900) return 'hot'
  if (n === 901) return 'cold'
  return 'unknown'
}
