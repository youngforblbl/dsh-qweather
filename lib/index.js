import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region src/qweather/api.ts
/** 默认 API Host（和风公共域名，逐步由专属 API Host 取代）。 */
const DEFAULT_API_HOST = "https://devapi.qweather.com";
/** 旧公共 GeoAPI 域名（仅作回退）。 */
const GEO_FALLBACK_HOST = "https://geoapi.qweather.com";
/** API 错误：携带 HTTP 状态码与可读信息。 */
var QWeatherApiError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
		this.name = "QWeatherApiError";
	}
};
/** 去掉首尾空白与结尾斜杠的 API Host。 */
function normalizeApiHost(host) {
	const trimmed = (host ?? "").trim().replace(/\/+$/, "");
	return trimmed.length > 0 ? trimmed : DEFAULT_API_HOST;
}
/** 是否专属 API Host（*.qweatherapi.com），专属域名提供全部路径。 */
function isDedicatedHost(apiHost) {
	return /^https:\/\/[^/]+\.qweatherapi\.com$/iu.test(apiHost);
}
/** 16 方位 compass → 中文风向（lang=zh 时接口仍可能返回英文方位，这里兜底翻译）。 */
const COMPASS_ZH = {
	n: "北风",
	nne: "北东北风",
	ne: "东北风",
	ene: "东东北风",
	e: "东风",
	ese: "东东南风",
	se: "东南风",
	sse: "南东南风",
	s: "南风",
	ssw: "南西南风",
	sw: "西南风",
	wsw: "西西南风",
	w: "西风",
	wnw: "西西北风",
	nw: "西北风",
	nnw: "北西北风"
};
/** compass → 中文风向；无法翻译时原样返回。 */
function compassZh(compass) {
	if (typeof compass !== "string" || compass.length === 0) return void 0;
	return COMPASS_ZH[compass.toLowerCase()] ?? compass;
}
/**
* 组合取消信号：外部 signal 与超时信号先到先触发。
* 不支持的运行环境退化为外部 signal / 无超时。
*/
function withTimeout(signal, timeoutMs) {
	if (typeof AbortSignal !== "function" || typeof AbortSignal.timeout !== "function") return signal;
	const timeout = AbortSignal.timeout(timeoutMs);
	if (signal === void 0) return timeout;
	if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
	return signal;
}
var QWeatherClient = class {
	apiHost;
	apiKey;
	fetchImpl;
	signal;
	constructor(options) {
		this.apiHost = normalizeApiHost(options.apiHost);
		this.apiKey = options.apiKey.trim();
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.signal = options.signal;
	}
	/** 发起一个 GET 请求并解析 JSON（自动处理 gzip、错误码与超时）。 */
	async request(path, params = {}, base, timeoutMs = 15e3) {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) query.set(key, String(value));
		const url = `${base ?? this.apiHost}${path}?${query.toString()}`;
		let response;
		try {
			response = await this.fetchImpl(url, {
				headers: { "X-QW-Api-Key": this.apiKey },
				signal: withTimeout(this.signal, timeoutMs)
			});
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === "AbortError") throw new QWeatherApiError(0, "请求超时或已取消");
			throw new QWeatherApiError(0, `网络错误：${cause instanceof Error ? cause.message : String(cause)}`);
		}
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new QWeatherApiError(response.status, `和风天气 API 返回 HTTP ${response.status}${body ? `：${body.slice(0, 200)}` : ""}`);
		}
		const data = await response.json();
		if (typeof data?.code === "string" && data.code !== "200") throw new QWeatherApiError(Number(data.code) || 0, `和风天气 API 返回错误码 ${data.code}`);
		return data;
	}
	/** 城市搜索：支持名称 / LocationID / "经度,纬度"。 */
	async geocode(query) {
		const params = {
			location: query.trim(),
			number: 5,
			lang: "zh"
		};
		try {
			const data = await this.request("/geo/v2/city/lookup", params);
			return this.parsePlaces(data);
		} catch (error) {
			if (error instanceof QWeatherApiError && error.status === 404 && !isDedicatedHost(this.apiHost)) {
				const data = await this.request("/v2/city/lookup", params, GEO_FALLBACK_HOST);
				return this.parsePlaces(data);
			}
			throw error;
		}
	}
	parsePlaces(data) {
		return (Array.isArray(data?.location) ? data.location : []).map((row) => ({
			id: String(row.id ?? ""),
			name: String(row.name ?? ""),
			adm1: row.adm1 === void 0 ? void 0 : String(row.adm1),
			adm2: row.adm2 === void 0 ? void 0 : String(row.adm2),
			lat: Number(row.lat),
			lon: Number(row.lon)
		})).filter((place) => place.id.length > 0 && Number.isFinite(place.lat) && Number.isFinite(place.lon));
	}
	/** 实时天气。 */
	async current(lat, lon) {
		const data = await this.request(`/weather/v1/current/${lat.toFixed(2)}/${lon.toFixed(2)}`, {
			localTime: true,
			lang: "zh"
		});
		return {
			temp: Number(data?.temperature?.value),
			feelsLike: data?.feelsLike?.value === void 0 ? void 0 : Number(data.feelsLike.value),
			icon: String(data?.condition?.icon ?? "999"),
			text: String(data?.condition?.text ?? ""),
			humidity: data?.humidity === void 0 ? void 0 : Math.round(Number(data.humidity) * 100),
			windDir: compassZh(data?.wind?.direction?.compass),
			windScale: data?.wind?.scale,
			precip: data?.precipitation?.amount?.value === void 0 ? void 0 : Number(data.precipitation.amount.value),
			pressure: data?.pressure?.value === void 0 ? void 0 : Number(data.pressure.value),
			vis: data?.visibility?.value === void 0 ? void 0 : Math.round(Number(data.visibility.value) / 100) / 10,
			cloud: data?.cloudCover === void 0 ? void 0 : Math.round(Number(data.cloudCover) * 100)
		};
	}
	/** 逐小时预报（1-240 小时）。 */
	async hourly(lat, lon, hours) {
		const data = await this.request(`/weather/v1/hourly/${lat.toFixed(2)}/${lon.toFixed(2)}`, {
			hours,
			localTime: true,
			lang: "zh"
		});
		return (Array.isArray(data?.hours) ? data.hours : []).map((row) => ({
			time: String(row.forecastTime ?? ""),
			temp: Number(row?.temperature?.value),
			icon: String(row?.condition?.icon ?? "999"),
			text: String(row?.condition?.text ?? ""),
			pop: Number(row?.precipitation?.probability ?? 0),
			precip: row?.precipitation?.amount?.value === void 0 ? void 0 : Number(row.precipitation.amount.value),
			humidity: row?.humidity === void 0 ? void 0 : Math.round(Number(row.humidity) * 100),
			windDir: compassZh(row?.wind?.direction?.compass),
			windScale: row?.wind?.scale
		}));
	}
	/** 逐日预报（1-10 天）。 */
	async daily(lat, lon, days) {
		const data = await this.request(`/weather/v1/daily/${lat.toFixed(2)}/${lon.toFixed(2)}`, {
			days,
			localTime: true,
			lang: "zh"
		});
		return (Array.isArray(data?.days) ? data.days : []).map((row) => ({
			date: String(row.forecastStartTime ?? ""),
			tempMax: Number(row?.temperatureMax?.value),
			tempMin: Number(row?.temperatureMin?.value),
			iconDay: String(row?.daytime?.condition?.icon ?? "999"),
			textDay: String(row?.daytime?.condition?.text ?? ""),
			iconNight: row?.nighttime?.condition?.icon === void 0 ? void 0 : String(row.nighttime.condition.icon),
			textNight: row?.nighttime?.condition?.text === void 0 ? void 0 : String(row.nighttime.condition.text),
			sunrise: row?.astro?.sunrise,
			sunset: row?.astro?.sunset,
			moonPhase: row?.astro?.moonPhase,
			pop: row?.daytime?.precipitation?.probability === void 0 ? void 0 : Number(row.daytime.precipitation.probability)
		}));
	}
	/** 实时预警（黄色及以上由调用方用 isYellowOrAbove 过滤）。 */
	async alerts(lat, lon) {
		const data = await this.request(`/weatheralert/v1/current/${lat.toFixed(2)}/${lon.toFixed(2)}`, {
			localTime: true,
			lang: "zh"
		});
		return (Array.isArray(data?.alerts) ? data.alerts : []).map((row) => ({
			id: String(row.id ?? ""),
			sender: row?.senderName,
			pubTime: row?.issuedTime,
			headline: String(row?.headline ?? row?.eventType?.name ?? "天气预警"),
			typeName: row?.eventType?.name,
			severity: String(row?.severity ?? "unknown"),
			color: String(row?.color?.code ?? "unknown"),
			text: row?.description,
			instruction: row?.instruction
		}));
	}
	/** 实时空气质量（优先中文标准 cn-mee）。 */
	async air(lat, lon) {
		const data = await this.request(`/airquality/v1/current/${lat.toFixed(2)}/${lon.toFixed(2)}`, { lang: "zh" });
		const indexes = Array.isArray(data?.indexes) ? data.indexes : [];
		const row = indexes.find((item) => item?.code === "cn-mee") ?? indexes[0];
		if (row === void 0) return void 0;
		return {
			aqi: Number(row.aqi),
			category: row?.category,
			level: row?.level === void 0 ? void 0 : String(row.level),
			primary: row?.primaryPollutant ?? void 0
		};
	}
	/**
	* 把任意位置输入解析成一个地理实体：
	* 支持 "经度,纬度"、LocationID、以及城市 / 区县名称（取第一个结果）。
	*/
	async resolvePlace(query) {
		const places = await this.geocode(query);
		if (places.length === 0) throw new QWeatherApiError(0, `找不到位置「${query}」，请改用更精确的名称（如“北京 海淀”）、LocationID 或“经度,纬度”`);
		return places[0];
	}
};
//#endregion
//#region src/qweather/types.ts
/** 预警颜色 → 展示色。 */
const WARNING_COLORS = {
	blue: "#3d7bd9",
	yellow: "#e3a008",
	orange: "#e0662d",
	red: "#d9534f",
	unknown: "#8a94a6"
};
/** 预警颜色 → 中文名称。 */
const WARNING_NAMES = {
	blue: "蓝色预警",
	yellow: "黄色预警",
	orange: "橙色预警",
	red: "红色预警"
};
/** 黄色及以上（含橙、红）才算「重要预警」；蓝色与未知级别被过滤。 */
function isYellowOrAbove(alert) {
	if (alert.severity === "moderate" || alert.severity === "severe" || alert.severity === "extreme") return true;
	const color = alert.color.toLowerCase();
	return color === "yellow" || color === "orange" || color === "red";
}
/** 预警展示颜色（未知级别用灰色兜底）。 */
function warningColor(alert) {
	return WARNING_COLORS[alert.color.toLowerCase()] ?? WARNING_COLORS["unknown"];
}
/** 补零。 */
function pad2(n) {
	return String(n).padStart(2, "0");
}
/** ISO 时间 → 「15:00」式小时标签（按本地时区显示）。 */
function hourLabel(iso) {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
/** ISO 时间 → 「2026-08-17 15:02」（按本地时区显示）。 */
function localDateTime(iso) {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
/** ISO 时间 → 「8/17」式日期标签。 */
function dayLabel(iso) {
	const match = /(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	return match ? `${Number(match[2])}/${Number(match[3])}` : iso;
}
/** 数字 → 最多一位小数的字符串（30.0 → "30"）。 */
function round1(n) {
	return String(Math.round(n * 10) / 10);
}
/** 百分比 0-1 → 整数百分比文本。 */
function percent(n) {
	return `${Math.round(n * 100)}%`;
}
/** 安全 HTML 转义：所有进入卡片 HTML 的外部文本都必须经过这里。 */
function escapeHtml(text) {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
/** 工具名（客户端 toolview 槽位以工具名为键）。 */
const WEATHER_TOOL_NAME = "qweather_weather";
const CARD_TOOL_NAME = "qweather_card";
/** qweather_card 工具写入持久化 meta 的判别字段（客户端 toolview 槽位同键）。 */
const CARD_META_KIND = "qweather-card";
/** 从持久化 meta 中窄化出卡片 meta（结构不符返回 undefined）。 */
function qweatherCardMetaFrom(meta) {
	if (typeof meta !== "object" || meta === null) return void 0;
	const candidate = meta;
	if (candidate.kind !== "qweather-card" || typeof candidate.fragment !== "string" || typeof candidate.title !== "string" || typeof candidate.location !== "string") return void 0;
	return {
		kind: CARD_META_KIND,
		fragment: candidate.fragment,
		title: candidate.title,
		location: candidate.location,
		updateTime: typeof candidate.updateTime === "string" ? candidate.updateTime : ""
	};
}
/** 「东城 · 北京 · 北京市」式完整地名。 */
function placeLabel(place) {
	return [
		place.name,
		place.adm2,
		place.adm1
	].filter((part, index, parts) => part !== void 0 && part.length > 0 && parts.indexOf(part) === index).join(" · ");
}
//#endregion
//#region src/qweather/format.ts
/** 所有支持的字段名。 */
const ALL_FIELDS = [
	"condition",
	"temp",
	"humidity",
	"wind",
	"precipitation",
	"air",
	"warnings",
	"astro"
];
/** 解析 fields 参数：逗号/空格分隔的 token；unknown / summary / all 归一化。 */
function parseFields(raw) {
	const text = (raw ?? "summary").trim();
	if (text === "" || text === "summary") return /* @__PURE__ */ new Set([
		"condition",
		"temp",
		"humidity",
		"wind",
		"precipitation"
	]);
	if (text === "all") return new Set(ALL_FIELDS);
	const wanted = /* @__PURE__ */ new Set();
	for (const token of text.toLowerCase().split(/[\s,，;；]+/)) for (const field of ALL_FIELDS) if (token === field) wanted.add(field);
	return wanted;
}
/** ISO 时间 → 「2026-08-17 15:02」（本地时区）。 */
function formatUpdateTime(iso) {
	return localDateTime(iso);
}
/** 生成模型可读的天气摘要文本。 */
function buildWeatherText(bundle, range, fields) {
	const lines = [];
	lines.push(`天气信息 · ${placeLabel(bundle.place)}`);
	if (bundle.now !== void 0 && range === "now") {
		const now = bundle.now;
		const head = ["实时天气"];
		if (fields.has("condition")) head.push(now.text || "未知");
		if (fields.has("temp")) head.push(`${round1(now.temp)}℃`);
		if (fields.has("temp") && now.feelsLike !== void 0) head.push(`体感 ${round1(now.feelsLike)}℃`);
		lines.push(head.join(" · "));
		const details = [];
		if (fields.has("humidity") && now.humidity !== void 0) details.push(`湿度 ${now.humidity}%`);
		if (fields.has("wind")) {
			const scale = now.windScale === void 0 || now.windScale === "" ? "" : ` ${now.windScale}级`;
			if (now.windDir !== void 0 || scale !== "") details.push(`风 ${now.windDir ?? ""}${scale}`);
		}
		if (fields.has("precipitation") && now.precip !== void 0) details.push(`降水量 ${now.precip}mm`);
		if (now.pressure !== void 0) details.push(`气压 ${now.pressure}hPa`);
		if (now.vis !== void 0) details.push(`能见度 ${now.vis}km`);
		if (details.length > 0) lines.push(details.join(" · "));
	}
	if (bundle.hours !== void 0 && bundle.hours.length > 0 && range === "hours") {
		lines.push(`未来 ${bundle.hours.length} 小时预报：`);
		for (const hour of bundle.hours) {
			const parts = [hourLabel(hour.time)];
			if (fields.has("condition")) parts.push(hour.text || "未知");
			if (fields.has("temp")) parts.push(`${round1(hour.temp)}℃`);
			if (fields.has("precipitation")) parts.push(`降水 ${percent(hour.pop)}`);
			if (fields.has("humidity") && hour.humidity !== void 0) parts.push(`湿度 ${hour.humidity}%`);
			lines.push(`- ${parts.join(" · ")}`);
		}
	}
	if (bundle.days !== void 0 && bundle.days.length > 0 && range === "days") {
		lines.push(`未来 ${bundle.days.length} 天预报：`);
		for (const day of bundle.days) {
			const parts = [dayLabel(day.date)];
			if (fields.has("condition")) parts.push(`白天 ${day.textDay || "未知"}${day.textNight ? `，夜间 ${day.textNight}` : ""}`);
			if (fields.has("temp")) parts.push(`${round1(day.tempMin)} ~ ${round1(day.tempMax)}℃`);
			if (fields.has("precipitation") && day.pop !== void 0) parts.push(`降水 ${percent(day.pop)}`);
			if (fields.has("astro") && (day.sunrise !== void 0 || day.sunset !== void 0)) parts.push(`日出 ${day.sunrise ? hourLabel(day.sunrise) : "-"} 日落 ${day.sunset ? hourLabel(day.sunset) : "-"}`);
			lines.push(`- ${parts.join(" · ")}`);
		}
	}
	if (fields.has("warnings")) {
		const important = (bundle.alerts ?? []).filter(isYellowOrAbove);
		if (important.length === 0) lines.push("预警：无黄色及以上预警");
		else {
			lines.push(`预警（${important.length} 条）：`);
			for (const alert of important) {
				lines.push(`- [${WARNING_NAMES[alert.color.toLowerCase()] ?? "预警"}] ${alert.headline}（${alert.sender ?? "气象台"}）`);
				if (alert.text !== void 0 && alert.text.length > 0) lines.push(`  ${alert.text.trim()}`);
			}
		}
	}
	if (fields.has("air") && bundle.air !== void 0) {
		const air = bundle.air;
		const parts = [`AQI ${air.aqi}`];
		if (air.category !== void 0) parts.push(air.category);
		if (air.primary !== void 0 && air.primary !== "") parts.push(`首要污染物 ${air.primary}`);
		lines.push(`空气质量：${parts.join(" · ")}`);
	}
	lines.push(`数据时间：${formatUpdateTime(bundle.receivedAt)}（本地接收时间）`);
	return lines.join("\n");
}
//#endregion
//#region src/qweather/icons.ts
const CLOUD = "<path d=\"M7.5 18a4.5 4.5 0 1 1 .8-8.94A5.5 5.5 0 0 1 19 11.5a4 4 0 0 1-.5 7\"/>";
const SUN_CORE = "<circle cx=\"12\" cy=\"12\" r=\"3.6\"/>";
const SUN_RAYS = "<path d=\"M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3\"/>";
const MOON = "<path d=\"M20 13.2A8 8 0 1 1 10.8 4a6.5 6.5 0 0 0 9.2 9.2z\"/>";
const DROPS = "<path d=\"M9 16.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0-1.3-2.3-3.5-2.3-3.5S9 15.2 9 16.5z\"/>";
const HEAVY_DROPS = "<path d=\"M8.5 16.5c0 1.4 1 2.5 2.3 2.5 1.4 0 2.4-1.1 2.4-2.5 0-1.3-2.4-3.5-2.4-3.5s-2.3 2.2-2.3 3.5zM13.5 19.5c0 1.2.9 2.2 2 2.2s2-1 2-2.2c0-1.1-2-3-2-3s-2 1.9-2 3z\"/>";
const BOLT = "<path d=\"M13 12l3.5-5h-4l1-4-4 5.5h3.2z\"/>";
const SNOW_DOTS = "<path d=\"M9.5 16.5h.01M12 17.8h.01M14.5 16.5h.01M10.8 19.6h.01M13.2 19.6h.01\"/>";
const BODIES = {
	sun: `${SUN_RAYS}${SUN_CORE}`,
	moon: MOON,
	partly: `${SUN_RAYS}${SUN_CORE}${CLOUD}`,
	"partly-night": `${MOON}${CLOUD}`,
	cloudy: CLOUD,
	rain: `${CLOUD}${DROPS}`,
	"heavy-rain": `${CLOUD}${HEAVY_DROPS}`,
	thunder: `${CLOUD}${BOLT}`,
	sleet: `${CLOUD}${DROPS}${SNOW_DOTS}`,
	snow: `${CLOUD}${SNOW_DOTS}`,
	fog: `${CLOUD}<path d="M6 14.5h12M7 17.5h10M9 20.5h6"/>`,
	haze: "<path d=\"M5 9h14M7 12.5h10M6 16h12M8.5 19.5h7M10 5.5h4\"/>",
	unknown: CLOUD
};
/**
* condition code → 图标归类。
* 规则：100=晴、15x=夜间、30x/35x=雨、302-304=雷、40x=雪、404-406/456=雨夹雪、
* 50x=雾/霾/沙尘。
*/
function iconKindOf(code) {
	const n = Number(code);
	if (!Number.isFinite(n)) return "unknown";
	if (n === 100) return "sun";
	if (n === 150) return "moon";
	if (n === 101 || n === 102 || n === 103) return "partly";
	if (n === 151 || n === 152 || n === 153) return "partly-night";
	if (n === 104) return "cloudy";
	if (n === 302 || n === 303 || n === 304) return "thunder";
	if (n >= 300 && n < 400) return n === 306 || n === 307 || n === 308 || n === 310 || n === 311 || n === 312 || n === 315 || n === 316 || n === 317 || n === 318 ? "heavy-rain" : "rain";
	if (n === 404 || n === 405 || n === 406 || n === 456) return "sleet";
	if (n >= 400 && n < 500) return "snow";
	if (n === 502 || n === 503 || n === 504 || n === 507 || n === 508 || n === 511 || n === 512 || n === 513) return "haze";
	if (n >= 500 && n < 600) return "fog";
	return "unknown";
}
/** 生成一个内联 SVG 天气图标。 */
function weatherIcon(code, size = 24) {
	return `<svg class="qw-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BODIES[iconKindOf(code)]}</svg>`;
}
//#endregion
//#region src/qweather/card.ts
/** 生成 5 小时气温曲线（内联 SVG，无脚本、无外部依赖）。 */
function tempChartSvg(hours) {
	if (hours.length < 2) return "";
	const W = 320;
	const H = 64;
	const PAD = 12;
	const temps = hours.map((hour) => hour.temp);
	const min = Math.min(...temps);
	const span = Math.max(...temps) - min || 1;
	const xs = hours.map((_, index) => PAD + index * (296 / Math.max(1, hours.length - 1)));
	const ys = temps.map((temp) => 48 - (temp - min) / span * 32);
	const points = xs.map((x, index) => `${x.toFixed(1)},${ys[index].toFixed(1)}`).join(" ");
	const dots = xs.map((x, index) => `<circle class="qw-cv-dot" cx="${x.toFixed(1)}" cy="${ys[index].toFixed(1)}" r="2.6" stroke-width="1.4"/>`).join("");
	const labels = xs.map((x, index) => `<text class="qw-cv-label" x="${x.toFixed(1)}" y="${(ys[index] - 8).toFixed(1)}" text-anchor="middle">${round1(temps[index])}°</text>`).join("");
	return `<svg class="qw-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="气温曲线"><path class="qw-cv-area" d="M${xs[0].toFixed(1)},${H} L${points} L${xs[xs.length - 1].toFixed(1)},${H} Z"/>\n<polyline class="qw-cv-line" points="${points}"/>\n${dots}\n${labels}</svg>`;
}
/** 组装一张完整的天气卡片 fragment。 */
function buildCardFragment(bundle, hourCount = 5) {
	const hours = (bundle.hours ?? []).slice(0, Math.max(1, Math.min(24, hourCount)));
	const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 6);
	const now = bundle.now;
	const parts = [];
	parts.push("<div class=\"qw\">");
	parts.push("<div class=\"qw-head\">");
	parts.push(`<span class="qw-place">${escapeHtml(placeLabel(bundle.place))}</span>`);
	parts.push(`<span class="qw-updated">更新于 ${escapeHtml(hourLabel(bundle.receivedAt))}</span>`);
	parts.push("</div>");
	if (now !== void 0) {
		parts.push("<div class=\"qw-now\">");
		parts.push(`<span style="color:var(--qw-accent,#3b74f5)">${weatherIcon(now.icon, 44)}</span>`);
		parts.push("<span>");
		parts.push(`<span class="qw-now-temp">${escapeHtml(round1(now.temp))}°</span> `);
		parts.push(`<span class="qw-now-text">${escapeHtml(now.text || "")}</span>`);
		parts.push("</span>");
		const meta = [];
		if (now.feelsLike !== void 0) meta.push(`体感 ${escapeHtml(round1(now.feelsLike))}°`);
		if (now.humidity !== void 0) meta.push(`湿度 ${now.humidity}%`);
		if (now.windDir !== void 0 || now.windScale !== void 0) meta.push(`风 ${escapeHtml(now.windDir ?? "")} ${now.windScale ?? ""}级`.trim());
		if (meta.length > 0) parts.push(`<span class="qw-now-meta">${meta.map((text) => `<span>${text}</span>`).join("")}</span>`);
		parts.push("</div>");
	}
	if (hours.length > 0) {
		parts.push(`<div><div class="qw-sec-title">未来 ${hours.length} 小时</div>`);
		parts.push("<div class=\"qw-hours\">");
		for (const hour of hours) {
			parts.push("<div class=\"qw-hr\">");
			parts.push(`<span class="qw-hr-time">${escapeHtml(hourLabel(hour.time))}</span>`);
			parts.push(`<span style="color:var(--qw-accent,#3b74f5)">${weatherIcon(hour.icon, 22)}</span>`);
			parts.push(`<span class="qw-hr-pop">${escapeHtml(percent(hour.pop))}</span>`);
			parts.push(`<span class="qw-hr-text" title="${escapeHtml(hour.text || "")}">${escapeHtml(hour.text || "")}</span>`);
			parts.push(`<span class="qw-hr-temp">${escapeHtml(round1(hour.temp))}°</span>`);
			parts.push("</div>");
		}
		parts.push("</div>");
		parts.push(`<div style="margin-top:6px">${tempChartSvg(hours)}</div>`);
		parts.push("</div>");
	}
	parts.push("<div>");
	parts.push(`<div class="qw-sec-title">重要预警${alerts.length > 0 ? `（${alerts.length}）` : ""}</div>`);
	if (alerts.length === 0) parts.push("<div class=\"qw-empty\">当前无黄色及以上预警</div>");
	else for (const alert of alerts) {
		parts.push(`<div class="qw-alert" style="--qw-alert-color:${warningColor(alert)}">`);
		parts.push(`<div class="qw-alert-head">${escapeHtml(alert.headline)}</div>`);
		if (alert.text !== void 0 && alert.text.length > 0) parts.push(`<div class="qw-alert-body">${escapeHtml(alert.text.trim())}</div>`);
		parts.push("</div>");
	}
	parts.push("</div>");
	parts.push("<div class=\"qw-foot\">");
	parts.push("<span>数据来源：和风天气</span>");
	parts.push(`<a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">QWeather.com</a>`);
	parts.push("</div>");
	parts.push("</div>");
	return parts.join("\n");
}
/** 卡片字节数（工具结果里向模型报告）。 */
function byteLength(text) {
	return new TextEncoder().encode(text).length;
}
//#endregion
//#region src/tools.ts
/** 用当前配置构造 API 客户端；主开关关闭 / 未配置密钥时给出明确指引。 */
function clientFrom(config, signal) {
	if (!config.enabled) throw new Error("和风天气插件已在设置中被关闭：请到 设置 → 插件 → 和风天气 打开总开关");
	const apiKey = config.apiKey?.trim() ?? "";
	if (apiKey.length === 0) throw new Error("尚未配置和风天气 API KEY：请到 设置 → 插件 → 和风天气 填写密钥");
	return new QWeatherClient({
		apiHost: config.apiHost,
		apiKey,
		signal
	});
}
/** 解析目标位置：工具参数优先，其次设置里的默认位置。 */
function targetOf(locationArg, config) {
	const target = locationArg?.trim() || config.location?.trim() || "";
	if (target.length === 0) throw new Error("未指定位置：请传入 location 参数，或到设置里配置默认位置");
	return target;
}
/** 归一化 hours / days 参数（超出范围取边界，非法取默认）。 */
function boundedInteger(value, min, max, fallback) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, Math.round(n)));
}
/** 按 range 与 fields 拉取一份天气数据包。 */
async function fetchBundle(client, place, range, rangeHours, rangeDays, fields) {
	const bundle = {
		place,
		receivedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	if (range === "now") bundle.now = await client.current(place.lat, place.lon);
	if (range === "hours") bundle.hours = await client.hourly(place.lat, place.lon, rangeHours);
	if (range === "days") bundle.days = await client.daily(place.lat, place.lon, rangeDays);
	if (fields.has("warnings")) bundle.alerts = await client.alerts(place.lat, place.lon);
	if (fields.has("air")) bundle.air = await client.air(place.lat, place.lon);
	return bundle;
}
/**
* 子功能 2：qweather_weather —— 给 LLM 用的天气查询接口。
* LLM 回答用户天气问题时调用：自动按 range/fields 选择对应 API。
*/
function weatherTool(ctx, getConfig) {
	return defineTool({
		name: WEATHER_TOOL_NAME,
		description: "查询和风天气（QWeather）的实时或预报数据，回答用户关于天气的问题。 location 可缺省（默认用设置里配置的位置；支持城市/区县名称、LocationID、或“经度,纬度”）。 range 选择时间区间：now=实时天气，hours=逐小时预报（配合 hours，1-240 小时，默认 5），days=逐日预报（配合 days，1-10 天，默认 3）。 fields 选择关心的信息，逗号分隔：condition=天气现象, temp=气温, humidity=湿度, wind=风, precipitation=降水, air=空气质量, warnings=预警, astro=日出日落；all=全部，缺省 summary。 结果包含数据时间。如果用户想“看图 / 画一张天气卡片”，改用 qweather_card。",
		parameters: {
			location: {
				type: "string",
				description: "要查询的地理位置。可缺省（使用设置里的默认位置）。支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。"
			},
			range: {
				type: "string",
				enum: [
					"now",
					"hours",
					"days"
				],
				description: "希望得到的天气预测时间区间：now=实时，hours=逐小时，days=逐日。默认 now。"
			},
			hours: {
				type: "integer",
				description: "range=hours 时的小时数，1-240，默认 5。"
			},
			days: {
				type: "integer",
				description: "range=days 时的天数，1-10，默认 3。"
			},
			fields: {
				type: "string",
				description: "期望获得的天气信息，逗号分隔：condition, temp, humidity, wind, precipitation, air, warnings, astro；all=全部；缺省 summary。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					location: {
						type: "string",
						required: true
					},
					range: {
						type: "string",
						required: true,
						enum: [
							"now",
							"hours",
							"days"
						]
					},
					summary: {
						type: "string",
						required: true
					},
					data: {
						type: "object",
						required: true,
						additionalProperties: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.summary
			}]
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const config = getConfig();
			const client = clientFrom(config, exec.signal);
			const place = await client.resolvePlace(targetOf(args.location, config));
			const range = args.range ?? "now";
			const fields = parseFields(args.fields);
			const bundle = await fetchBundle(client, place, range, boundedInteger(args.hours, 1, 240, 5), boundedInteger(args.days, 1, 10, 3), fields);
			const summary = buildWeatherText(bundle, range, fields);
			return {
				location: placeLabel(place),
				range,
				summary,
				data: JSON.parse(JSON.stringify(bundle))
			};
		},
		presentCall: () => ({
			card: "generic",
			title: "天气",
			kind: "other"
		}),
		presentResult(args, result) {
			if (result.isError) return void 0;
			const location = args.location;
			return {
				card: "generic",
				title: typeof location === "string" && location.length > 0 ? "天气 · " + location : "天气"
			};
		}
	});
}
/**
* 子功能 3：qweather_card —— 把天气数据画成对话内交互式 HTML 卡片。
* 卡片 HTML 由插件生成（而非模型手写），保证结构正确、可回放。
*/
function cardTool(ctx, getConfig) {
	return defineTool({
		name: CARD_TOOL_NAME,
		description: "在对话中渲染一张交互式天气卡片（HTML），方便用户浏览阅读。 location 可缺省（默认用设置里配置的位置；支持城市/区县名称、LocationID、或“经度,纬度”）。 hours 为卡片显示的逐小时预报条数（1-24，默认 5）。 卡片包含：当前天气（图标+文字+气温）、未来 N 小时天气/降水概率/气温曲线、黄色及以上重要预警、信息更新时间。 数据实时取自和风天气，用户在对话中直接看到卡片。适合用户要求“画出来 / 展示天气卡片”的场景；纯数据问答用 qweather_weather。",
		parameters: {
			location: {
				type: "string",
				description: "要查询的地理位置。可缺省（使用设置里的默认位置）。支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。"
			},
			hours: {
				type: "integer",
				description: "卡片上显示的逐小时预报条数，1-24，默认 5。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					title: {
						type: "string",
						required: true
					},
					location: {
						type: "string",
						required: true
					},
					updateTime: {
						type: "string",
						required: true
					},
					sizeBytes: {
						type: "integer",
						required: true
					},
					fragment: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: "已渲染「" + value.title + "」天气卡片（" + value.sizeBytes + " 字节）。用户已在对话中看到卡片，无需复述全部数据，直接结合卡片回答用户问题即可。"
			}],
			presentationMeta: (_args, value) => ({
				kind: CARD_META_KIND,
				fragment: value.fragment,
				title: value.title,
				location: value.location,
				updateTime: value.updateTime
			})
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const config = getConfig();
			const client = clientFrom(config, exec.signal);
			const place = await client.resolvePlace(targetOf(args.location, config));
			const hourCount = boundedInteger(args.hours, 1, 24, 5);
			const [now, hours, alerts] = await Promise.all([
				client.current(place.lat, place.lon),
				client.hourly(place.lat, place.lon, hourCount),
				client.alerts(place.lat, place.lon)
			]);
			const bundle = {
				place,
				receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
				now,
				hours,
				alerts
			};
			const location = placeLabel(place);
			const fragment = buildCardFragment(bundle, hourCount);
			return {
				title: location + " 天气",
				location,
				updateTime: bundle.receivedAt,
				sizeBytes: byteLength(fragment),
				fragment
			};
		},
		presentCall: () => ({
			card: "generic",
			title: "天气卡片",
			kind: "other"
		}),
		presentResult(_args, result) {
			if (result.isError) return void 0;
			const meta = qweatherCardMetaFrom(result.meta);
			if (meta === void 0) return void 0;
			return {
				card: "generic",
				title: "天气 · " + meta.location
			};
		}
	});
}
//#endregion
//#region src/skill.ts
/**
* 内置 qweather 技能：教模型何时用 qweather_weather / qweather_card，
* 形状对齐官方 dsh-skill-badge 的内置技能 provider（bundled candidate）。
*/
const PROVIDER_NAME = "dsh-qweather";
const SKILL_BODY_URL = new URL("../assets/qweather-skill.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../assets/", import.meta.url))
};
const CANDIDATE = {
	name: "qweather",
	description: "和风天气插件使用说明：qweather_weather（查天气数据回答问题）与 qweather_card（把天气画成对话内卡片）的参数、时间区间与信息类别。",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	resourceBase: RESOURCE_BASE,
	rank: BUNDLED_SKILL_RANK,
	locator: SKILL_BODY_URL
};
/** 注册到 ctx.skills 的 provider。 */
const qweatherSkillProvider = {
	name: PROVIDER_NAME,
	list: () => Promise.resolve([CANDIDATE]),
	async get(_candidate) {
		return {
			name: CANDIDATE.name,
			description: CANDIDATE.description,
			invocation: CANDIDATE.invocation,
			provider: CANDIDATE.provider,
			source: CANDIDATE.source,
			resourceBase: RESOURCE_BASE,
			content: await readFile(SKILL_BODY_URL, "utf8")
		};
	}
};
//#endregion
//#region src/index.ts
/** Cordis 插件名。 */
const name = "dsh-qweather";
/** 依赖服务：工具注册表、技能注册表（设置命名空间在 apply 内按需注入）。 */
const inject = ["tools", "skills"];
/** 设置命名空间（客户端设置卡片用同一命名空间读写）。 */
const QWEATHER_NS = settingsNamespace("qweather");
/** Schemastery 校验的配置 schema（Loader 用它合并默认值）。 */
const Config = z.object({
	enabled: z.boolean().default(true),
	apiHost: z.string().default("https://devapi.qweather.com"),
	apiKey: z.string().default(""),
	projectId: z.string().default(""),
	locationMode: z.union([z.const("auto"), z.const("manual")]).default("auto"),
	location: z.string().default("北京"),
	autoLocationId: z.string().default(""),
	autoLocationName: z.string().default("")
});
/**
* 注册设置命名空间与两个工具。
* 设置可能不存在（极简部署），installSettingsSection 会自动降级为只读静态配置。
*/
function apply(ctx, config) {
	let current = () => config;
	installSettingsSection(ctx, QWEATHER_NS, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {}
	});
	ctx.tools.register(weatherTool(ctx, () => current()));
	ctx.tools.register(cardTool(ctx, () => current()));
	ctx.skills.registerProvider(() => qweatherSkillProvider);
}
//#endregion
export { CARD_META_KIND, CARD_TOOL_NAME, Config, DEFAULT_API_HOST, QWEATHER_NS, QWeatherApiError, QWeatherClient, WEATHER_TOOL_NAME, apply, buildCardFragment, buildWeatherText, byteLength, cardTool, dayLabel, formatUpdateTime, hourLabel, iconKindOf, inject, isYellowOrAbove, localDateTime, name, parseFields, percent, placeLabel, qweatherCardMetaFrom, round1, tempChartSvg, warningColor, weatherIcon, weatherTool };
