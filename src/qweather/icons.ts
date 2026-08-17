/**
 * 内置极简天气 SVG 图标（自绘、MIT 授权，无网络依赖）。
 * 和风天气的图标 CDN 需要 Referer 且不可跨域，因此插件自带一套 24x24
 * 线性图标，按 condition code 映射；未知代码回退到「多云」。
 * 图标随 currentColor 着色，自动适配明暗主题。
 */

/** 图标归类。 */
type IconKind = 'sun' | 'moon' | 'partly' | 'partly-night' | 'cloudy' | 'rain' | 'heavy-rain' | 'thunder' | 'sleet' | 'snow' | 'fog' | 'haze' | 'unknown'

const CLOUD = '<path d="M7.5 18a4.5 4.5 0 1 1 .8-8.94A5.5 5.5 0 0 1 19 11.5a4 4 0 0 1-.5 7"/>'
const SUN_CORE = '<circle cx="12" cy="12" r="3.6"/>'
const SUN_RAYS = '<path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3"/>'
const MOON = '<path d="M20 13.2A8 8 0 1 1 10.8 4a6.5 6.5 0 0 0 9.2 9.2z"/>'
const DROPS = '<path d="M9 16.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0-1.3-2.3-3.5-2.3-3.5S9 15.2 9 16.5z"/>'
const HEAVY_DROPS = '<path d="M8.5 16.5c0 1.4 1 2.5 2.3 2.5 1.4 0 2.4-1.1 2.4-2.5 0-1.3-2.4-3.5-2.4-3.5s-2.3 2.2-2.3 3.5zM13.5 19.5c0 1.2.9 2.2 2 2.2s2-1 2-2.2c0-1.1-2-3-2-3s-2 1.9-2 3z"/>'
const BOLT = '<path d="M13 12l3.5-5h-4l1-4-4 5.5h3.2z"/>'
const SNOW_DOTS = '<path d="M9.5 16.5h.01M12 17.8h.01M14.5 16.5h.01M10.8 19.6h.01M13.2 19.6h.01"/>'
const FOG_LINES = '<path d="M6 14.5h12M7 17.5h10M9 20.5h6"/>'
const HAZE_LINES = '<path d="M5 9h14M7 12.5h10M6 16h12M8.5 19.5h7M10 5.5h4"/>'

const BODIES: Record<IconKind, string> = {
  sun: `${SUN_RAYS}${SUN_CORE}`,
  moon: MOON,
  partly: `${SUN_RAYS}${SUN_CORE}${CLOUD}`,
  'partly-night': `${MOON}${CLOUD}`,
  cloudy: CLOUD,
  rain: `${CLOUD}${DROPS}`,
  'heavy-rain': `${CLOUD}${HEAVY_DROPS}`,
  thunder: `${CLOUD}${BOLT}`,
  sleet: `${CLOUD}${DROPS}${SNOW_DOTS}`,
  snow: `${CLOUD}${SNOW_DOTS}`,
  fog: `${CLOUD}${FOG_LINES}`,
  haze: HAZE_LINES,
  unknown: CLOUD,
}

/**
 * condition code → 图标归类。
 * 规则：100=晴、15x=夜间、30x/35x=雨、302-304=雷、40x=雪、404-406/456=雨夹雪、
 * 50x=雾/霾/沙尘。
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

/** 生成一个内联 SVG 天气图标。 */
export function weatherIcon(code: string, size = 24): string {
  const body = BODIES[iconKindOf(code)]
  return `<svg class="qw-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}
