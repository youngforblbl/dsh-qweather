/**
 * 对话内天气卡片的 sandbox iframe 外壳：CSP、主题变量桥接、自适应高度上报。
 * 安全模型与文档结构借鉴 @dsh-external/dsh-visualize（BSD-3-Clause）：
 * <iframe sandbox> 不透明源 + 帧内 CSP，只允许内联样式/脚本与 data: 图片，
 * 卡片 HTML 本身不含脚本（仅外壳的高度上报脚本）。
 */

import type { ResolvedTheme } from './theme.ts'

/** 帧文档的 Content-Security-Policy（无任何网络请求能力）。 */
export const CARD_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** 帧→卡片的高度上报消息类型。 */
export const HEIGHT_MESSAGE_TYPE = 'dsh-qweather:height'

export interface CardDocOptions {
  /** 已校验的卡片 fragment（由主机工具生成）。 */
  fragment: string
  /** 文档标题（已转义）。 */
  title: string
  /** 桥接进帧内的 --qw-* 主题变量。 */
  theme: ResolvedTheme
  /** 关联令牌（tool callId），高度上报时回显。 */
  reportToken: string
}

/**
 * 组装一个卡片 iframe 的完整 srcdoc 文档。
 * 主题变量先经过 sanitizeCssValue 清洗，非法值直接丢弃。
 */
export function buildCardDoc(options: CardDocOptions): string {
  const rootVars = Object.entries(options.theme.themeVars)
    .map(([name, value]) => [name, sanitizeCssValue(value)] as const)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => '--qw-' + name + ': ' + value + ';')
    .join(' ')
  const doc = '<!doctype html>\n'
    + '<html lang="zh">\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="referrer" content="no-referrer">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + CARD_CSP + '">\n'
    + '<title>' + escapeHtml(options.title) + '</title>\n'
    + '<style>\nhtml,body{margin:0;padding:0;background:transparent}\n'
    + ':root { ' + rootVars + ' color-scheme: ' + options.theme.colorScheme + '; }\n'
    + 'body { padding: 4px 2px; }\n</style>\n</head>\n<body>\n'
    + options.fragment + '\n'
    + '<script>' + heightReporter(options.reportToken) + '</script>\n'
    + '</body>\n</html>\n'
  return doc
}

/**
 * 帧内高度上报：load 与每次 resize 后把文档高度发给父页面，
 * 父卡片据此设置 iframe 高度（sandbox 帧内文档父页面无法直接读取）。
 */
function heightReporter(reportToken: string): string {
  const token = JSON.stringify(reportToken)
  return '\n'
    + '(function () {\n'
    + '  var post = function () {\n'
    + '    parent.postMessage({\n'
    + '      type: ' + JSON.stringify(HEIGHT_MESSAGE_TYPE) + ',\n'
    + '      token: ' + token + ',\n'
    + '      height: document.documentElement.scrollHeight,\n'
    + '    }, \'*\');\n'
    + '  };\n'
    + '  new ResizeObserver(post).observe(document.documentElement);\n'
    + '  addEventListener(\'load\', post);\n'
    + '  post();\n'
    + '})();\n'
}

/**
 * 让一个桥接变量在样式块内保持惰性：合法的计算样式颜色不含分隔符，
 * 出现即视为畸形值，丢弃而非修复。
 */
export function sanitizeCssValue(value: string): string {
  const trimmed = value.trim()
  return /[;{}<>]/u.test(trimmed) ? '' : trimmed
}

/** 帧 <title> 的最小 HTML 转义。 */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
