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
/** 渐变主色板（两主题通用）。 */
const PALETTE = {
	sun: ["#ffd08a", "#f97316"],
	moon: ["#b9c7ff", "#6f86f5"],
	partly: ["#ffffff", "#c7d6ea"],
	"partly-night": ["#ffffff", "#c7d6ea"],
	cloudy: ["#ffffff", "#c7d6ea"],
	rain: ["#ffffff", "#c7d6ea"],
	"heavy-rain": ["#ffffff", "#c7d6ea"],
	thunder: ["#ffffff", "#c7d6ea"],
	sleet: ["#ffffff", "#c7d6ea"],
	snow: ["#ffffff", "#c7d6ea"],
	fog: ["#f4f8fd", "#b9c9e0"],
	haze: ["#dbe4f0", "#9fb0c7"],
	dust: ["#f3d9a4", "#d9a45b"],
	sandstorm: ["#f0b46a", "#c77b32"],
	hot: ["#ffb35c", "#ef5f2b"],
	cold: ["#a5d8ff", "#38bdf8"],
	unknown: ["#ffffff", "#c7d6ea"]
};
/** 水/闪电渐变。 */
const WATER_A = "#8fd9ff";
const WATER_B = "#0284c7";
const BOLT_A = "#ffe082";
const BOLT_B = "#fb923c";
const SUN_A = "#ffd08a";
const SUN_B = "#f97316";
const MOON_A = "#b9c7ff";
const MOON_B = "#6f86f5";
/** 雪花灰（与白色云体区分）。 */
const SNOW_GRAY = "#b7c6da";
const SNOW_GRAY_LIGHT = "#dbe6f2";
/** 生成一条纵向渐变（id 用 uid 隔离）。 */
function grad(uid, a, b) {
	return `<defs><linearGradient id="qw-ic-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs>`;
}
const U = (uid) => `url(#qw-ic-${uid})`;
/**
* 以 (cx,cy) 为中心、scale s 的缩放变换：先平移回原点、缩放、再平移到目标中心。
*/
function centered(cx, cy, s) {
	return `translate(${cx},${cy}) scale(${s}) translate(-12,-12)`;
}
/** 云体轮廓：三个圆 + 圆角底边（基准 y 约 12.5-18.8）。 */
function cloudShapes(uid, color) {
	const f = color.startsWith("url") ? color : color;
	return `<circle cx="9" cy="14.8" r="3.5" fill="${f}"/><circle cx="13.4" cy="12.4" r="4.3" fill="${f}"/><circle cx="17.8" cy="15.2" r="3" fill="${f}"/><rect x="6.9" y="14.2" width="13.6" height="4.6" rx="2.3" fill="${f}"/>`;
}
/** 云底阴影。 */
function cloudShade() {
	return "<rect x=\"6.9\" y=\"16\" width=\"13.6\" height=\"2.8\" rx=\"1.4\" fill=\"#7d95b8\" opacity=\".28\"/>";
}
/** 雨滴（泪滴形 + 高光），围绕 (cx,cy) 居中。 */
function drop(cx, cy, s, color) {
	return `<g transform="${centered(cx, cy, s)}"><path d="M12.4 12.2c0 2.5 1.5 4.1 3 4.1s3-1.6 3-4.1c0-2.2-3-4.7-3-4.7s-3 2.5-3 4.7z" fill="` + color + `"/></g><circle cx="${cx - .6 * s}" cy="${cy + .1 * s}" r="${.6 * s}" fill="#ffffff" opacity=".75"/>`;
}
/** 雪花（三条圆头短线 + 中心点），颜色可指定。 */
function flake(cx, cy, s, color) {
	return `<g transform="${centered(cx, cy, s)}" stroke="${color}" stroke-width="2.1" stroke-linecap="round"><path d="M12 7.4v9.2M8 9.6l8 4.8M16 9.6l-8 4.8"/></g><circle cx="${cx}" cy="${cy}" r="${1 * s}" fill="${color}"/>`;
}
/** 太阳本体 + 光芒（fill/line 双色渐变）。 */
function sun(uid, cx, cy, s, rays) {
	const c = U(uid);
	return (rays ? `<g transform="${centered(cx, cy, s)}" stroke="${c}" stroke-width="2.3" stroke-linecap="round"><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></g>` : "") + `<circle cx="${cx}" cy="${cy}" r="${4.5 * s}" fill="${c}"/><circle cx="${cx - 1.2 * s}" cy="${cy - 1.2 * s}" r="${1.8 * s}" fill="#ffffff" opacity=".4"/>`;
}
/** 月牙 + 星光：紧凑居中（包围盒约 x4-19 / y4-20），小尺寸下不挤压文字。 */
function moon(uid, cx, cy, s) {
	const c = U(uid);
	return `<path transform="${centered(cx, cy, s)}" d="M19.2 12.2A7.6 7.6 0 1 1 11.8 3.9a6.3 6.3 0 0 0 7.4 8.3z" fill="${c}"/><circle cx="${cx - 2.6 * s}" cy="${cy - 4.2 * s}" r="${.9 * s}" fill="#ffffff" opacity=".85"/><circle cx="${cx - .8 * s}" cy="${cy - 1.4 * s}" r="${.55 * s}" fill="#ffffff" opacity=".6"/>`;
}
/** 温度计（热=橙红渐变，冷=冰蓝渐变）。 */
function thermometer(uid) {
	return `<path d="M12 4a2.2 2.2 0 0 0-2.2 2.2v6.9a3.8 3.8 0 1 0 4.4 0V6.2A2.2 2.2 0 0 0 12 4z" fill="${U(uid)}"/><circle cx="12" cy="16.9" r="1.7" fill="#ffffff" opacity=".55"/><circle cx="12" cy="4.6" r="0.9" fill="#ffffff" opacity=".5"/>`;
}
/** 投影层：同几何的深色副本向下偏移，制造“浮起”。 */
function shadow(inner) {
	return inner.replaceAll("fill=\"url(#qw-ic-", "fill=\"#0b1220\" data-u=\"").replaceAll("stroke=\"url(#qw-ic-", "stroke=\"#0b1220\" data-u=\"");
}
/** 组装成最终 svg。 */
function weatherIcon(code, size = 24, uid = "ic") {
	const kind = iconKindOf(code);
	const [a, b] = PALETTE[kind];
	const body = BODIES[kind]?.(uid, a, b) ?? BODIES["unknown"](uid, a, b);
	const shadowLayer = body.includes("data-u") ? body : `<g transform="translate(0,1.35)" opacity=".20">${shadow(body)}</g>`;
	return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` + grad(uid, a, b) + shadowLayer + body + "</svg>";
}
/** 各图标的主体绘制（uid=渐变隔离, a/b=云/雾类渐变两端）。 */
const BODIES = {
	sun: (uid) => sun(uid, 12, 12, 1, true),
	moon: (uid) => moon(uid, 12, 12, 1),
	partly: (uid) => {
		const c = U(uid);
		return grad("pw" + uid, SUN_A, SUN_B) + sun("pw" + uid, 15.2, 7.8, .68, true) + `<g transform="translate(-0.6,0.6)">${cloudShapes(uid, c)}${cloudShade()}</g><circle cx="12.6" cy="11" r="1.4" fill="#ffffff" opacity=".65"/>`;
	},
	"partly-night": (uid) => {
		const c = U(uid);
		return grad("mn" + uid, MOON_A, MOON_B) + moon("mn" + uid, 15.6, 7.6, .66) + `<g transform="translate(-0.6,0.6)">${cloudShapes(uid, c)}${cloudShade()}</g><circle cx="12.6" cy="11" r="1.4" fill="#ffffff" opacity=".65"/>`;
	},
	cloudy: (uid) => {
		const c = U(uid);
		return `<g transform="translate(2.2,-2.4) scale(0.82)" opacity=".85">${cloudShapes(uid, c)}</g>` + cloudShapes(uid, c) + cloudShade() + "<circle cx=\"12.6\" cy=\"11.2\" r=\"1.5\" fill=\"#ffffff\" opacity=\".7\"/>";
	},
	rain: (uid) => {
		const c = U(uid);
		const w = `url(#qw-ic-${uid}-w)`;
		return `<g transform="translate(0,-1.8)">${cloudShapes(uid, c)}${cloudShade()}</g><defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>` + drop(9.8, 20.2, .7, w) + drop(14.8, 20.2, .7, w);
	},
	"heavy-rain": (uid) => {
		const c = U(uid);
		const w = `url(#qw-ic-${uid}-w)`;
		return `<g transform="translate(0,-2)">${cloudShapes(uid, c)}${cloudShade()}</g><defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>` + drop(8, 20.4, .66, w) + drop(12.4, 20.4, .66, w) + drop(16.8, 20.4, .66, w);
	},
	thunder: (uid) => {
		const c = U(uid);
		const bolt = `url(#qw-ic-${uid}-bolt)`;
		return `<g transform="translate(0,-1.6)">${cloudShapes(uid, c)}${cloudShade()}</g><defs><linearGradient id="qw-ic-${uid}-bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${BOLT_A}"/><stop offset="100%" style="stop-color:${BOLT_B}"/></linearGradient></defs><path d="M13.6 12.8l3.6-4.4h-2.4l1-3.2-3.9 4.6h2.5z" fill="${bolt}" stroke="${bolt}" stroke-width="1.2" stroke-linejoin="round"/><path d="M13.9 9.6l1.2-1.4" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".8"/>`;
	},
	sleet: (uid) => {
		const c = U(uid);
		const w = `url(#qw-ic-${uid}-w)`;
		return `<g transform="translate(0,-1.8)">${cloudShapes(uid, c)}${cloudShade()}</g><defs><linearGradient id="qw-ic-${uid}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${WATER_A}"/><stop offset="100%" style="stop-color:${WATER_B}"/></linearGradient></defs>` + drop(9.6, 20.4, .62, w) + flake(15.2, 20.6, .52, SNOW_GRAY);
	},
	snow: (uid) => {
		return `<g transform="translate(0,-2)">${cloudShapes(uid, U(uid))}${cloudShade()}</g>` + flake(8.2, 20.6, .52, SNOW_GRAY) + flake(12.4, 20.9, .52, SNOW_GRAY_LIGHT) + flake(16.6, 20.6, .52, SNOW_GRAY);
	},
	fog: (uid, a, b) => {
		const c = U(uid);
		const l = `url(#qw-ic-${uid}-f)`;
		return `<g transform="translate(0,-1.6)">${cloudShapes(uid, c)}${cloudShade()}</g><defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs><g stroke="${l}" stroke-width="2.2" stroke-linecap="round"><path d="M6 17h12M8 19.8h8"/></g>`;
	},
	haze: (uid, a, b) => {
		const l = `url(#qw-ic-${uid}-f)`;
		return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs><g stroke="${l}" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 8.5h15M6.5 12.5h11M4.5 16.5h15"/></g><circle cx="16.8" cy="5.8" r="1" fill="${l}" opacity=".75"/><circle cx="9.5" cy="20" r="0.9" fill="${l}" opacity=".75"/>`;
	},
	dust: (uid, a, b) => {
		const l = `url(#qw-ic-${uid}-f)`;
		return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs><g fill="${l}"><circle cx="6.5" cy="7.5" r="1.2"/><circle cx="10.8" cy="5.4" r="1"/><circle cx="15.2" cy="7" r="1.25"/><circle cx="8.4" cy="11.6" r="1"/><circle cx="12.8" cy="10.2" r="1.1"/><circle cx="17" cy="12.4" r="1.15"/><circle cx="6.8" cy="15.6" r="1"/><circle cx="11.2" cy="17.4" r="1.2"/><circle cx="15.6" cy="15.8" r="1.05"/><circle cx="18.8" cy="18.4" r=".9"/></g><g stroke="${l}" stroke-width="1.8" stroke-linecap="round" opacity=".85"><path d="M5 20.4l3-1.8M15.5 21.2l3.5-2"/></g>`;
	},
	sandstorm: (uid, a, b) => {
		const l = `url(#qw-ic-${uid}-f)`;
		return `<defs><linearGradient id="qw-ic-${uid}-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" style="stop-color:${a}"/><stop offset="100%" style="stop-color:${b}"/></linearGradient></defs><g stroke="${l}" stroke-width="2.6" stroke-linecap="round"><path d="M4.5 8l15 5.4M4.5 12.6l15 5.4M4.5 17.2l15 5.4"/></g><g fill="${l}" opacity=".85"><circle cx="7.8" cy="5.4" r="1"/><circle cx="12.6" cy="3.8" r="1.15"/><circle cx="17.2" cy="6" r=".95"/></g>`;
	},
	hot: (uid) => thermometer(uid) + "<circle cx=\"18\" cy=\"5\" r=\"1\" fill=\"#ffffff\" opacity=\".65\"/>",
	cold: (uid) => thermometer(uid) + flake(18.4, 4.8, .42, SNOW_GRAY_LIGHT),
	unknown: (uid) => {
		return cloudShapes(uid, U(uid)) + cloudShade() + "<circle cx=\"12.2\" cy=\"11.2\" r=\"1.4\" fill=\"#ffffff\" opacity=\".7\"/>";
	}
};
/**
* condition code → 图标归类。
* 100=晴、15x=夜间、30x/35x=雨、302-304=雷、40x=雪、404-406/456=雨夹雪、
* 500-501/509-515=雾、502/511-513=霾、503-504=扬沙/浮尘、507-508=沙尘暴、
* 900=热、901=冷。
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
	if (n === 502 || n === 511 || n === 512 || n === 513) return "haze";
	if (n === 503 || n === 504) return "dust";
	if (n === 507 || n === 508) return "sandstorm";
	if (n >= 500 && n < 600) return "fog";
	if (n === 900) return "hot";
	if (n === 901) return "cold";
	return "unknown";
}
//#endregion
//#region src/qweather/card.ts
/** 卡片样式表（fragment 必须内联带上，否则 SVG 落入默认黑色填充）。 */
const CARD_CSS = `
.qw,.qw *{box-sizing:border-box}
.qw{font:13px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  --f:light-dark(#3a4a61,#e8eefb);
  --m:light-dark(#64748b,#9fb0c7);
  --s:light-dark(#8fa0b5,#5f7089);
  --sky:light-dark(#38bdf8,#4c8dff);
  --sky-deep:light-dark(#0284c7,#2f6bff);
  --orange:light-dark(#f97316,#fb923c);
  --pop:light-dark(#0ea5e9,#56bad9);
  --glass-a:light-dark(rgba(255,255,255,.88),rgba(40,55,84,.86));
  --glass-b:light-dark(rgba(255,255,255,.55),rgba(17,26,44,.78));
  --cell-a:light-dark(rgba(255,255,255,.85),rgba(46,60,90,.80));
  --cell-b:light-dark(rgba(233,239,247,.75),rgba(20,30,50,.72));
  --bd:light-dark(rgba(255,255,255,.75),rgba(255,255,255,.10));
  --sh-dark:light-dark(rgba(148,163,184,.42),rgba(0,0,0,.6));
  --sh-light:light-dark(rgba(255,255,255,.95),rgba(96,116,150,.16));
  color:var(--f)}
/* 卡片主体：纯玻璃渐变（无蓝橙内部渐变）；主题色放在卡片外部的对角光效阴影上——
   左上偏天蓝、右下偏橙，内部仍保持白高光 + 黑投影的新拟态光影。 */
.qw-card{position:relative;display:flex;flex-direction:column;gap:12px;border-radius:18px;padding:16px 18px 14px;border:1px solid var(--bd);
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b));
  backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15);
  box-shadow:
    -18px -16px 38px light-dark(rgba(56,189,248,.32),rgba(76,141,255,.20)),
    18px 16px 38px light-dark(rgba(249,115,22,.22),rgba(251,146,60,.13)),
    0 14px 34px light-dark(rgba(100,116,139,.22),rgba(0,0,0,.45)),
    10px 10px 24px var(--sh-dark),-10px -10px 24px var(--sh-light),
    inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.08))}
.qw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.qw-loc{font-size:14px;font-weight:800;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-updated{flex:none;font-size:11px;color:var(--m);font-variant-numeric:tabular-nums}
.qw-now{display:flex;align-items:center;gap:12px}
.qw-now-icon{flex:none;display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:16px;
  background:linear-gradient(145deg,light-dark(#e0f4ff,#1c2e4e),light-dark(#bfe4ff,#0e1a30));
  box-shadow:5px 5px 12px var(--sh-dark),-4px -4px 10px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09))}
.qw-now-main{display:flex;flex-direction:column;line-height:1.08}
.qw-now-temp{display:flex;align-items:flex-start;gap:1px}
.qw-now-temp .n{font-size:31px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.qw-now-temp .deg{font-size:14px;font-weight:800;color:var(--orange);margin-top:2.5px}
.qw-now-text{font-size:12px;color:var(--m)}
.qw-now-meta{margin-left:auto;display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:4px;font-size:11px;text-align:right}
.qw-now-meta .k{color:var(--s)}
.qw-now-meta .v{color:var(--f);font-weight:700;font-variant-numeric:tabular-nums}
.qw-sec-title{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--m)}
.qw-sec-title::before{content:'';flex:none;width:4px;height:13px;border-radius:2px;background:linear-gradient(180deg,var(--sky),var(--orange));box-shadow:0 1px 4px light-dark(rgba(148,163,184,.45),rgba(0,0,0,.45))}
.qw-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 6px;border-radius:10px;color:var(--orange);font-size:10.5px;font-weight:800;font-variant-numeric:tabular-nums;
  background:linear-gradient(150deg,color-mix(in srgb,var(--bc,#f97316) 16%,transparent),transparent 70%);
  border:1px solid color-mix(in srgb,var(--bc,#f97316) 35%,transparent);
  box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.7),rgba(255,255,255,.08))}
.qw-hours{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.qw-hr{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 8px;border-radius:13px;border:1px solid var(--bd);
  background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:inset 2.5px 2.5px 6px var(--sh-dark),inset -2.5px -2.5px 6px var(--sh-light)}
.qw-hr-time{font-size:10px;color:var(--s);font-variant-numeric:tabular-nums}
.qw-hr-icon{display:flex;align-items:center;justify-content:center;height:26px}
.qw-hr-pop{font-size:10px;color:var(--pop);font-weight:600;font-variant-numeric:tabular-nums}
.qw-hr-text{font-size:10.5px;color:var(--m);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qw-chart{position:relative;height:92px;margin-top:12px}
.qw-chart-svg{display:block;width:100%;height:92px}
.qw-chart-line{fill:none;stroke-width:3.8;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.qw-chart-shadow{fill:none;stroke-width:4.4;stroke-linecap:round;stroke-linejoin:round;opacity:.38;vector-effect:non-scaling-stroke}
.qw-chart-ridge{fill:none;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;opacity:.8;vector-effect:non-scaling-stroke}
.qw-chart-chip{position:absolute;transform:translate(-50%,-100%);font-size:10.5px;font-weight:700;color:var(--f);
  background:linear-gradient(150deg,var(--cell-a),var(--cell-b));border:1px solid var(--bd);border-radius:7px;padding:1px 6px;
  box-shadow:1px 2px 4px var(--sh-dark);font-variant-numeric:tabular-nums;white-space:nowrap}
.qw-alert{display:flex;flex-direction:column;gap:3px;padding:9px 12px;border-radius:12px;border:1px solid var(--bd);border-left:3px solid var(--alert-c,#f59e0b);
  background:linear-gradient(150deg,color-mix(in srgb,var(--alert-c,#f59e0b) 12%,transparent),transparent 60%);
  box-shadow:2px 3px 8px var(--sh-dark),inset 0 1px 0 light-dark(rgba(255,255,255,.75),rgba(255,255,255,.06))}
.qw-alert-head{font-size:12.5px;font-weight:700;color:var(--f)}
.qw-alert-body{font-size:11.5px;color:var(--m);line-height:1.55}
.qw-empty{font-size:12px;color:var(--s)}
.qw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px dashed var(--bd);font-size:11px;color:var(--s)}
.qw-foot a{color:var(--sky-deep);text-decoration:none;font-weight:700}
.qw-foot a:hover{color:var(--orange);text-decoration:underline}
`;
/** 取整到 0.1，减少路径体积。 */
function r1(n) {
	return Math.round(n * 10) / 10;
}
/** 折线点 → Catmull-Rom 平滑曲线路径。 */
function smoothPath(points) {
	if (points.length < 2) return "";
	let d = "M" + points[0][0] + "," + points[0][1];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2] ?? p2;
		const c1x = r1(p1[0] + (p2[0] - p0[0]) / 6);
		const c1y = r1(p1[1] + (p2[1] - p0[1]) / 6);
		const c2x = r1(p2[0] - (p3[0] - p1[0]) / 6);
		const c2y = r1(p2[1] - (p3[1] - p1[1]) / 6);
		d += " C" + c1x + "," + c1y + " " + c2x + "," + c2y + " " + p2[0] + "," + p2[1];
	}
	return d;
}
/** 图表几何：viewBox 400x92；描点 x 取 10/30/50/70/90%（与上方 5 列小时格中心对齐）。 */
const CHART_W = 400;
const CHART_H = 92;
const CHART_BOTTOM = 84;
/**
* 气温曲线（简洁单线，新拟态光影）：
* - 只有一条渐变曲线：颜色按温度纵向渐变——高处（高温）= 鲜艳橙，
*   低处（低温）= 浅天蓝（暗色微调）；
* - 光效仅两笔：下方黑色细投影 + 上方白色细高光脊（与新拟态 UI 一致），
*   不做彩色辉光、不加渐变面积、不加描点，保持曲线完整简洁；
* - 温度标签芯片（℃）按百分比绝对定位（HTML），任意卡片宽度下文字不变形，
*   x 与上方 5 列小时格中心对齐。
*/
function tempChartSvg(hours) {
	if (hours.length < 2) return "";
	const temps = hours.map((hour) => hour.temp);
	const min = Math.min(...temps);
	const span = Math.max(...temps) - min || 1;
	const points = hours.map((hour, index) => {
		return [r1(40 + index * 80), r1(CHART_BOTTOM - (hour.temp - min) / span * 50)];
	});
	const line = smoothPath(points);
	return `<div class="qw-chart">${`<svg class="qw-chart-svg" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="qw-chart-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="34" x2="0" y2="84"><stop offset="0%" style="stop-color:var(--orange)"/><stop offset="100%" style="stop-color:var(--sky)"/></linearGradient></defs><path class="qw-chart-shadow" d="${line}" transform="translate(0,1.5)" style="stroke:light-dark(rgba(0,0,0,.26),rgba(0,0,0,.55))"/><path class="qw-chart-line" d="${line}" stroke="url(#qw-chart-stroke)"/><path class="qw-chart-ridge" d="${line}" transform="translate(0,-1)" style="stroke:light-dark(rgba(255,255,255,.95),rgba(255,255,255,.22))"/></svg>`}${hours.map((hour, index) => {
		const [x, y] = points[index];
		return `<span class="qw-chart-chip" style="left:${10 + index * 20}%;top:calc(${r1(y / CHART_H * 100)}% - 7px)">${escapeHtml(round1(hour.temp))}℃</span>`;
	}).join("")}</div>`;
}
/** 组装一张完整的天气卡片 fragment。 */
function buildCardFragment(bundle, hourCount = 5) {
	const hours = (bundle.hours ?? []).slice(0, Math.max(1, Math.min(24, hourCount)));
	const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 6);
	const now = bundle.now;
	const parts = [];
	parts.push("<div class=\"qw\">");
	parts.push("<style>" + CARD_CSS + "</style>");
	parts.push("<div class=\"qw-card\">");
	parts.push("<div class=\"qw-head\">");
	parts.push(`<span class="qw-loc" title="${escapeHtml(placeLabel(bundle.place))}">${escapeHtml(placeLabel(bundle.place))}</span>`);
	parts.push(`<span class="qw-updated">更新于 ${escapeHtml(hourLabel(bundle.receivedAt))}</span>`);
	parts.push("</div>");
	if (now !== void 0) {
		parts.push("<div class=\"qw-now\">");
		parts.push(`<span class="qw-now-icon">${weatherIcon(now.icon, 30, "now")}</span>`);
		parts.push("<div class=\"qw-now-main\">");
		parts.push(`<span class="qw-now-temp"><span class="n">${escapeHtml(round1(now.temp))}</span><span class="deg">℃</span></span>`);
		parts.push(`<span class="qw-now-text">${escapeHtml(now.text || "")}</span>`);
		parts.push("</div>");
		const meta = [];
		if (now.feelsLike !== void 0) meta.push(`<span class="k">体感</span><span class="v">${escapeHtml(round1(now.feelsLike))}℃</span>`);
		if (now.humidity !== void 0) meta.push(`<span class="k">湿度</span><span class="v">${now.humidity}%</span>`);
		if (now.windDir !== void 0 || now.windScale !== void 0) meta.push(`<span class="k">风</span><span class="v">${escapeHtml(now.windDir ?? "")}${now.windScale !== void 0 ? " " + now.windScale + "级" : ""}</span>`);
		if (meta.length > 0) parts.push(`<div class="qw-now-meta">${meta.join("")}</div>`);
		parts.push("</div>");
	}
	if (hours.length > 0) {
		parts.push("<div>");
		parts.push(`<div class="qw-sec-title">未来 ${hours.length} 小时</div>`);
		parts.push("<div class=\"qw-hours\">");
		hours.forEach((hour, index) => {
			parts.push("<div class=\"qw-hr\">");
			parts.push(`<span class="qw-hr-time">${escapeHtml(hourLabel(hour.time))}</span>`);
			parts.push(`<span class="qw-hr-icon">${weatherIcon(hour.icon, 20, "h" + index)}</span>`);
			parts.push(`<span class="qw-hr-pop">${escapeHtml(percent(hour.pop))}</span>`);
			parts.push(`<span class="qw-hr-text" title="${escapeHtml(hour.text || "")}">${escapeHtml(hour.text || "")}</span>`);
			parts.push("</div>");
		});
		parts.push("</div>");
		parts.push(tempChartSvg(hours));
		parts.push("</div>");
	}
	parts.push("<div>");
	parts.push(`<div class="qw-sec-title">重要预警${alerts.length > 0 ? `<span class="qw-badge" style="--bc:${warningColor(alerts[0])};">${alerts.length}</span>` : ""}</div>`);
	if (alerts.length === 0) parts.push("<div class=\"qw-empty\">当前无黄色及以上预警</div>");
	else for (const alert of alerts) {
		parts.push(`<div class="qw-alert" style="--alert-c:${warningColor(alert)}">`);
		parts.push(`<div class="qw-alert-head">${escapeHtml(alert.headline)}</div>`);
		if (alert.text !== void 0 && alert.text.trim().length > 0) parts.push(`<div class="qw-alert-body">${escapeHtml(alert.text.trim())}</div>`);
		parts.push("</div>");
	}
	parts.push("</div>");
	parts.push("<div class=\"qw-foot\">");
	parts.push("<span>数据来源：和风天气</span>");
	parts.push(`<a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">QWeather.com ↗</a>`);
	parts.push("</div>");
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
