/**
 * 开发脚本：用真实 API 拉一份天气样例，写进 samples/sample-bundle.json。
 * 用法：QW_API_KEY=你的key node scripts/fetch-sample.mjs [位置]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { QWeatherClient } from '../lib/index.js'
import { buildCardFragment, buildWeatherText } from '../lib/index.js'
import { parseFields } from '../lib/index.js'

const apiKey = process.env.QW_API_KEY ?? ''
if (apiKey.length === 0) {
  console.error('请先设置环境变量 QW_API_KEY')
  process.exit(1)
}
const target = process.argv[2] ?? '北京'
const client = new QWeatherClient({ apiKey })
const place = await client.resolvePlace(target)
const [now, hours, alerts] = await Promise.all([
  client.current(place.lat, place.lon),
  client.hourly(place.lat, place.lon, 5),
  client.alerts(place.lat, place.lon),
])
const bundle = { place, receivedAt: new Date().toISOString(), now, hours, alerts }
await mkdir(new URL('../samples/', import.meta.url), { recursive: true })
await writeFile(new URL('../samples/sample-bundle.json', import.meta.url), JSON.stringify(bundle, null, 2))
console.log('地点：', place.name, place.adm1)
console.log(buildWeatherText(bundle, 'now', parseFields('all')))
const fragment = buildCardFragment(bundle, 5)
await writeFile(new URL('../samples/sample-card.html', import.meta.url), fragment)
console.log('卡片 fragment：', fragment.length, '字符，已写入 samples/sample-card.html')
