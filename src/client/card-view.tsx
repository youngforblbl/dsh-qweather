/**
 * 子功能 3 的渲染端：qweather_card 工具的 toolview 卡片。
 * 卡片内容来自持久化 meta 里的 fragment（会话重放逐字节还原，不依赖网络），
 * 渲染进 sandbox iframe；CSP 只允许内联样式/脚本与 data: 图片。
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { qweatherCardMetaFrom, type QWeatherCardMeta } from '../qweather/types.ts'
import { buildCardDoc, HEIGHT_MESSAGE_TYPE } from './shell.ts'
import { resolveTheme } from './theme.ts'

const MIN_HEIGHT = 48
const MAX_HEIGHT = 900

const headerStyle: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, opacity: 0.65,
  margin: '2px 0 6px', overflow: 'hidden', whiteSpace: 'nowrap',
}

const frameStyle: CSSProperties = {
  display: 'block', width: '100%', border: 0, background: 'transparent', colorScheme: 'normal',
}

/** 结果内容块的第一行文本（错误回退展示用）。 */
function firstResultLine(content: readonly { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      const newline = block.text.indexOf('\n')
      return newline === -1 ? block.text : block.text.slice(0, newline)
    }
  }
  return 'weather card failed'
}

/** 已完成的卡片：标题行 + 自适应高度 sandbox iframe。 */
function CardFrame({ meta, callId }: { meta: QWeatherCardMeta; callId: string }) {
  const [themeTick, setThemeTick] = useState(0)
  const [height, setHeight] = useState(MIN_HEIGHT)

  // 跟随宿主明暗主题切换（body 属性变化或系统主题变化都触发重解析）
  useEffect(() => {
    const bump = () => setThemeTick((tick) => tick + 1)
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, { attributes: true })
    observer.observe(document.body, { attributes: true })
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', bump)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', bump)
    }
  }, [])

  // 帧内高度上报：按内容高度调整 iframe，超出上限后帧内滚动
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (typeof data !== 'object' || data === null) return
      const report = data as { type?: unknown; token?: unknown; height?: unknown }
      if (report.type !== HEIGHT_MESSAGE_TYPE || report.token !== callId) return
      if (typeof report.height !== 'number' || !Number.isFinite(report.height)) return
      setHeight(Math.max(MIN_HEIGHT, Math.min(Math.ceil(report.height), MAX_HEIGHT)))
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [callId])

  const doc = useMemo(() => buildCardDoc({
    fragment: meta.fragment,
    title: meta.title,
    theme: resolveTheme(),
    reportToken: callId,
  }), [meta, callId, themeTick])

  return (
    <div>
      {/*
       * 卡片 fragment 自带标题行（地点 + 更新时间），这里不再叠一层外层标题，
       * 让对话里呈现的就是一张独立卡片（像提问卡片那样直接“弹出”）。
       */}
      <iframe
        sandbox="allow-scripts allow-popups"
        referrerPolicy="no-referrer"
        title={meta.title}
        srcDoc={doc}
        style={{ ...frameStyle, height }}
      />
    </div>
  )
}

/** qweather_card 的 toolview 入口。 */
export function QWeatherCardView({ callId, block }: ToolCallViewProps) {
  if (!('kind' in block)) {
    return <div style={headerStyle}>天气 · 渲染中…</div>
  }
  if (block.isError) {
    return <div style={headerStyle}>天气 · {firstResultLine(block.content)}</div>
  }
  const meta = qweatherCardMetaFrom(block.meta)
  if (meta === undefined) {
    // 旧日志 / 外来日志没有卡片描述符：退化为普通结果文本
    return <div style={headerStyle}>{firstResultLine(block.content)}</div>
  }
  return <CardFrame meta={meta} callId={callId} />
}
