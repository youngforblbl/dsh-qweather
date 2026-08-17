# dsh-qweather

A QWeather (和风天气) plugin for DeepSeek Harness: live weather in the sidebar, for the LLM, and drawn into the conversation stream.

[中文](README.md) · [UI preview](preview.html) · [API docs](https://dev.qweather.com/docs/api/)

## Features

1. **Settings card** — Settings → Plugins → QWeather: API Host / API KEY / Project ID, one master switch for every sub-feature, auto-locate (city/district) or manual location, with a “Test connection” button.
2. **Sidebar weather widget** — bottom of the sidebar: expanded shows current weather (icon + text), temperature, next-5-hours weather / precipitation probability / temperature curve (compact), yellow+ alerts, update time; collapsed shows only the icon + temperature, click to expand the sidebar.
3. **LLM weather tool** — `qweather_weather(location?, range?, hours?, days?, fields?)` picks the right QWeather API by “location + time span + desired info” and returns a structured summary for the model.
4. **In-conversation weather card** — `qweather_card(location?, hours?)` renders current weather, next-N-hours + temperature curve, yellow+ alerts and update time as an interactive HTML card inside the conversation (replay-stable).

All features are gated by the settings master switch.

## Install

```bash
dsh plugin --profile web add github:<your-name>/dsh-qweather
# or from a local checkout:
# dsh plugin --profile web add .
```

Restart `dsh web` (or refresh). Desktop: `dsh plugin --profile desktop add github:<your-name>/dsh-qweather`, then restart DSH Desktop.

## Configure

1. [QWeather Console](https://console.qweather.com) → Projects & Credentials: copy the **API KEY**; optional **Project ID**; Console → Settings → **API Host** (leave blank for the public `https://devapi.qweather.com`, but prefer your dedicated `*.qweatherapi.com` host as the public one is being phased out from 2026).
2. In DSH: Settings → Plugins → QWeather, fill in and **Save**, then **Test connection**.
3. Location: **auto** uses browser geolocation and reverse-geocodes to the nearest city/district (stored back to settings; falls back to the manual location), **manual** accepts a city/district name, a LocationID (e.g. `101010100`), or “longitude,latitude”.

## Development

Node ≥ 22. `pnpm install && pnpm run check` (typecheck + 31 vitest cases + dual tsdown build into `lib/`, which is committed). `pnpm run preview` regenerates `preview.html` from `samples/sample-bundle.json`.

## Security

Cards run in a sandboxed iframe with a CSP that allows no network access; all markup is template-generated and escaped. The API key is stored in the local `~/.dsh/settings.yaml`; see the Chinese README for the planned credentials-domain upgrade path.

## License

MIT. iframe shell/toolview patterns modeled on [Nagi-ovo/dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) (BSD-3-Clause). Weather data © [QWeather](https://www.qweather.com); bundled icons are self-drawn SVG.
