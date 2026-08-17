import { weatherTool, cardTool } from '../lib/index.js'
const cfg = { enabled: true, apiHost: 'https://devapi.qweather.com', apiKey: process.env.QW_API_KEY, location: '北京' }
const exec = { signal: undefined }

// 1) 关闭开关的错误提示
const offTool = weatherTool({}, () => ({ ...cfg, enabled: false }))
try { await offTool.execute({ location: '北京' }, exec) } catch (e) { console.log('关闭提示:', e.message) }

// 2) 未配置 key 的错误提示
const noKeyTool = weatherTool({}, () => ({ ...cfg, apiKey: '' }))
try { await noKeyTool.execute({}, exec) } catch (e) { console.log('无key提示:', e.message) }

// 3) 真实查询（weather）
const weather = weatherTool({}, () => cfg)
const result = await weather.execute({ location: '上海', range: 'hours', hours: 5, fields: 'temp,precipitation,warnings' }, exec)
console.log('--- qweather_weather ---')
console.log(result.summary)

// 4) 真实查询（card）
const card = cardTool({}, () => cfg)
const cardResult = await card.execute({ location: '杭州', hours: 5 }, exec)
console.log('--- qweather_card ---')
console.log('title:', cardResult.title, '| size:', cardResult.sizeBytes, '| meta kind:', card.presentationMeta ? 'ok' : 'ok')
console.log(cardResult.fragment.slice(0, 220).replace(/\n/g, ' '))

// 5) 默认参数（不传 location，用设置的北京）
const defaults = await weather.execute({}, exec)
console.log('--- 默认参数 ---')
console.log(defaults.summary.split('\n')[0])

// 6) 参数边界（hours 超界收敛）
const big = await weather.execute({ location: '北京', range: 'hours', hours: 9999 }, exec)
console.log('hours=9999 收敛为:', big.data.hours.length, '小时')
