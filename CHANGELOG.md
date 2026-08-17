# Changelog

本文件按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范记录 dsh-qweather 的重要变更。

## [Unreleased]

### 新增

- 统一错误模型：新增 `QWeatherError` / `QWeatherApiError` 与 `ERROR_CATALOG`，所有对外错误均携带稳定错误码（`QW_*`）、分类、可重试性与修复提示。
- 轻量日志器：新增 `createLogger` / `setLogLevel` / `redact`，支持分级（`debug|info|warn|error|silent`）、命名空间前缀与密钥自动脱敏；默认级别 `warn`，用环境变量 `QW_LOG_LEVEL` 覆盖。
- 配置接口（`GET/POST /dsh-qweather/config`）错误响应升级为 `{ error, code }` 结构化格式。

### 变更

- 侧边栏天气卡片整体拉高：加大卡片内距与区块间距，缓解拥挤。
- 侧边栏与对话内卡片的逐小时预报格由内凹改为外凸新拟态，与图标块风格统一。
- 侧边栏当前气温字号再调小 2px。
- 删除侧边栏与对话内卡片的气温曲线，气温改为直接标注在逐小时预报格内。
- 逐小时预报格新增风向（箭头）与风级（数字），降水概率前置雨滴图标。
- 对话内卡片新增「天气详情」（空气质量/日月起落/生活指数），侧边栏仅空气质量/日月起落。
- 预警展示阈值下调至蓝色（仅过滤未知级别），仅显示简要标题，多条预警横向并排（2-3 个/行）。

### 修复

- 修复 `api.ts` 在缺少全局 `DOMException` 的运行时可能抛 `ReferenceError` 的问题（改为按 `.name` 安全识别取消类异常）。
- 修复请求超时（`AbortSignal.timeout` 抛 `TimeoutError`）被误判为网络错误的问题，现在正确归类为 `QW_TIMEOUT`。
- 修复上游返回非 JSON 响应时 `response.json()` 抛原始 `SyntaxError` 的问题，现在包装为 `QW_BAD_RESPONSE`。
- 修复 API Host 缺少协议或非法时导致 `fetch` 相对路径解析失败的问题：自动补全 `https://`，非法 host 回退默认域名并告警。

### 文档

- 修正 README 中与实现不一致的描述（`qweather_card` 固定 5 小时、设置注册方式、图标数量等）。
- 新增「错误码」与「日志与可观测性」章节；补充 `#dsh-plugin` 发布说明。

## [0.1.0] - 2026-08-17

- 首个版本：设置卡片、侧边栏天气组件、LLM 天气工具（`qweather_weather` / `qweather_card`）、对话内天气卡片。
