# dsh-qweather

A QWeather (和风天气) plugin for DeepSeek Harness: live weather in the sidebar, for the LLM, and drawn into the conversation stream.

[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![topic](https://img.shields.io/badge/topic-dsh--plugin-0969da)](https://github.com/topics/dsh-plugin)

> **Add the `dsh-plugin` GitHub topic** (Repo → ⚙️ Settings → Topics) so the plugin is discoverable under the [dsh-plugin topic](https://github.com/topics/dsh-plugin) and [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

[中文](README.md) · [UI preview](preview.html) · [Icon gallery](icons.html) · [API docs](https://dev.qweather.com/docs/api/) · [Changelog](CHANGELOG.md)

## Features

1. **Settings card** — Settings → Plugins → QWeather: API Host / API KEY / Project ID, one master switch for every sub-feature, auto-locate (city/district) or manual location, with a “Test connection” button.
2. **Sidebar weather widget** — bottom of the sidebar: expanded shows current weather (icon + text), temperature, next-5-hours (temperature / precipitation probability / wind direction+scale), blue+ alerts, air quality / sun & moon times / lifestyle indices, update time; collapsed shows only the icon + temperature, click to expand the sidebar.
3. **LLM weather tool** — `qweather_weather(location?, range?, hours?, days?, fields?)` picks the right QWeather API by “location + time span + desired info” and returns a structured summary for the model.
4. **In-conversation weather card** — `qweather_card(location?)` renders current weather, the fixed next-5-hours (temperature / precipitation probability / wind direction+scale), blue+ alerts, air quality / sun & moon times / lifestyle indices and update time as an interactive HTML card inside the conversation (replay-stable).

All features are gated by the settings master switch.

## Install

```bash
dsh plugin --profile web add github:youngforblbl/dsh-qweather
# or from a local checkout:
# dsh plugin --profile web add .
```

Restart `dsh web` (or refresh). Desktop: `dsh plugin --profile desktop add github:youngforblbl/dsh-qweather`, then restart DSH Desktop.

## Configure

1. [QWeather Console](https://console.qweather.com) → Projects & Credentials: copy the **API KEY**; optional **Project ID**; Console → Settings → **API Host** (leave blank for the public `https://devapi.qweather.com`, but prefer your dedicated `*.qweatherapi.com` host as the public one is being phased out from 2026).
2. In DSH: Settings → Plugins → QWeather, fill in and **Save**, then **Test connection**.
3. Location: **auto** uses browser geolocation and reverse-geocodes to the nearest city/district (stored back to settings; falls back to the manual location), **manual** accepts a city/district name, a LocationID (e.g. `101010100`), or “longitude,latitude”.

## Error codes

Every outward error (tool throws, config endpoint responses) carries a stable `QW_*` code for log correlation, alerting, and retry decisions.

| Code | Category | Retryable | Meaning / fix |
| --- | --- | --- | --- |
| `QW_DISABLED` | config | no | Master switch off — enable under Settings → Plugins → QWeather |
| `QW_NO_API_KEY` | config | no | API KEY missing |
| `QW_NO_LOCATION` | input | no | No location: pass `location` or set a default |
| `QW_LOCATION_NOT_FOUND` | input | no | Geocode empty — use a more precise name / LocationID / coordinates |
| `QW_GEOCODE_UNAVAILABLE` | config | no | Browser geolocation unavailable — switch to manual |
| `QW_BAD_HOST` | config | no | Invalid API Host — must be an http(s) URL |
| `QW_NETWORK` | network | yes | Local network failure |
| `QW_TIMEOUT` | network | yes | Request timed out |
| `QW_CANCELLED` | network | no | Request cancelled by the caller |
| `QW_HTTP_ERROR` | upstream | yes | Upstream non-2xx HTTP status |
| `QW_UPSTREAM_ERROR` | upstream | no | Upstream business error code (GeoAPI envelope) |
| `QW_BAD_RESPONSE` | upstream | yes | Upstream response is not valid JSON |
| `QW_BAD_REQUEST` | input | no | Config body invalid / too large / schema failed |
| `QW_FORBIDDEN` | permission | no | Cross-origin config write rejected |
| `QW_SETTINGS_UNAVAILABLE` | internal | no | Settings service unavailable |
| `QW_INTERNAL` | internal | no | Internal error — check the logs |

The authoritative catalog lives in `src/qweather/errors.ts` (`ERROR_CATALOG`).

## Logging & observability

A tiny dependency-free logger (`src/qweather/log.ts`, shared by node/browser):

- **Levels**: `debug | info | warn | error | silent`; default `warn` (quiet in normal operation).
- **Switch**: `QW_LOG_LEVEL=debug` turns on full logging; `silent` disables it.
- **Namespaces**: `[qweather:api]` (HTTP requests + latency), `[qweather:tools]` (tool execution), `[qweather:config]` (config read/write).
- **Redaction**: structured extras pass through `redact()`; `apiKey` / `token` / `secret` values become `[redacted]`, so keys never reach the logs.

```bash
QW_LOG_LEVEL=debug dsh web   # run with full logs
```

## Development

Node ≥ 22. `pnpm install && pnpm run check` (typecheck + 55 vitest cases + dual tsdown build into `lib/`, which is committed). `pnpm run preview` regenerates `preview.html` from `samples/sample-bundle.json`; `pnpm run icons` regenerates `icons.html` (the 63-icon gallery).

## Security

Cards run in a sandboxed iframe with a CSP that allows no network access; all markup is template-generated and escaped. The API key is stored in the local `~/.dsh/settings.yaml` (redacted in logs); see the Chinese README for the planned credentials-domain upgrade path.

## License

MIT. iframe shell/toolview patterns modeled on [Nagi-ovo/dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) (BSD-3-Clause). Weather data © [QWeather](https://www.qweather.com); bundled icons are self-drawn SVG.
