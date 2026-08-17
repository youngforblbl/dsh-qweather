/**
 * 内置天气图标（自绘、MIT、无网络依赖）。v2 设计：
 * - 填充式 + 双色纵向渐变（顶部高光 → 底部深色），替代单调的线性图标；
 * - 每枚图标带一层向下偏移的深色投影，形成新拟态的“浮起”立体感；
 * - 太阳/月亮/雨滴/闪电等高光细节用白色叠加层勾勒；
 * - 晴间多云/多云间晴：云体为实心填充叠加，前后层分明，不再出现线条互相穿插。
 * 渐变 id 以调用方传入的 uid 隔离，避免同文档多枚图标时 defs 冲突。
 */

type IconKind = 'sun' | 'moon' | 'partly' | 'partly-night' | 'cloudy' | 'rain' | 'heavy-rain' | 'thunder' | 'sleet' | 'snow' | 'fog' | 'haze' | 'unknown'

/** 渐变色板（两主题通用）：晴=橙、月=靛、云=白灰、水/雾=天蓝、闪电=金黄。 */
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
  haze: ['#f4f8fd', '#b9c9e0'],
  unknown: ['#ffffff', '#c7d6ea'],
}

/** 水（雨滴/雾线/雪）用的天蓝色渐变。 */
const WATER_A = '#8fd9ff'
const WATER_B = '#0284c7'
const BOLT_A = '#ffe082'
const BOLT_B = '#fb923c'
const SUN_A = '#ffd08a'
const SUN_B = '#f97316'
const MOON_A = '#b9c7ff'
const MOON_B = '#6f86f5'

/** 生成一条纵向渐变（id 用 uid 隔离）。 */
function grad(uid: string, a: string, b: string): string {
  return `<defs><linearGradient id="qw-ic-${uid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
}

const U = (uid: string): string => `url(#qw-ic-${uid})`

/** 云体轮廓：三个圆 + 圆角底边（y 约 12.5-18.8）。 */
function cloudShapes(uid: string, color: string): string {
  const f = color.startsWith('url') ? color : color
  return `<circle cx="9" cy="14.8" r="3.5" fill="${f}"/>`
    + `<circle cx="13.4" cy="12.4" r="4.3" fill="${f}"/>`
    + `<circle cx="17.8" cy="15.2" r="3" fill="${f}"/>`
    + `<rect x="6.9" y="14.2" width="13.6" height="4.6" rx="2.3" fill="${f}"/>`
}

/** 云底阴影（立体感来源）。 */
function cloudShade(): string {
  return '<rect x="6.9" y="16" width="13.6" height="2.8" rx="1.4" fill="#7d95b8" opacity=".28"/>'
}

/** 雨滴（泪滴形 + 高光）。 */
function drop(cx: number, cy: number, s: number, color: string): string {
  return `<path transform="translate(${cx - 12.4},${cy - 15.2}) scale(${s})" d="M12.4 12.2c0 2.5 1.5 4.1 3 4.1s3-1.6 3-4.1c0-2.2-3-4.7-3-4.7s-3 2.5-3 4.7z" fill="${color}"/>`
    + `<circle cx="${cx - 0.7}" cy="${cy + 0.2}" r="${0.7 * s}" fill="#ffffff" opacity=".75"/>`
}

/** 雪花：三条圆头短线 + 中心点。 */
function flake(cx: number, cy: number, s: number): string {
  return `<g transform="translate(${cx - 12},${cy - 12}) scale(${s})" stroke="#ffffff" stroke-width="2" stroke-linecap="round">`
    + '<path d="M12 7.6v8.8M8.2 9.8l7.6 4.4M15.8 9.8l-7.6 4.4"/></g>'
    + `<circle cx="${cx}" cy="${cy}" r="${1.1 * s}" fill="#ffffff"/>`
}

/** 太阳本体 + 光芒（fill/line 双色渐变）。 */
function sun(uid: string, cx: number, cy: number, s: number, rays: boolean): string {
  const c = U(uid)
  const lines = rays
    ? `<g transform="translate(${cx - 12},${cy - 12}) scale(${s})" stroke="${c}" stroke-width="2.3" stroke-linecap="round">`
      + '<path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></g>'
    : ''
  return lines
    + `<circle cx="${cx}" cy="${cy}" r="${4.5 * s}" fill="${c}"/>`
    + `<circle cx="${cx - 1.2 * s}" cy="${cy - 1.2 * s}" r="${1.8 * s}" fill="#ffffff" opacity=".4"/>`
}

/** 月牙 + 星光。 */
function moon(uid: string, cx: number, cy: number, s: number): string {
  const c = U(uid)
  return `<path transform="translate(${cx - 12},${cy - 12}) scale(${s})" d="M19.6 12.8A8.6 8.6 0 1 1 11.2 3.4a7.2 7.2 0 0 0 8.4 9.4z" fill="${c}"/>`
    + `<circle cx="${cx - 3.2 * s}" cy="${cy - 4 * s}" r="${1 * s}" fill="#ffffff" opacity=".85"/>`
    + `<circle cx="${cx - 1.4 * s}" cy="${cy - 1 * s}" r="${0.6 * s}" fill="#ffffff" opacity=".6"/>`
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
  const main = BODIES[kind] ?? BODIES['unknown']!
  const body = main(uid, a, b)
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
  // 晴间多云：太阳在右上，云体实心覆盖在左下方——前后层分明，无线条穿插
  partly: (uid, a, b) => {
    const c = U(uid)
    return grad('pw' + uid, SUN_A, SUN_B)
      + sun('pw' + uid, 15.2, 7.8, 0.68, true)
      + `<g transform="translate(-0.6,0.6)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + '<circle cx="12.6" cy="11" r="1.4" fill="#ffffff" opacity=".65"/>'
  },
  'partly-night': (uid, a, b) => {
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
  rain: (uid, a, b) => {
    const c = U(uid)
    const w = `url(#qw-ic-${uid}-w)`
    return cloudShapes(uid, c) + cloudShade()
      + `<defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>`
      + drop(10, 15.6, 1, w) + drop(14.6, 15.6, 1, w)
  },
  'heavy-rain': (uid, a, b) => {
    const c = U(uid)
    const w = `url(#qw-ic-${uid}-w)`
    return cloudShapes(uid, c) + cloudShade()
      + `<defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>`
      + drop(8.6, 15.6, 1, w) + drop(12.4, 16, 1, w) + drop(16.2, 15.6, 1, w)
  },
  thunder: (uid, a, b) => {
    const c = U(uid)
    const bolt = `url(#qw-ic-${uid}-bolt)`
    return `<g transform="translate(0,-1.2)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-bolt" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${BOLT_A}"/><stop offset="100%" style="stop-color:${BOLT_B}"/></linearGradient></defs>`
      + `<path d="M13.6 12.6l3.6-4.4h-2.4l1-3.2-3.9 4.6h2.5z" fill="${bolt}" stroke="${bolt}" stroke-width="1.2" stroke-linejoin="round"/>`
      + '<path d="M13.9 9.4l1.2-1.4" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".8"/>'
  },
  sleet: (uid, a, b) => {
    const c = U(uid)
    const w = `url(#qw-ic-${uid}-w)`
    return cloudShapes(uid, c) + cloudShade()
      + `<defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>`
      + drop(9.6, 15.4, 0.9, w) + flake(15.4, 16.4, 0.9)
  },
  snow: (uid) => {
    const c = U(uid)
    return cloudShapes(uid, c) + cloudShade()
      + flake(8.4, 16, 0.92) + flake(12.4, 16.8, 0.92) + flake(16.4, 16, 0.92)
  },
  fog: (uid, a, b) => {
    const c = U(uid)
    const l = `url(#qw-ic-${uid}-f)`
    return `<g transform="translate(0,-1.6)">${cloudShapes(uid, c)}${cloudShade()}</g>`
      + `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0">`
      + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
      + `<g stroke="${l}" stroke-width="2.4" stroke-linecap="round">`
      + '<path d="M6 16.6h12M8 19.4h8M10 22.2h4"/></g>'
  },
  haze: (uid, a, b) => {
    const l = `url(#qw-ic-${uid}-f)`
    return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0">`
      + `<stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`
      + `<g stroke="${l}" stroke-width="2.6" stroke-linecap="round">`
      + '<path d="M4.5 8h15M6.5 12h11M4.5 16h15M8 20h8"/></g>'
      + '<circle cx="16.5" cy="5.6" r="1" fill="#cbd7e8" opacity=".7"/>'
  },
  unknown: (uid) => {
    const c = U(uid)
    return cloudShapes(uid, c) + cloudShade() + '<circle cx="12.2" cy="11.2" r="1.4" fill="#ffffff" opacity=".7"/>'
  },
}

/**
 * condition code → 图标归类。
 * 100=晴、15x=夜间、30x/35x=雨、302-304=雷、40x=雪、404-406/456=雨夹雪、50x=雾/霾/沙尘。
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
  if (n === 502 || n === 503 || n === 504 || n === 507 || n === 508 || n === 511 || n === 512 || n === 513) return 'haze'
  if (n >= 500 && n < 600) return 'fog'
  return 'unknown'
}
