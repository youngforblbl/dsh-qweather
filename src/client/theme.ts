/**
 * 宿主主题解析（借鉴 dsh-visualize 的桥接方式）：读取 DSH 的
 * --dsw-alias-* 设计令牌并推导明暗主题。读取点是 document.body（DSH 在
 * body 上挂令牌与深色覆盖属性），令牌缺失时返回空字符串，由外壳丢弃。
 */

/** 宿主设计令牌 → 帧内 --qw-* 变量。 */
const TOKEN_BRIDGE: readonly (readonly [string, string])[] = [
  ['foreground', '--dsw-alias-label-primary'],
  ['muted', '--dsw-alias-label-caption'],
  ['border', '--dsw-alias-border-l2'],
  ['card', '--dsw-alias-bg-layer-1'],
  ['accent', '--dsw-alias-brand-primary-new-colorprimary-new-color'],
  ['pop', '--dsw-alias-info-new-colorprimary-new-color'],
]

/** 桥接调色板与色彩方案。 */
export interface ResolvedTheme {
  themeVars: Record<string, string>
  colorScheme: 'light' | 'dark'
}

/** 解析桥接调色板与宿主色彩方案。 */
export function resolveTheme(): ResolvedTheme {
  const computed = getComputedStyle(document.body)
  const themeVars: Record<string, string> = {}
  for (const [frameName, hostToken] of TOKEN_BRIDGE) {
    themeVars[frameName] = computed.getPropertyValue(hostToken)
  }
  const scheme = computed.colorScheme
  const colorScheme: ResolvedTheme['colorScheme'] = scheme.includes('dark') && !scheme.includes('light')
    ? 'dark'
    : scheme.includes('light') && !scheme.includes('dark')
      ? 'light'
      : document.body.hasAttribute('data-ds-dark-theme')
        ? 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return { themeVars, colorScheme }
}
