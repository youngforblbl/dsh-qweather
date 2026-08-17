/**
 * 设置卡片（注册到 settings.plugin.item 槽位）：
 * 1) 输入/保存 API Host、项目 ID、API KEY；
 * 2) 一键总开关（控制侧边栏组件与两个 LLM 工具）；
 * 3) 自动定位（市/区级，浏览器定位）或手动输入位置；
 * 附带「测试连接」按钮，保存前先验证密钥与位置可用。
 * 表单采用 staged draft：点「保存」才写入设置命名空间。
 */

import { useState, type CSSProperties } from 'react'
import { QWeatherClient } from '../qweather/api.ts'
import { placeLabel, round1 } from '../qweather/types.ts'
import { useSettingsSnapshot, type QWeatherSettings, type SettingsScopeLike } from './use-qweather.ts'

export interface QWeatherSettingsCardProps {
  scope: SettingsScopeLike
  /** 本插件的翻译函数（由注册方注入；避免与框架的 t 座位冲突）。 */
  qw: (key: string) => string
}

const fg = 'var(--dsw-alias-label-primary)'
const muted = 'var(--dsw-alias-label-caption)'
const border = 'var(--dsw-alias-border-l2)'
const accent = 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)'
const cardBg = 'var(--dsw-alias-bg-layer-1)'

const block: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: fg }
const hint: CSSProperties = { fontSize: 11, color: muted, lineHeight: 1.5 }
const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 12, color: fg,
  background: 'var(--dsw-alias-bg-layer-2, transparent)', border: '1px solid ' + border,
  borderRadius: 8, padding: '6px 8px', outline: 'none',
}
const button: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#fff', background: accent, border: 'none',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
}
const ghostButton: CSSProperties = {
  fontSize: 12, color: accent, background: 'transparent', border: '1px solid ' + border,
  borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
}

interface Drafts {
  apiHost: string
  apiKey: string
  projectId: string
  locationMode: 'auto' | 'manual'
  location: string
}

type TestResult = { ok: boolean; text: string } | null

/** 设置卡片组件。 */
export function QWeatherSettingsCard(props: QWeatherSettingsCardProps) {
  const settings = useSettingsSnapshot(props.scope)
  const t = props.qw
  // null 表示尚未编辑：直接展示命名空间里的当前值
  const [drafts, setDrafts] = useState<Drafts | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [test, setTest] = useState<TestResult>(null)
  const [showKey, setShowKey] = useState(false)

  if (settings === undefined) {
    return <div style={{ padding: 12, fontSize: 12, color: muted }}>{t('card.unavailable')}</div>
  }

  const draft = (field: keyof Drafts): string => drafts?.[field] ?? String(settings[field] ?? '')
  const update = (field: keyof Drafts, value: string) => {
    setDrafts((previous) => ({ ...(previous ?? {
      apiHost: settings.apiHost, apiKey: settings.apiKey, projectId: settings.projectId,
      locationMode: settings.locationMode, location: settings.location,
    }), [field]: value }))
    setNotice('')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setNotice('')
    try {
      if (drafts !== null) {
        if (drafts.apiHost !== settings.apiHost) await props.scope.set('apiHost', drafts.apiHost)
        if (drafts.apiKey !== settings.apiKey) await props.scope.set('apiKey', drafts.apiKey)
        if (drafts.projectId !== settings.projectId) await props.scope.set('projectId', drafts.projectId)
        if (drafts.locationMode !== settings.locationMode) await props.scope.set('locationMode', drafts.locationMode)
        if (drafts.location !== settings.location) await props.scope.set('location', drafts.location)
      }
      setDrafts(null)
      setNotice(t('card.saved'))
    } catch (cause) {
      setNotice(t('card.saveFailed') + '：' + (cause instanceof Error ? cause.message : String(cause)))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = () => {
    void props.scope.set('enabled', !settings.enabled)
  }

  const runTest = async () => {
    setTest(null)
    const apiKey = draft('apiKey')
    if (apiKey.trim().length === 0) {
      setTest({ ok: false, text: t('card.testNeedKey') })
      return
    }
    try {
      const client = new QWeatherClient({ apiHost: draft('apiHost'), apiKey })
      const place = await client.resolvePlace(draft('location'))
      const now = await client.current(place.lat, place.lon)
      setTest({ ok: true, text: t('card.testOk') + '：' + placeLabel(place) + ' · ' + now.text + ' ' + round1(now.temp) + '℃' })
    } catch (cause) {
      setTest({ ok: false, text: t('card.testFail') + '：' + (cause instanceof Error ? cause.message : String(cause)) })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, border: '1px solid ' + border, borderRadius: 12, background: cardBg }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: fg }}>和风天气 QWeather</div>
          <div style={hint}>{t('card.desc')}</div>
        </div>
        <button onClick={toggleEnabled} style={settings.enabled ? button : ghostButton} aria-pressed={settings.enabled}>
          {settings.enabled ? t('card.on') : t('card.off')}
        </button>
      </div>
      {!settings.enabled && <div style={hint}>{t('card.offHint')}</div>}

      <div style={block}>
        <label style={label}>API Host（服务域名）</label>
        <input style={input} value={draft('apiHost')} onChange={(e) => update('apiHost', e.target.value)}
          placeholder="https://devapi.qweather.com" spellCheck={false} />
        <div style={hint}>{t('card.hostHint')}</div>
      </div>

      <div style={block}>
        <label style={label}>API KEY</label>
        <input style={input} value={draft('apiKey')} onChange={(e) => update('apiKey', e.target.value)}
          type={showKey ? 'text' : 'password'} placeholder="例如 fbdc…f48b" spellCheck={false} autoComplete="off" />
        <label style={{ ...hint, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {t('card.showKey')}
        </label>
      </div>

      <div style={block}>
        <label style={label}>{t('card.projectId')}</label>
        <input style={input} value={draft('projectId')} onChange={(e) => update('projectId', e.target.value)}
          placeholder="如 KEGW8X7XUJ（可选，仅记录）" spellCheck={false} />
      </div>

      <div style={block}>
        <label style={label}>{t('card.location')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['auto', 'manual'] as const).map((mode) => (
            <button key={mode} onClick={() => update('locationMode', mode)}
              style={draft('locationMode') === mode ? button : ghostButton}>
              {mode === 'auto' ? t('card.auto') : t('card.manual')}
            </button>
          ))}
        </div>
        {draft('locationMode') === 'manual' && (
          <input style={input} value={draft('location')} onChange={(e) => update('location', e.target.value)}
            placeholder="北京 / 海淀 / 101010100 / 116.41,39.92" spellCheck={false} />
        )}
        <div style={hint}>
          {draft('locationMode') === 'auto'
            ? t('card.autoHint') + (settings.autoLocationName ? ' ' + t('card.autoResolved') + '：' + settings.autoLocationName : '')
            : t('card.manualHint')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void save()} disabled={saving} style={button}>
          {saving ? t('card.saving') : t('card.save')}
        </button>
        <button onClick={() => void runTest()} style={ghostButton}>{t('card.test')}</button>
        <a href="https://dev.qweather.com/docs/api/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: accent }}>{t('card.docs')}</a>
      </div>

      {notice !== '' && <div style={{ fontSize: 12, color: notice.startsWith(t('card.saved')) ? 'var(--dsw-alias-success, #3aa675)' : 'var(--dsw-alias-danger, #d9534f)' }}>{notice}</div>}
      {test !== null && (
        <div style={{ fontSize: 12, color: test.ok ? 'var(--dsw-alias-success, #3aa675)' : 'var(--dsw-alias-danger, #d9534f)', wordBreak: 'break-all' }}>
          {test.text}
        </div>
      )}
    </div>
  )
}
