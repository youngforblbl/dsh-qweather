import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region src/qweather/errors.ts
/** 全部错误码的权威目录（新增错误码在此登记）。 */
const ERROR_CATALOG = {
	QW_DISABLED: {
		code: "QW_DISABLED",
		category: "config",
		retryable: false,
		hint: "到 设置 → 插件 → 和风天气 打开总开关"
	},
	QW_NO_API_KEY: {
		code: "QW_NO_API_KEY",
		category: "config",
		retryable: false,
		hint: "到 设置 → 插件 → 和风天气 填写 API KEY"
	},
	QW_NO_LOCATION: {
		code: "QW_NO_LOCATION",
		category: "input",
		retryable: false,
		hint: "传入 location 参数，或到设置里配置默认位置"
	},
	QW_LOCATION_NOT_FOUND: {
		code: "QW_LOCATION_NOT_FOUND",
		category: "input",
		retryable: false,
		hint: "改用更精确的名称（如“北京 海淀”）、LocationID 或「经度,纬度」"
	},
	QW_GEOCODE_UNAVAILABLE: {
		code: "QW_GEOCODE_UNAVAILABLE",
		category: "config",
		retryable: false,
		hint: "当前环境不支持浏览器定位，请改用手动位置"
	},
	QW_BAD_HOST: {
		code: "QW_BAD_HOST",
		category: "config",
		retryable: false,
		hint: "API Host 必须是 http(s) 开头的合法域名"
	},
	QW_NETWORK: {
		code: "QW_NETWORK",
		category: "network",
		retryable: true,
		hint: "检查网络连接，或稍后重试"
	},
	QW_TIMEOUT: {
		code: "QW_TIMEOUT",
		category: "network",
		retryable: true,
		hint: "请求超时，请稍后重试"
	},
	QW_CANCELLED: {
		code: "QW_CANCELLED",
		category: "network",
		retryable: false,
		hint: "请求已被取消"
	},
	QW_HTTP_ERROR: {
		code: "QW_HTTP_ERROR",
		category: "upstream",
		retryable: true,
		hint: "检查 API Host / KEY 是否正确，或稍后重试"
	},
	QW_UPSTREAM_ERROR: {
		code: "QW_UPSTREAM_ERROR",
		category: "upstream",
		retryable: false,
		hint: "和风天气 API 返回业务错误码，请核对请求参数"
	},
	QW_BAD_RESPONSE: {
		code: "QW_BAD_RESPONSE",
		category: "upstream",
		retryable: true,
		hint: "和风天气返回了无法解析的响应，请稍后重试"
	},
	QW_BAD_REQUEST: {
		code: "QW_BAD_REQUEST",
		category: "input",
		retryable: false,
		hint: "请求体不合法或超过大小限制"
	},
	QW_FORBIDDEN: {
		code: "QW_FORBIDDEN",
		category: "permission",
		retryable: false,
		hint: "跨源请求被拒绝"
	},
	QW_SETTINGS_UNAVAILABLE: {
		code: "QW_SETTINGS_UNAVAILABLE",
		category: "internal",
		retryable: false,
		hint: "设置服务不可用，无法保存配置"
	},
	QW_INTERNAL: {
		code: "QW_INTERNAL",
		category: "internal",
		retryable: false,
		hint: "插件内部错误，请查看日志"
	}
};
/** 插件统一错误基类：必带稳定错误码。 */
var QWeatherError = class extends Error {
	code;
	category;
	retryable;
	hint;
	cause;
	constructor(code, message, options = {}) {
		const info = ERROR_CATALOG[code];
		super(message ?? info.hint);
		this.name = "QWeatherError";
		this.code = code;
		this.category = info.category;
		this.retryable = options.retryable ?? info.retryable;
		this.hint = options.hint ?? info.hint;
		if (options.cause !== void 0) this.cause = options.cause;
	}
};
/** 携带 HTTP 状态码的 API 错误（network / upstream 类别）。 */
var QWeatherApiError = class extends QWeatherError {
	/** HTTP 状态码；0 表示非 HTTP 层失败（网络 / 超时 / 取消）。 */
	status;
	constructor(status, code, message, options) {
		super(code, message, options);
		this.name = "QWeatherApiError";
		this.status = status;
	}
};
/** 是否为插件统一错误。 */
function isQWeatherError(error) {
	return error instanceof QWeatherError;
}
/**
* 从任意值中提取错误码（跨 realm / 反序列化后的对象也可识别）。
* 无法识别时返回 'UNKNOWN'。
*/
function errorCodeOf(error) {
	if (error instanceof QWeatherError) return error.code;
	const code = error?.code;
	if (typeof code === "string" && code in ERROR_CATALOG) return code;
	return "UNKNOWN";
}
/** 把任意异常归一化成 QWeatherError（不改变已有 QWeatherError）。 */
function toQWeatherError(error) {
	if (error instanceof QWeatherError) return error;
	if (error instanceof Error) return new QWeatherError("QW_INTERNAL", error.message, { cause: error });
	return new QWeatherError("QW_INTERNAL", String(error));
}
//#endregion
//#region src/qweather/log.ts
const LEVEL_WEIGHT = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
	silent: 99
};
/** 命中即脱敏的键名（大小写不敏感）。 */
const SECRET_KEY = /(?:api[_-]?key|token|secret|password|credential|authorization)/iu;
/** 从环境变量解析默认级别（浏览器无 process 时静默回退 warn）。 */
function envLevel() {
	try {
		const raw = globalThis.process?.env?.QW_LOG_LEVEL;
		if (raw !== void 0 && raw in LEVEL_WEIGHT) return raw;
	} catch {}
	return "warn";
}
let globalLevel = envLevel();
/** 全局调整日志级别（如设置页 / 测试中调用）。 */
function setLogLevel(level) {
	globalLevel = level;
}
/** 读取当前全局日志级别。 */
function getLogLevel() {
	return globalLevel;
}
/**
* 递归脱敏：对象里命中 SECRET_KEY 的键值替换为 [redacted]。
* 只处理普通对象 / 数组 / 原始值，不追踪循环引用（超出深度直接截断）。
*/
function redact(value, depth = 0) {
	if (depth > 6) return "[max-depth]";
	if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
	if (value !== null && typeof value === "object") {
		const out = {};
		for (const [key, item] of Object.entries(value)) out[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
		return out;
	}
	return value;
}
/** 默认 console 槽（环境无 console 时退化为 no-op，保证模块永不抛错）。 */
const defaultSink = (() => {
	const consoleLike = globalThis.console;
	const pick = (name) => (message, extra) => {
		const fn = consoleLike?.[name];
		if (fn === void 0) return;
		if (extra === void 0) fn(message);
		else fn(message, extra);
	};
	return {
		debug: pick("debug"),
		info: pick("info"),
		warn: pick("warn"),
		error: pick("error")
	};
})();
function createLogger(namespace, options = {}) {
	const sink = options.sink ?? defaultSink;
	const write = (level, message, extra) => {
		const effective = options.level ?? globalLevel;
		if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[effective]) return;
		const prefixed = `[${namespace}] ${message}`;
		if (extra === void 0) sink[level](prefixed);
		else sink[level](prefixed, redact(extra));
	};
	return {
		namespace,
		debug: (m, e) => write("debug", m, e),
		info: (m, e) => write("info", m, e),
		warn: (m, e) => write("warn", m, e),
		error: (m, e) => write("error", m, e),
		child: (scope) => createLogger(`${namespace}:${scope}`, {
			level: options.level,
			sink
		})
	};
}
//#endregion
//#region src/qweather/api.ts
/**
* 和风天气 API 客户端（node 半端与浏览器半端共用）。
*
* 对接新版 Weather API v1（经纬度路径参数）与 GeoAPI v2：
*   GET {apiHost}/weather/v1/current/{lat}/{lng}         实时天气
*   GET {apiHost}/weather/v1/hourly/{lat}/{lng}?hours=   逐小时（1-240）
*   GET {apiHost}/weather/v1/daily/{lat}/{lng}?days=     逐日（1-10）
*   GET {apiHost}/weatheralert/v1/current/{lat}/{lng}    实时预警
*   GET {apiHost}/airquality/v1/current/{lat}/{lng}      实时空气质量
*   GET {apiHost}/geo/v2/city/lookup?location=…          城市搜索（名称 / ID / 经纬度）
* 认证：请求头 X-QW-Api-Key（用户密钥）。
*
* 兼容性说明：旧公共域名 devapi.qweather.com 不提供 /geo/v2 路径，
* 此时城市搜索自动回退到公共 GeoAPI 域名 geoapi.qweather.com/v2；
* 用户在控制台配置了专属 API Host（*.qweatherapi.com）后，所有请求
* 走同一域名，无需回退。
*
* 错误与日志：所有对外抛出的错误都携带稳定错误码（QWeatherError /
* QWeatherApiError），并通过注入的 logger（缺省 'qweather:api'）记录
* 请求耗时与失败原因，密钥不落日志。
*/
/** 默认 API Host（和风公共域名，逐步由专属 API Host 取代）。 */
const DEFAULT_API_HOST = "https://devapi.qweather.com";
/** 旧公共 GeoAPI 域名（仅作回退）。 */
const GEO_FALLBACK_HOST = "https://geoapi.qweather.com";
/** 去掉首尾空白与结尾斜杠，校验协议；缺省 / 非法时回退默认域名。 */
function normalizeApiHost(host) {
	let trimmed = (host ?? "").trim().replace(/\/+$/, "");
	if (trimmed.length === 0) return DEFAULT_API_HOST;
	if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)) trimmed = "https://" + trimmed;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_API_HOST;
		return trimmed;
	} catch {
		return DEFAULT_API_HOST;
	}
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
/** 安全读取取消类异常名（避免直接引用 DOMException，兼容旧运行时）。 */
function abortNameOf(cause) {
	if (cause === null || cause === void 0) return void 0;
	const name = cause.name;
	return name === "AbortError" || name === "TimeoutError" ? name : void 0;
}
/** 提取异常消息（跨 realm 安全）。 */
function errorMessage(cause) {
	if (cause instanceof Error) return cause.message;
	return String(cause);
}
/**
* 组合取消信号：外部 signal 与超时信号先到先触发。
* 不支持的运行环境退化为外部 signal（无超时）。
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
	timeoutMs;
	log;
	constructor(options) {
		this.apiHost = normalizeApiHost(options.apiHost);
		this.apiKey = options.apiKey.trim();
		this.fetchImpl = (options.fetchImpl ?? fetch).bind(globalThis);
		this.signal = options.signal;
		this.timeoutMs = options.timeoutMs ?? 15e3;
		this.log = options.logger ?? createLogger("qweather:api");
		if (this.apiHost === "https://devapi.qweather.com" && (options.apiHost ?? "").trim().length > 0 && normalizeApiHost(options.apiHost) === "https://devapi.qweather.com") this.log.warn("invalid apiHost, falling back to default", { apiHost: options.apiHost });
	}
	/** 发起一个 GET 请求并解析 JSON（自动处理 gzip、错误码与超时）。 */
	async request(path, params = {}, base, timeoutMs = this.timeoutMs) {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) query.set(key, String(value));
		const url = `${base ?? this.apiHost}${path}?${query.toString()}`;
		const startedAt = Date.now();
		this.log.debug("request", {
			method: "GET",
			url
		});
		let response;
		try {
			response = await this.fetchImpl(url, {
				headers: { "X-QW-Api-Key": this.apiKey },
				signal: withTimeout(this.signal, timeoutMs)
			});
		} catch (cause) {
			const abort = abortNameOf(cause);
			if (abort === "TimeoutError") throw new QWeatherApiError(0, "QW_TIMEOUT", "和风天气请求超时", { cause });
			if (abort === "AbortError") {
				const code = this.signal?.aborted ? "QW_CANCELLED" : "QW_TIMEOUT";
				throw new QWeatherApiError(0, code, code === "QW_CANCELLED" ? "和风天气请求已被取消" : "和风天气请求超时", { cause });
			}
			throw new QWeatherApiError(0, "QW_NETWORK", `网络错误：${errorMessage(cause)}`, { cause });
		}
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			const message = `和风天气 API 返回 HTTP ${response.status}${body ? `：${body.slice(0, 200)}` : ""}`;
			throw new QWeatherApiError(response.status, "QW_HTTP_ERROR", message);
		}
		let data;
		try {
			data = await response.json();
		} catch (cause) {
			throw new QWeatherApiError(response.status, "QW_BAD_RESPONSE", `和风天气 API 返回了无法解析的响应（HTTP ${response.status}）`, { cause });
		}
		if (typeof data?.code === "string" && data.code !== "200") throw new QWeatherApiError(Number(data.code) || 0, "QW_UPSTREAM_ERROR", `和风天气 API 返回错误码 ${data.code}`);
		this.log.debug("request ok", {
			url,
			status: response.status,
			ms: Date.now() - startedAt
		});
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
				this.log.debug("geo 404 on primary host, fallback to public GeoAPI", { host: this.apiHost });
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
			windScale: row?.wind?.scale,
			windDegree: row?.wind?.direction?.degree === void 0 ? void 0 : Number(row.wind.direction.degree)
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
			moonrise: row?.astro?.moonrise,
			moonset: row?.astro?.moonset,
			moonPhase: row?.astro?.moonPhase,
			pop: row?.daytime?.precipitation?.probability === void 0 ? void 0 : Number(row.daytime.precipitation.probability)
		}));
	}
	/** 实时预警（蓝色及以上由调用方用 shouldShowAlert 过滤）。 */
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
	/** 天气指数（生活指数）：type=0 拉全部类型，1 天。 */
	async indices(lat, lon) {
		const data = await this.request(`/indices/v1/daily/${lat.toFixed(2)}/${lon.toFixed(2)}`, {
			type: 0,
			days: 1,
			lang: "zh"
		});
		return (Array.isArray(data?.daily) ? data.daily : []).map((row) => ({
			type: String(row.type ?? row.code ?? ""),
			name: String(row.name ?? ""),
			level: row.level === void 0 ? void 0 : String(row.level),
			category: row.category === void 0 ? void 0 : String(row.category),
			text: row.text === void 0 ? void 0 : String(row.text),
			date: row.date === void 0 ? void 0 : String(row.date)
		})).filter((item) => item.name.length > 0);
	}
	/**
	* 把任意位置输入解析成一个地理实体：
	* 支持 "经度,纬度"、LocationID、以及城市 / 区县名称（取第一个结果）。
	*/
	async resolvePlace(query) {
		const places = await this.geocode(query);
		if (places.length === 0) throw new QWeatherError("QW_LOCATION_NOT_FOUND", `找不到位置「${query}」，请改用更精确的名称（如“北京 海淀”）、LocationID 或“经度,纬度”`);
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
/** 展示阈值下调至蓝色：蓝/黄/橙/红均展示，仅未知级别（无法识别的 severity/color）被过滤。 */
function shouldShowAlert(alert) {
	if (alert.severity === "minor" || alert.severity === "moderate" || alert.severity === "severe" || alert.severity === "extreme") return true;
	const color = alert.color.toLowerCase();
	return color === "blue" || color === "yellow" || color === "orange" || color === "red";
}
/** 预警展示颜色（未知级别用灰色兜底）。 */
function warningColor(alert) {
	return WARNING_COLORS[alert.color.toLowerCase()] ?? WARNING_COLORS["unknown"];
}
/** 预警简要标题：仅「某类某色预警」（如「雷电蓝色预警」），不罗列正文与防御指引。 */
function alertHeadline(alert) {
	const level = WARNING_NAMES[alert.color.toLowerCase()] ?? "预警";
	const type = alert.typeName ?? "";
	return type !== "" ? `${type}${level}` : level;
}
/** 指数名称去掉「指数」后缀，用于紧凑展示（「穿衣指数」→「穿衣」）。 */
function indexLabel(name) {
	return name.replace(/指数$/, "");
}
/** 风级 → 数字文本（缺省返回空串）。 */
function windScaleLabel(scale) {
	if (scale === void 0 || scale === "") return "";
	return String(scale);
}
/** 从 API 返回的指数中取前三个，避免指数区超限换行溢出。 */
function curateIndices(indices) {
	return indices.slice(0, 3);
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
		const alerts = (bundle.alerts ?? []).filter(shouldShowAlert);
		if (alerts.length === 0) lines.push("预警：无预警");
		else {
			lines.push(`预警（${alerts.length} 条）：`);
			for (const alert of alerts) {
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
/**
* 风向箭头：上指为北（0°），顺时针旋转 degree 度，即箭头指向风吹来的方向。
* 使用 SVG transform 属性（rotate(angle cx cy)）绕视图中心旋转，避免 CSS
* transform-origin 在不同浏览器下解析不一致导致箭头被甩出小时格。
*/
function windArrow(degree, size = 12) {
	return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="display:block"><path transform="rotate(${degree !== void 0 && Number.isFinite(degree) ? Math.round(degree) % 360 : 0} 12 12)" d="M12 2.6L18.6 10.6H14.6V21.4H9.4V10.6H5.4Z" fill="currentColor"/></svg>`;
}
/** 小雨滴图标（用于标注降水概率指标）。 */
function raindropIcon(size = 11) {
	return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="display:block"><path d="M12 3.2c3.6 4.7 5.8 7.9 5.8 10.9a5.8 5.8 0 1 1-11.6 0c0-3 2.2-6.2 5.8-10.9z" fill="currentColor"/><ellipse cx="9.2" cy="13.6" rx="1.5" ry="2.3" fill="#ffffff" opacity=".5"/></svg>`;
}
//#endregion
//#region src/qweather/card.ts
/** 卡片样式表（fragment 必须内联带上，否则 SVG 落入默认黑色填充）。 */
const CARD_CSS = `
.qw,.qw *{box-sizing:border-box}
.qw{font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
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
  color:var(--f);background:transparent}
/* 卡片主体：纯玻璃渐变，无外部辉光/投影；仅保留内部顶缘高光，背景透明以融入对话。 */
.qw-card{position:relative;display:flex;flex-direction:column;gap:12px;border-radius:18px;padding:16px 18px 14px;border:1px solid var(--bd);
  background:linear-gradient(150deg,var(--glass-a),var(--glass-b));
  backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15);
  box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.08))}
.qw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.qw-loc{font-size:15px;font-weight:800;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-updated{flex:none;font-size:12px;color:var(--m);font-variant-numeric:tabular-nums}
.qw-now{display:flex;align-items:center;gap:12px}
.qw-now-icon{flex:none;display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:16px;
  background:linear-gradient(145deg,light-dark(#e0f4ff,#1c2e4e),light-dark(#bfe4ff,#0e1a30));
  box-shadow:5px 5px 12px var(--sh-dark),-4px -4px 10px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.09))}
.qw-now-main{display:flex;flex-direction:column;line-height:1.08}
.qw-now-temp{display:flex;align-items:flex-start;gap:1px}
.qw-now-temp .n{font-size:31px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.qw-now-temp .deg{font-size:14px;font-weight:800;color:var(--orange);margin-top:2.5px}
.qw-now-text{font-size:13px;color:var(--m)}
.qw-now-meta{margin-left:auto;display:grid;grid-template-columns:auto auto;column-gap:14px;row-gap:4px;font-size:12px;text-align:right}
.qw-now-meta .k{color:var(--s)}
.qw-now-meta .v{color:var(--f);font-weight:700;font-variant-numeric:tabular-nums}
.qw-sec-title{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.6px;color:var(--m)}
.qw-sec-title::before{content:'';flex:none;width:4px;height:13px;border-radius:2px;background:linear-gradient(180deg,var(--sky),var(--orange));box-shadow:0 1px 4px light-dark(rgba(148,163,184,.45),rgba(0,0,0,.45))}
.qw-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;color:var(--orange);font-size:11.5px;font-weight:800;font-variant-numeric:tabular-nums;
  background:linear-gradient(150deg,color-mix(in srgb,var(--bc,#f97316) 16%,transparent),transparent 70%);
  border:1px solid color-mix(in srgb,var(--bc,#f97316) 35%,transparent);
  box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.7),rgba(255,255,255,.08))}
.qw-hours{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
.qw-hr{min-width:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 8px;border-radius:13px;border:1px solid var(--bd);
  background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:3px 3px 7px var(--sh-dark),-2.5px -2.5px 6px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.08))}
.qw-hr-time{font-size:13px;color:var(--m);font-weight:600;font-variant-numeric:tabular-nums}
.qw-hr-icon{display:flex;align-items:center;justify-content:center;height:34px}
.qw-hr-temp{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.qw-hr-temp .deg{font-size:9px;font-weight:800;color:var(--orange);margin-left:1px}
.qw-hr-pop{display:inline-flex;align-items:center;gap:2.5px;font-size:12px;color:var(--m);font-weight:600;font-variant-numeric:tabular-nums}
.qw-hr-pop svg{flex:none}
.qw-hr-wind{display:inline-flex;align-items:center;gap:2px;font-size:11.5px;color:var(--m);font-variant-numeric:tabular-nums;min-height:13px}
.qw-hr-wind svg{flex:none;color:var(--sky-deep)}
.qw-hr-wind b{font-weight:600}
.qw-alerts{display:flex;flex-wrap:wrap;gap:8px}
.qw-alert{flex:1 1 130px;min-width:0;display:flex;flex-direction:column;gap:3px;padding:9px 12px;border-radius:12px;border:1px solid var(--bd);border-left:3px solid var(--alert-c,#f59e0b);
  background:linear-gradient(150deg,color-mix(in srgb,var(--alert-c,#f59e0b) 12%,transparent),transparent 60%);
  box-shadow:2px 3px 8px var(--sh-dark),inset 0 1px 0 light-dark(rgba(255,255,255,.75),rgba(255,255,255,.06))}
.qw-alert-head{font-size:13.5px;font-weight:700;color:var(--f)}
.qw-alert-body{font-size:12.5px;color:var(--m);line-height:1.55}
.qw-empty{font-size:13px;color:var(--s)}
.qw-detail{display:flex;flex-direction:column;gap:6px}
.qw-detail-row{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.5}
.qw-detail-row .k{flex:none;color:var(--s)}
.qw-detail-row>b{color:var(--f);font-weight:600}
.qw-idx-wrap{display:flex;flex-wrap:wrap;gap:6px}
.qw-idx-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--f);font-weight:600;padding:4px 9px;border-radius:9px;border:1px solid var(--bd);
  background:linear-gradient(145deg,var(--cell-a),var(--cell-b));
  box-shadow:2.5px 2.5px 6px var(--sh-dark),-2px -2px 5px var(--sh-light),inset 0 1px 0 light-dark(rgba(255,255,255,.9),rgba(255,255,255,.07))}
.qw-idx-chip .c{color:var(--sky-deep);font-weight:700}
.qw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px dashed var(--bd);font-size:12px;color:var(--s)}
.qw-foot a{color:var(--sky-deep);text-decoration:none;font-weight:700}
.qw-foot a:hover{color:var(--orange);text-decoration:underline}
`;
/** 小时格里的气温。 */
function hourTempHtml(hour) {
	return `<span class="qw-hr-temp">${escapeHtml(round1(hour.temp))}<span class="deg">℃</span></span>`;
}
/** 小时格里的降水概率（前置雨滴图标）。 */
function hourPopHtml(hour) {
	return `<span class="qw-hr-pop">${raindropIcon(11)}<span>${escapeHtml(percent(hour.pop))}</span></span>`;
}
/** 小时格里的风向箭头 + 风级数字。 */
function hourWindHtml(hour) {
	const scale = windScaleLabel(hour.windScale);
	const arrow = hour.windDegree !== void 0 ? windArrow(hour.windDegree, 11) : "";
	if (arrow === "" && scale === "") return "";
	const title = escapeHtml([hour.windDir ?? "", scale !== "" ? `${scale}级` : ""].filter(Boolean).join(" · "));
	return `<span class="qw-hr-wind"${title !== "" ? ` title="${title}"` : ""}>${arrow}${scale !== "" ? `<b>${escapeHtml(scale)}</b>` : ""}</span>`;
}
/** 组装一张完整的天气卡片 fragment。 */
function buildCardFragment(bundle, hourCount = 5) {
	const hours = (bundle.hours ?? []).slice(0, Math.max(1, Math.min(5, hourCount)));
	const alerts = (bundle.alerts ?? []).filter(shouldShowAlert).slice(0, 6);
	const air = bundle.air;
	const today = (bundle.days ?? [])[0];
	const indices = curateIndices(bundle.indices ?? []);
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
			parts.push(`<span class="qw-hr-icon">${weatherIcon(hour.icon, 28, "h" + index)}</span>`);
			parts.push(hourTempHtml(hour));
			parts.push(hourPopHtml(hour));
			parts.push(hourWindHtml(hour));
			parts.push("</div>");
		});
		parts.push("</div>");
		parts.push("</div>");
	}
	parts.push("<div>");
	parts.push(`<div class="qw-sec-title">预警${alerts.length > 0 ? `<span class="qw-badge" style="--bc:${warningColor(alerts[0])};">${alerts.length}</span>` : ""}</div>`);
	if (alerts.length === 0) parts.push("<div class=\"qw-empty\">当前无预警</div>");
	else {
		parts.push("<div class=\"qw-alerts\">");
		for (const alert of alerts) {
			const full = [
				alert.sender ?? "",
				alert.text ?? "",
				alert.instruction ?? ""
			].filter(Boolean).join("\n");
			parts.push(`<div class="qw-alert" style="--alert-c:${warningColor(alert)}" title="${escapeHtml(full)}">`);
			parts.push(`<div class="qw-alert-head">${escapeHtml(alertHeadline(alert))}</div>`);
			parts.push("</div>");
		}
		parts.push("</div>");
	}
	parts.push("</div>");
	const detail = [];
	if (air !== void 0 && Number.isFinite(air.aqi)) {
		const airText = [`AQI ${air.aqi}`];
		if (air.category !== void 0) airText.push(air.category);
		if (air.primary !== void 0 && air.primary !== "") airText.push(`首要污染物 ${air.primary}`);
		detail.push(`<div class="qw-detail-row"><span class="k">空气质量</span><b>${escapeHtml(airText.join(" · "))}</b></div>`);
	}
	const astro = [];
	if (today?.sunrise !== void 0) astro.push(`日出 ${hourLabel(today.sunrise)}`);
	if (today?.sunset !== void 0) astro.push(`日落 ${hourLabel(today.sunset)}`);
	if (today?.moonrise !== void 0) astro.push(`月出 ${hourLabel(today.moonrise)}`);
	if (today?.moonset !== void 0) astro.push(`月落 ${hourLabel(today.moonset)}`);
	if (astro.length > 0) detail.push(`<div class="qw-detail-row"><span class="k">日月起落</span><b>${escapeHtml(astro.join(" · "))}</b></div>`);
	if (indices.length > 0) {
		const chips = indices.map((idx) => `<span class="qw-idx-chip">${escapeHtml(indexLabel(idx.name))}${idx.category !== void 0 ? `<span class="c">${escapeHtml(idx.category)}</span>` : ""}</span>`).join("");
		detail.push(`<div class="qw-detail-row"><span class="k">生活指数</span><span class="qw-idx-wrap">${chips}</span></div>`);
	}
	if (detail.length > 0) {
		parts.push("<div>");
		parts.push("<div class=\"qw-sec-title\">天气详情</div>");
		parts.push("<div class=\"qw-detail\">" + detail.join("") + "</div>");
		parts.push("</div>");
	}
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
/** 用当前配置构造 API 客户端；主开关关闭 / 未配置密钥时给出明确指引（带错误码）。 */
function clientFrom(config, signal, logger) {
	if (!config.enabled) throw new QWeatherError("QW_DISABLED", "和风天气插件已在设置中被关闭：请到 设置 → 插件 → 和风天气 打开总开关");
	const apiKey = config.apiKey?.trim() ?? "";
	if (apiKey.length === 0) throw new QWeatherError("QW_NO_API_KEY", "尚未配置和风天气 API KEY：请到 设置 → 插件 → 和风天气 填写密钥");
	return new QWeatherClient({
		apiHost: config.apiHost,
		apiKey,
		signal,
		logger
	});
}
/** 解析目标位置：工具参数优先，其次设置里的默认位置。 */
function targetOf(locationArg, config) {
	const target = locationArg?.trim() || config.location?.trim() || "";
	if (target.length === 0) throw new QWeatherError("QW_NO_LOCATION", "未指定位置：请传入 location 参数，或到设置里配置默认位置");
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
function weatherTool(ctx, getConfig, logger = createLogger("qweather:tools")) {
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
			const log = logger.child("weather");
			const config = getConfig();
			const client = clientFrom(config, exec.signal, logger);
			const range = args.range ?? "now";
			const fields = parseFields(args.fields);
			log.debug("execute start", {
				location: args.location,
				range,
				fields: [...fields]
			});
			const startedAt = Date.now();
			const place = await client.resolvePlace(targetOf(args.location, config));
			const bundle = await fetchBundle(client, place, range, boundedInteger(args.hours, 1, 240, 5), boundedInteger(args.days, 1, 10, 3), fields);
			const summary = buildWeatherText(bundle, range, fields);
			log.debug("execute ok", {
				location: placeLabel(place),
				range,
				ms: Date.now() - startedAt
			});
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
function cardTool(ctx, getConfig, logger = createLogger("qweather:tools")) {
	return defineTool({
		name: CARD_TOOL_NAME,
		description: "在对话中渲染一张交互式天气卡片（HTML），方便用户浏览阅读。 location 可缺省（默认用设置里配置的位置；支持城市/区县名称、LocationID、或“经度,纬度”）。 卡片固定显示未来 5 小时逐小时预报（每格含气温、降水概率、风向风级），并展示当前天气、蓝色及以上预警、空气质量、日月起落、生活指数与更新时间。 数据实时取自和风天气，用户在对话中直接看到卡片。适合用户要求“画出来 / 展示天气卡片”的场景；纯数据问答用 qweather_weather。",
		parameters: { location: {
			type: "string",
			description: "要查询的地理位置。可缺省（使用设置里的默认位置）。支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。"
		} },
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
			const log = logger.child("card");
			const config = getConfig();
			const client = clientFrom(config, exec.signal, logger);
			log.debug("execute start", { location: args.location });
			const startedAt = Date.now();
			const place = await client.resolvePlace(targetOf(args.location, config));
			const hourCount = 5;
			const [now, hours, alerts] = await Promise.all([
				client.current(place.lat, place.lon),
				client.hourly(place.lat, place.lon, hourCount),
				client.alerts(place.lat, place.lon).catch((cause) => {
					log.warn("alerts failed", {
						code: errorCodeOf(cause),
						message: toQWeatherError(cause).message
					});
					return [];
				})
			]);
			const [days, air, indices] = await Promise.all([
				client.daily(place.lat, place.lon, 1).catch(() => []),
				client.air(place.lat, place.lon).catch(() => void 0),
				client.indices(place.lat, place.lon).catch((cause) => {
					log.warn("indices failed", {
						code: errorCodeOf(cause),
						message: toQWeatherError(cause).message
					});
					return [];
				})
			]);
			const bundle = {
				place,
				receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
				now,
				hours,
				alerts,
				days,
				air,
				indices
			};
			const location = placeLabel(place);
			const fragment = buildCardFragment(bundle, hourCount);
			log.debug("execute ok", {
				location,
				sizeBytes: byteLength(fragment),
				ms: Date.now() - startedAt
			});
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
//#region src/config-routes.ts
/**
* 插件自带的同源 HTTP 配置接口（挂在宿主 webServer 服务上，与 dshmarket 同款模式）。
*
* 背景：当前 DSH 版本的设置 RPC 只向 Web 客户端暴露硬编码白名单内的命名空间
* （model 提供商 + 少数内置 section），第三方插件注册的 settings 命名空间在
* 客户端会得到 settings-not-exposed。因此设置卡片改走本接口：
*   GET  /dsh-qweather/config  读取当前配置（含是否开启、定位方式等）
*   POST /dsh-qweather/config  保存部分配置（同源校验 + schema 校验后写入
*                              宿主 settings 命名空间，持久化到 settings.yaml）
* 宿主内部仍然通过 settings 命名空间读取配置，LLM 工具 / 侧边栏组件行为不变。
*
* 错误响应统一为 `{ error: string, code: QWeatherErrorCode }`：`error` 面向用户，
* `code` 供客户端 / 日志做机器判别；HTTP 状态按错误类别映射
* （permission→403，input→400，其余→500）。
*/
/** 写 JSON 响应（禁缓存）。 */
function sendJson(response, status, payload) {
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8"
	});
	response.end(JSON.stringify(payload));
}
/** 同源校验：Origin 的 host 必须与请求 Host 一致（防跨站写配置）。 */
function sameOrigin(request) {
	const origin = request.headers.origin;
	const host = request.headers.host;
	if (typeof origin !== "string" || typeof host !== "string") return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
/** 读取并解析 JSON 请求体（上限 16KiB）。 */
async function readJsonBody(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > 16384) throw new QWeatherError("QW_BAD_REQUEST", "请求体过大（上限 16KiB）");
		chunks.push(buffer);
	}
	let parsed;
	try {
		parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch (cause) {
		throw new QWeatherError("QW_BAD_REQUEST", "请求体不是合法 JSON", { cause });
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new QWeatherError("QW_BAD_REQUEST", "请求体必须是 JSON 对象");
	return parsed;
}
/** 按错误类别映射 HTTP 状态码。 */
function statusOf(error) {
	const qw = toQWeatherError(error);
	if (qw.category === "permission") return 403;
	if (qw.category === "input") return 400;
	return 500;
}
/** 挂载 GET/POST /dsh-qweather/config 路由，返回整体卸载函数。 */
function mountConfigRoutes(webServer, deps, logger = createLogger("qweather:config")) {
	const dispose = webServer.register({
		kind: "exact",
		path: "/dsh-qweather/config",
		handler: async (request, response) => {
			if (request.method === "GET") {
				try {
					sendJson(response, 200, { config: deps.getConfig() });
				} catch (error) {
					const code = errorCodeOf(error);
					logger.error("GET config failed", {
						code,
						message: toQWeatherError(error).message
					});
					sendJson(response, statusOf(error), {
						error: toQWeatherError(error).message,
						code
					});
				}
				return;
			}
			if (request.method === "POST") {
				if (!sameOrigin(request)) {
					const err = new QWeatherError("QW_FORBIDDEN", "跨源请求被拒绝");
					logger.warn("POST config blocked: cross-origin");
					sendJson(response, 403, {
						error: err.message,
						code: err.code
					});
					return;
				}
				try {
					const patch = await readJsonBody(request);
					const config = await deps.updateConfig(patch);
					logger.info("POST config saved", { keys: Object.keys(patch) });
					sendJson(response, 200, { config });
				} catch (error) {
					const code = errorCodeOf(error);
					logger.warn("POST config failed", {
						code,
						message: toQWeatherError(error).message
					});
					sendJson(response, statusOf(error), {
						error: toQWeatherError(error).message,
						code
					});
				}
				return;
			}
			response.writeHead(405, { allow: "GET, POST" });
			response.end();
		}
	});
	return () => {
		dispose();
	};
}
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
* 注册设置命名空间、HTTP 配置接口与两个工具。
*
* 配置分层：
* - 宿主：注册 qweather settings 命名空间（LLM 工具从 current() 实时读取）；
* - Web 客户端：官方设置 RPC 不向第三方命名空间开放（settings-not-exposed），
*   因此通过插件自带的同源 HTTP 接口 GET/POST /dsh-qweather/config 读写，
*   写入走命名空间 scope.update，持久化到 settings.yaml；
* - 极简部署（无 settings 服务）自动降级为只读静态 config。
*/
function apply(ctx, config) {
	const log = createLogger("dsh-qweather");
	let current = () => config;
	let scope;
	ctx.inject(["settings"], (sctx) => {
		const registered = sctx.settings.register(QWEATHER_NS, Config, { base: config });
		scope = registered;
		current = () => registered.get();
		log.debug("settings namespace registered");
	});
	ctx.inject(["webServer"], (wctx) => {
		const webServer = wctx.webServer;
		wctx.effect(() => mountConfigRoutes(webServer, {
			getConfig: () => current(),
			updateConfig: async (patch) => {
				if (scope === void 0) throw new QWeatherError("QW_SETTINGS_UNAVAILABLE", "设置服务不可用，无法保存配置");
				try {
					Config(patch);
				} catch (cause) {
					throw new QWeatherError("QW_BAD_REQUEST", `配置校验失败：${cause instanceof Error ? cause.message : String(cause)}`, { cause });
				}
				await scope.update(patch);
				return current();
			}
		}, log.child("config")), "dsh-qweather: config routes");
		log.debug("config routes mounted");
	});
	ctx.tools.register(weatherTool(ctx, () => current(), log.child("tools")));
	ctx.tools.register(cardTool(ctx, () => current(), log.child("tools")));
	ctx.skills.registerProvider(() => qweatherSkillProvider);
	log.info("plugin applied", {
		enabled: config.enabled,
		apiHost: config.apiHost || "(default)"
	});
}
//#endregion
export { CARD_META_KIND, CARD_TOOL_NAME, Config, DEFAULT_API_HOST, ERROR_CATALOG, QWEATHER_NS, QWeatherApiError, QWeatherClient, QWeatherError, WEATHER_TOOL_NAME, alertHeadline, apply, buildCardFragment, buildWeatherText, byteLength, cardTool, createLogger, curateIndices, dayLabel, errorCodeOf, formatUpdateTime, getLogLevel, hourLabel, iconKindOf, indexLabel, inject, isQWeatherError, localDateTime, name, parseFields, percent, placeLabel, qweatherCardMetaFrom, raindropIcon, redact, round1, setLogLevel, shouldShowAlert, toQWeatherError, warningColor, weatherIcon, weatherTool, windArrow, windScaleLabel };
