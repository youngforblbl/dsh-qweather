window.__ModuleLoader__.load({
	id: "dsh-qweather",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/qweather/types.ts
		/** 黄色及以上（含橙、红）才算「重要预警」；蓝色与未知级别被过滤。 */
		function isYellowOrAbove(alert) {
			if (alert.severity === "moderate" || alert.severity === "severe" || alert.severity === "extreme") return true;
			const color = alert.color.toLowerCase();
			return color === "yellow" || color === "orange" || color === "red";
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
		/** 数字 → 最多一位小数的字符串（30.0 → "30"）。 */
		function round1(n) {
			return String(Math.round(n * 10) / 10);
		}
		/** 百分比 0-1 → 整数百分比文本。 */
		function percent(n) {
			return `${Math.round(n * 100)}%`;
		}
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
		//#region src/client/use-qweather.ts
		/**
		* 浏览器端的共享数据逻辑：设置快照订阅、自动/手动定位解析、
		* 天气数据拉取与定时刷新。设置卡片与侧边栏组件共用。
		*/
		/** 把 scope 快照里的 section 归一化成强类型设置。 */
		function normalizeSettings(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const section = value;
			const str = (raw, fallback) => typeof raw === "string" && raw.length > 0 ? raw : fallback;
			return {
				enabled: section.enabled !== false,
				apiHost: str(section.apiHost, "https://devapi.qweather.com"),
				apiKey: str(section.apiKey, ""),
				projectId: str(section.projectId, ""),
				locationMode: section.locationMode === "manual" ? "manual" : "auto",
				location: str(section.location, "北京"),
				autoLocationId: str(section.autoLocationId, ""),
				autoLocationName: str(section.autoLocationName, "")
			};
		}
		/** 订阅设置 scope 的快照（React 状态）。 */
		function useSettingsSnapshot(scope) {
			const [snapshot, setSnapshot] = (0, react.useState)(scope.getSnapshot());
			(0, react.useEffect)(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope]);
			return normalizeSettings(snapshot.value);
		}
		/** 浏览器定位：拿经纬度（自动定位到市/区级，由城市搜索接口反查）。 */
		function geolocate() {
			return new Promise((resolve, reject) => {
				if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
					reject(/* @__PURE__ */ new Error("当前环境不支持浏览器定位"));
					return;
				}
				navigator.geolocation.getCurrentPosition((position) => resolve({
					lat: position.coords.latitude,
					lon: position.coords.longitude
				}), (error) => reject(/* @__PURE__ */ new Error("浏览器定位失败：" + (error.message || error.code))), {
					enableHighAccuracy: false,
					timeout: 1e4,
					maximumAge: 3e5
				});
			});
		}
		/**
		* 按设置解析目标位置：
		* - manual：直接搜索用户输入（名称 / LocationID / 经纬度）；
		* - auto：优先用已解析的 autoLocationId；否则浏览器定位反查并写回设置；
		*   定位失败时回退到手动兜底位置。
		*/
		async function resolvePlaceForSettings(client, settings, saveAuto) {
			if (settings.locationMode === "manual") return client.resolvePlace(settings.location);
			if (settings.autoLocationId.length > 0) try {
				return await client.resolvePlace(settings.autoLocationId);
			} catch {}
			try {
				const coords = await geolocate();
				const place = await client.resolvePlace(coords.lat.toFixed(4) + "," + coords.lon.toFixed(4));
				saveAuto(place.id, placeLabel(place));
				return place;
			} catch {}
			if (settings.location.trim().length > 0) return client.resolvePlace(settings.location);
			throw new QWeatherApiError(0, "自动定位失败，且未配置兜底位置：请到设置切换为手动位置");
		}
		/** 拉取并缓存天气：首次加载 + 设置变化时刷新，每 10 分钟定时刷新。 */
		function useWeather(settings, saveAuto) {
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const busy = (0, react.useRef)(false);
			const settingsKey = JSON.stringify([
				settings?.enabled,
				settings?.apiHost,
				settings?.apiKey,
				settings?.locationMode,
				settings?.location,
				settings?.autoLocationId
			]);
			const refresh = (0, react.useCallback)(async () => {
				if (settings === void 0 || busy.current) return;
				if (!settings.enabled) {
					setState({ status: "idle" });
					return;
				}
				if (settings.apiKey.trim().length === 0) {
					setState({
						status: "error",
						error: "未配置 API KEY：请到 设置 → 插件 → 和风天气 填写"
					});
					return;
				}
				busy.current = true;
				setState((previous) => previous.bundle === void 0 ? { status: "loading" } : {
					...previous,
					refreshing: true
				});
				try {
					const client = new QWeatherClient({
						apiHost: settings.apiHost,
						apiKey: settings.apiKey
					});
					const place = await resolvePlaceForSettings(client, settings, saveAuto);
					const [now, hours, alerts] = await Promise.all([
						client.current(place.lat, place.lon),
						client.hourly(place.lat, place.lon, 5),
						client.alerts(place.lat, place.lon)
					]);
					const bundle = {
						place,
						receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
						now,
						hours,
						alerts
					};
					setState({
						status: "ready",
						bundle
					});
				} catch (cause) {
					setState({
						status: "error",
						error: cause instanceof Error ? cause.message : String(cause)
					});
				} finally {
					busy.current = false;
				}
			}, [settingsKey, saveAuto]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (settings?.enabled !== true) return;
				const timer = setInterval(() => void refresh(), 6e5);
				return () => clearInterval(timer);
			}, [refresh, settings?.enabled]);
			return {
				state,
				refresh
			};
		}
		//#endregion
		//#region src/client/settings-card.tsx
		/**
		* 设置卡片（注册到 settings.plugin.item 槽位）：
		* 1) 输入/保存 API Host、项目 ID、API KEY；
		* 2) 一键总开关（控制侧边栏组件与两个 LLM 工具）；
		* 3) 自动定位（市/区级，浏览器定位）或手动输入位置；
		* 附带「测试连接」按钮，保存前先验证密钥与位置可用。
		* 表单采用 staged draft：点「保存」才写入设置命名空间。
		*/
		const fg$1 = "var(--dsw-alias-label-primary)";
		const muted$1 = "var(--dsw-alias-label-caption)";
		const accent$1 = "var(--dsw-alias-brand-primary-new-colorprimary-new-color)";
		const cardBg$1 = "var(--dsw-alias-bg-layer-1)";
		const block = {
			display: "flex",
			flexDirection: "column",
			gap: 6
		};
		const label = {
			fontSize: 12,
			fontWeight: 600,
			color: fg$1
		};
		const hint = {
			fontSize: 11,
			color: muted$1,
			lineHeight: 1.5
		};
		const input = {
			width: "100%",
			boxSizing: "border-box",
			fontSize: 12,
			color: fg$1,
			background: "var(--dsw-alias-bg-layer-2, transparent)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			padding: "6px 8px",
			outline: "none"
		};
		const button = {
			fontSize: 12,
			fontWeight: 600,
			color: "#fff",
			background: accent$1,
			border: "none",
			borderRadius: 8,
			padding: "6px 14px",
			cursor: "pointer"
		};
		const ghostButton = {
			fontSize: 12,
			color: accent$1,
			background: "transparent",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			padding: "5px 12px",
			cursor: "pointer"
		};
		/** 设置卡片组件。 */
		function QWeatherSettingsCard(props) {
			const settings = useSettingsSnapshot(props.scope);
			const t = props.qw;
			const [drafts, setDrafts] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)("");
			const [test, setTest] = (0, react.useState)(null);
			const [showKey, setShowKey] = (0, react.useState)(false);
			if (settings === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: 12,
					fontSize: 12,
					color: muted$1
				},
				children: t("card.unavailable")
			});
			const draft = (field) => drafts?.[field] ?? String(settings[field] ?? "");
			const update = (field, value) => {
				setDrafts((previous) => ({
					...previous ?? {
						apiHost: settings.apiHost,
						apiKey: settings.apiKey,
						projectId: settings.projectId,
						locationMode: settings.locationMode,
						location: settings.location
					},
					[field]: value
				}));
				setNotice("");
			};
			const save = async () => {
				if (saving) return;
				setSaving(true);
				setNotice("");
				try {
					if (drafts !== null) {
						if (drafts.apiHost !== settings.apiHost) await props.scope.set("apiHost", drafts.apiHost);
						if (drafts.apiKey !== settings.apiKey) await props.scope.set("apiKey", drafts.apiKey);
						if (drafts.projectId !== settings.projectId) await props.scope.set("projectId", drafts.projectId);
						if (drafts.locationMode !== settings.locationMode) await props.scope.set("locationMode", drafts.locationMode);
						if (drafts.location !== settings.location) await props.scope.set("location", drafts.location);
					}
					setDrafts(null);
					setNotice(t("card.saved"));
				} catch (cause) {
					setNotice(t("card.saveFailed") + "：" + (cause instanceof Error ? cause.message : String(cause)));
				} finally {
					setSaving(false);
				}
			};
			const toggleEnabled = () => {
				props.scope.set("enabled", !settings.enabled);
			};
			const runTest = async () => {
				setTest(null);
				const apiKey = draft("apiKey");
				if (apiKey.trim().length === 0) {
					setTest({
						ok: false,
						text: t("card.testNeedKey")
					});
					return;
				}
				try {
					const client = new QWeatherClient({
						apiHost: draft("apiHost"),
						apiKey
					});
					const place = await client.resolvePlace(draft("location"));
					const now = await client.current(place.lat, place.lon);
					setTest({
						ok: true,
						text: t("card.testOk") + "：" + placeLabel(place) + " · " + now.text + " " + round1(now.temp) + "℃"
					});
				} catch (cause) {
					setTest({
						ok: false,
						text: t("card.testFail") + "：" + (cause instanceof Error ? cause.message : String(cause))
					});
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 12,
					padding: 16,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					background: cardBg$1
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 14,
								fontWeight: 700,
								color: fg$1
							},
							children: "和风天气 QWeather"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: hint,
							children: t("card.desc")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							onClick: toggleEnabled,
							style: settings.enabled ? button : ghostButton,
							"aria-pressed": settings.enabled,
							children: settings.enabled ? t("card.on") : t("card.off")
						})]
					}),
					!settings.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: hint,
						children: t("card.offHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								style: label,
								children: "API Host（服务域名）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: input,
								value: draft("apiHost"),
								onChange: (e) => update("apiHost", e.target.value),
								placeholder: "https://devapi.qweather.com",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: hint,
								children: t("card.hostHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								style: label,
								children: "API KEY"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: input,
								value: draft("apiKey"),
								onChange: (e) => update("apiKey", e.target.value),
								type: showKey ? "text" : "password",
								placeholder: "例如 fbdc…f48b",
								spellCheck: false,
								autoComplete: "off"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									...hint,
									cursor: "pointer",
									userSelect: "none"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: showKey,
									onChange: (e) => setShowKey(e.target.checked),
									style: {
										verticalAlign: "-2px",
										marginRight: 4
									}
								}), t("card.showKey")]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							style: label,
							children: t("card.projectId")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: input,
							value: draft("projectId"),
							onChange: (e) => update("projectId", e.target.value),
							placeholder: "如 KEGW8X7XUJ（可选，仅记录）",
							spellCheck: false
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								style: label,
								children: t("card.location")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									gap: 8
								},
								children: ["auto", "manual"].map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									onClick: () => update("locationMode", mode),
									style: draft("locationMode") === mode ? button : ghostButton,
									children: mode === "auto" ? t("card.auto") : t("card.manual")
								}, mode))
							}),
							draft("locationMode") === "manual" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: input,
								value: draft("location"),
								onChange: (e) => update("location", e.target.value),
								placeholder: "北京 / 海淀 / 101010100 / 116.41,39.92",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: hint,
								children: draft("locationMode") === "auto" ? t("card.autoHint") + (settings.autoLocationName ? " " + t("card.autoResolved") + "：" + settings.autoLocationName : "") : t("card.manualHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8,
							alignItems: "center",
							flexWrap: "wrap"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => void save(),
								disabled: saving,
								style: button,
								children: saving ? t("card.saving") : t("card.save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => void runTest(),
								style: ghostButton,
								children: t("card.test")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: "https://dev.qweather.com/docs/api/",
								target: "_blank",
								rel: "noopener noreferrer",
								style: {
									fontSize: 12,
									color: accent$1
								},
								children: t("card.docs")
							})
						]
					}),
					notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12,
							color: notice.startsWith(t("card.saved")) ? "var(--dsw-alias-success, #3aa675)" : "var(--dsw-alias-danger, #d9534f)"
						},
						children: notice
					}),
					test !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12,
							color: test.ok ? "var(--dsw-alias-success, #3aa675)" : "var(--dsw-alias-danger, #d9534f)",
							wordBreak: "break-all"
						},
						children: test.text
					})
				]
			});
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
		//#region src/client/sidebar-widget.tsx
		const accent = "var(--dsw-alias-brand-primary-new-colorprimary-new-color)";
		const fg = "var(--dsw-alias-label-primary)";
		const muted = "var(--dsw-alias-label-caption)";
		const cardBg = "var(--dsw-alias-bg-layer-1)";
		const railButton = {
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			gap: 2,
			width: 44,
			padding: "6px 0",
			margin: "4px 0",
			background: "transparent",
			border: "none",
			cursor: "pointer",
			color: fg,
			borderRadius: 10
		};
		const card = {
			display: "flex",
			flexDirection: "column",
			gap: 8,
			margin: "6px 0",
			padding: "10px 10px 8px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			background: cardBg
		};
		const row = {
			display: "flex",
			alignItems: "center",
			gap: 8
		};
		const hourGrid = {
			display: "grid",
			gridTemplateColumns: "repeat(5, 1fr)",
			gap: 4
		};
		const hourCell = {
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: 1,
			padding: "5px 1px",
			borderRadius: 8,
			border: "1px solid var(--dsw-alias-border-l2)"
		};
		function Icon({ code, size }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: accent,
					display: "inline-flex"
				},
				dangerouslySetInnerHTML: { __html: weatherIcon(code, size) }
			});
		}
		/** 侧边栏收起（rail）：仅图标 + 气温。 */
		function RailView({ bundle, status, error, onExpand }) {
			const now = bundle?.now;
			let text;
			if (now !== void 0) text = round1(now.temp) + "°";
			else if (status === "loading") text = "…";
			else if (status === "error") text = "—";
			else text = "·";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				style: railButton,
				title: error ?? "和风天气",
				onClick: onExpand,
				"aria-label": "展开侧边栏查看天气",
				children: [now !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					code: now.icon,
					size: 22
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: 16,
						opacity: .7
					},
					children: "⛅"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: 13,
						fontWeight: 600,
						lineHeight: 1
					},
					children: text
				})]
			});
		}
		/** 预警行（仅黄色及以上；最多展示前两条）。 */
		function AlertRows({ bundle }) {
			const alerts = (bundle.alerts ?? []).filter(isYellowOrAbove).slice(0, 2);
			if (alerts.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 4
				},
				children: alerts.map((alert) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 11,
						lineHeight: 1.4,
						padding: "5px 8px",
						borderRadius: 8,
						border: "1px solid var(--dsw-alias-border-l2)",
						borderLeft: "3px solid " + warningColorOf(alert.color),
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: alert.headline
				}, alert.id))
			});
		}
		function warningColorOf(color) {
			return {
				yellow: "#e3a008",
				orange: "#e0662d",
				red: "#d9534f"
			}[color] ?? "#e3a008";
		}
		/** 侧边栏展开（wide）：完整天气卡片。 */
		function WideView({ bundle, status, error, refreshing, onRefresh, t }) {
			if (status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: card,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						color: muted,
						fontSize: 12
					},
					children: t("widget.loading")
				})
			});
			if (bundle === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						color: muted,
						fontSize: 12
					},
					children: error ?? t("widget.empty")
				}), status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: onRefresh,
					style: linkButton,
					children: t("widget.retry")
				})]
			});
			const now = bundle.now;
			const hours = (bundle.hours ?? []).slice(0, 5);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...row,
							justifyContent: "space-between"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 12,
								fontWeight: 600
							},
							children: placeLabel(bundle.place)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							onClick: onRefresh,
							title: t("widget.refresh"),
							style: {
								...linkButton,
								fontSize: 13
							},
							children: refreshing === true ? "…" : "↻"
						})]
					}),
					now !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								code: now.icon,
								size: 34
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									fontSize: 26,
									fontWeight: 600,
									lineHeight: 1
								},
								children: [round1(now.temp), "°"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: muted,
									fontSize: 12
								},
								children: now.text
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									marginLeft: "auto",
									color: muted,
									fontSize: 11,
									textAlign: "right",
									lineHeight: 1.5
								},
								children: [now.feelsLike !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"体感 ",
									round1(now.feelsLike),
									"°",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {})
								] }), now.humidity !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"湿度 ",
									now.humidity,
									"%"
								] })]
							})
						]
					}),
					hours.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 10,
							color: muted,
							marginBottom: 4
						},
						children: t("widget.hourly")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: hourGrid,
						children: hours.map((hour) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: hourCell,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 10,
										color: muted
									},
									children: hourLabel(hour.time)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									code: hour.icon,
									size: 16
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 10,
										color: "var(--dsw-alias-info-new-colorprimary-new-color)"
									},
									children: percent(hour.pop)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										fontSize: 12,
										fontWeight: 600
									},
									children: [round1(hour.temp), "°"]
								})
							]
						}, hour.time))
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlertRows, { bundle }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							justifyContent: "space-between",
							fontSize: 10,
							color: muted
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("widget.updated"),
							" ",
							hourLabel(bundle.receivedAt)
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "和风天气" })]
					})
				]
			});
		}
		const linkButton = {
			background: "transparent",
			border: "none",
			cursor: "pointer",
			color: accent,
			fontSize: 12,
			padding: 0
		};
		/** 槽位入口组件。 */
		function SidebarWeatherWidget(props) {
			const settings = useSettingsSnapshot(props.scope);
			const { state, refresh } = useWeather(settings, props.saveAuto);
			if (settings?.enabled !== true) return null;
			return props.wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WideView, {
				bundle: state.bundle,
				status: state.status,
				error: state.error,
				refreshing: state.refreshing,
				onRefresh: () => void refresh(),
				t: props.qw
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RailView, {
				bundle: state.bundle,
				status: state.status,
				error: state.error,
				onExpand: props.onExpand
			});
		}
		//#endregion
		//#region src/client/shell.ts
		/** 帧文档的 Content-Security-Policy（无任何网络请求能力）。 */
		const CARD_CSP = [
			"default-src 'none'",
			"script-src 'unsafe-inline'",
			"style-src 'unsafe-inline'",
			"img-src data: blob:",
			"font-src data:",
			"connect-src 'none'",
			"frame-src 'none'",
			"object-src 'none'",
			"base-uri 'none'",
			"form-action 'none'"
		].join("; ");
		/** 帧→卡片的高度上报消息类型。 */
		const HEIGHT_MESSAGE_TYPE = "dsh-qweather:height";
		/**
		* 组装一个卡片 iframe 的完整 srcdoc 文档。
		* 主题变量先经过 sanitizeCssValue 清洗，非法值直接丢弃。
		*/
		function buildCardDoc(options) {
			const rootVars = Object.entries(options.theme.themeVars).map(([name, value]) => [name, sanitizeCssValue(value)]).filter(([, value]) => value.length > 0).map(([name, value]) => "--qw-" + name + ": " + value + ";").join(" ");
			return "<!doctype html>\n<html lang=\"zh\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"referrer\" content=\"no-referrer\">\n<meta http-equiv=\"Content-Security-Policy\" content=\"" + CARD_CSP + "\">\n<title>" + escapeHtml(options.title) + "</title>\n<style>\nhtml,body{margin:0;padding:0;background:transparent}\n:root { " + rootVars + " color-scheme: " + options.theme.colorScheme + "; }\nbody { padding: 4px 2px; }\n</style>\n</head>\n<body>\n" + options.fragment + "\n<script>" + heightReporter(options.reportToken) + "<\/script>\n</body>\n</html>\n";
		}
		/**
		* 帧内高度上报：load 与每次 resize 后把文档高度发给父页面，
		* 父卡片据此设置 iframe 高度（sandbox 帧内文档父页面无法直接读取）。
		*/
		function heightReporter(reportToken) {
			const token = JSON.stringify(reportToken);
			return "\n(function () {\n  var post = function () {\n    parent.postMessage({\n      type: " + JSON.stringify(HEIGHT_MESSAGE_TYPE) + ",\n      token: " + token + ",\n      height: document.documentElement.scrollHeight,\n    }, '*');\n  };\n  new ResizeObserver(post).observe(document.documentElement);\n  addEventListener('load', post);\n  post();\n})();\n";
		}
		/**
		* 让一个桥接变量在样式块内保持惰性：合法的计算样式颜色不含分隔符，
		* 出现即视为畸形值，丢弃而非修复。
		*/
		function sanitizeCssValue(value) {
			const trimmed = value.trim();
			return /[;{}<>]/u.test(trimmed) ? "" : trimmed;
		}
		/** 帧 <title> 的最小 HTML 转义。 */
		function escapeHtml(text) {
			return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		}
		//#endregion
		//#region src/client/theme.ts
		/**
		* 宿主主题解析（借鉴 dsh-visualize 的桥接方式）：读取 DSH 的
		* --dsw-alias-* 设计令牌并推导明暗主题。读取点是 document.body（DSH 在
		* body 上挂令牌与深色覆盖属性），令牌缺失时返回空字符串，由外壳丢弃。
		*/
		/** 宿主设计令牌 → 帧内 --qw-* 变量。 */
		const TOKEN_BRIDGE = [
			["foreground", "--dsw-alias-label-primary"],
			["muted", "--dsw-alias-label-caption"],
			["border", "--dsw-alias-border-l2"],
			["card", "--dsw-alias-bg-layer-1"],
			["accent", "--dsw-alias-brand-primary-new-colorprimary-new-color"],
			["pop", "--dsw-alias-info-new-colorprimary-new-color"]
		];
		/** 解析桥接调色板与宿主色彩方案。 */
		function resolveTheme() {
			const computed = getComputedStyle(document.body);
			const themeVars = {};
			for (const [frameName, hostToken] of TOKEN_BRIDGE) themeVars[frameName] = computed.getPropertyValue(hostToken);
			const scheme = computed.colorScheme;
			return {
				themeVars,
				colorScheme: scheme.includes("dark") && !scheme.includes("light") ? "dark" : scheme.includes("light") && !scheme.includes("dark") ? "light" : document.body.hasAttribute("data-ds-dark-theme") ? "dark" : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
			};
		}
		//#endregion
		//#region src/client/card-view.tsx
		/**
		* 子功能 3 的渲染端：qweather_card 工具的 toolview 卡片。
		* 卡片内容来自持久化 meta 里的 fragment（会话重放逐字节还原，不依赖网络），
		* 渲染进 sandbox iframe；CSP 只允许内联样式/脚本与 data: 图片。
		*/
		const MIN_HEIGHT = 48;
		const MAX_HEIGHT = 900;
		const headerStyle = {
			display: "flex",
			alignItems: "baseline",
			gap: 8,
			fontSize: 12,
			opacity: .65,
			margin: "2px 0 6px",
			overflow: "hidden",
			whiteSpace: "nowrap"
		};
		const frameStyle = {
			display: "block",
			width: "100%",
			border: 0,
			background: "transparent",
			colorScheme: "normal"
		};
		/** 结果内容块的第一行文本（错误回退展示用）。 */
		function firstResultLine(content) {
			for (const block of content) if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
				const newline = block.text.indexOf("\n");
				return newline === -1 ? block.text : block.text.slice(0, newline);
			}
			return "weather card failed";
		}
		/** 已完成的卡片：标题行 + 自适应高度 sandbox iframe。 */
		function CardFrame({ meta, callId }) {
			const [themeTick, setThemeTick] = (0, react.useState)(0);
			const [height, setHeight] = (0, react.useState)(MIN_HEIGHT);
			(0, react.useEffect)(() => {
				const bump = () => setThemeTick((tick) => tick + 1);
				const observer = new MutationObserver(bump);
				observer.observe(document.documentElement, { attributes: true });
				observer.observe(document.body, { attributes: true });
				const media = matchMedia("(prefers-color-scheme: dark)");
				media.addEventListener("change", bump);
				return () => {
					observer.disconnect();
					media.removeEventListener("change", bump);
				};
			}, []);
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const data = event.data;
					if (typeof data !== "object" || data === null) return;
					const report = data;
					if (report.type !== "dsh-qweather:height" || report.token !== callId) return;
					if (typeof report.height !== "number" || !Number.isFinite(report.height)) return;
					setHeight(Math.max(MIN_HEIGHT, Math.min(Math.ceil(report.height), MAX_HEIGHT)));
				};
				addEventListener("message", onMessage);
				return () => removeEventListener("message", onMessage);
			}, [callId]);
			const doc = (0, react.useMemo)(() => buildCardDoc({
				fragment: meta.fragment,
				title: meta.title,
				theme: resolveTheme(),
				reportToken: callId
			}), [
				meta,
				callId,
				themeTick
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: headerStyle,
				title: meta.location,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: { fontWeight: 500 },
					children: meta.title
				}), meta.updateTime !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						overflow: "hidden",
						textOverflow: "ellipsis"
					},
					children: meta.updateTime
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				sandbox: "allow-scripts allow-popups",
				referrerPolicy: "no-referrer",
				title: meta.title,
				srcDoc: doc,
				style: {
					...frameStyle,
					height
				}
			})] });
		}
		/** qweather_card 的 toolview 入口。 */
		function QWeatherCardView({ callId, block }) {
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: headerStyle,
				children: "天气 · 渲染中…"
			});
			if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: headerStyle,
				children: ["天气 · ", firstResultLine(block.content)]
			});
			const meta = qweatherCardMetaFrom(block.meta);
			if (meta === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: headerStyle,
				children: firstResultLine(block.content)
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardFrame, {
				meta,
				callId
			});
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-qweather";
		/** 依赖服务：槽位注册表、设置命名空间、连接/远程（设置读写）、locale、侧边栏布局控制。 */
		const inject = [
			"slots",
			"settingsScope",
			"connection",
			"remote",
			"locale",
			"layout"
		];
		const zh = {
			"card.desc": "接入和风天气：侧边栏天气组件 + LLM 天气工具（qweather_weather / qweather_card）。",
			"card.unavailable": "设置服务不可用，无法读取插件配置。",
			"card.on": "已开启",
			"card.off": "已关闭",
			"card.offHint": "总开关关闭后，侧边栏组件与 LLM 天气工具都会停用。",
			"card.hostHint": "控制台 → 设置 → API Host 可查看专属服务域名；留空默认使用公共域名 devapi.qweather.com。",
			"card.showKey": "显示密钥",
			"card.projectId": "项目 ID（可选，仅记录）",
			"card.location": "位置",
			"card.auto": "自动定位（市/区级）",
			"card.manual": "手动输入",
			"card.autoHint": "用浏览器定位反查最近市/区；首次使用需要允许定位权限，失败时回退到手动位置。",
			"card.autoResolved": "已定位",
			"card.manualHint": "支持城市/区县名称、LocationID（如 101010100）或“经度,纬度”。",
			"card.save": "保存",
			"card.saving": "保存中…",
			"card.saved": "已保存",
			"card.saveFailed": "保存失败",
			"card.test": "测试连接",
			"card.testNeedKey": "请先填写 API KEY",
			"card.testOk": "连接成功",
			"card.testFail": "连接失败",
			"card.docs": "API 文档 ↗",
			"widget.loading": "天气加载中…",
			"widget.empty": "暂无天气数据",
			"widget.retry": "重试",
			"widget.refresh": "刷新天气",
			"widget.hourly": "未来 5 小时",
			"widget.updated": "更新于"
		};
		const en = {
			"card.desc": "QWeather integration: sidebar weather widget + LLM weather tools (qweather_weather / qweather_card).",
			"card.unavailable": "Settings service unavailable.",
			"card.on": "Enabled",
			"card.off": "Disabled",
			"card.offHint": "When disabled, the sidebar widget and both LLM weather tools stop.",
			"card.hostHint": "Find your dedicated API Host under Console → Settings → API Host; leave blank for the public devapi.qweather.com.",
			"card.showKey": "Show key",
			"card.projectId": "Project ID (optional, record only)",
			"card.location": "Location",
			"card.auto": "Auto-locate (city/district)",
			"card.manual": "Manual input",
			"card.autoHint": "Reverse-geocode the browser location to the nearest city/district; allow the permission prompt, falls back to the manual location on failure.",
			"card.autoResolved": "Resolved",
			"card.manualHint": "City/district name, LocationID (e.g. 101010100), or \"longitude,latitude\".",
			"card.save": "Save",
			"card.saving": "Saving…",
			"card.saved": "Saved",
			"card.saveFailed": "Save failed",
			"card.test": "Test connection",
			"card.testNeedKey": "Fill in the API KEY first",
			"card.testOk": "Connected",
			"card.testFail": "Connection failed",
			"card.docs": "API docs ↗",
			"widget.loading": "Loading weather…",
			"widget.empty": "No weather data",
			"widget.retry": "Retry",
			"widget.refresh": "Refresh weather",
			"widget.hourly": "Next 5 hours",
			"widget.updated": "Updated"
		};
		/**
		* 注册三个 UI 槽位。
		* 注：settings.plugin.item 等槽位在已发布包里的 SlotMap 类型未声明 inject 面
		* （官方卡片自身也用 inject），因此这里用窄化的 register 类型断言绕过；
		* 运行时 SlotCore 对 inject 完全支持。
		*/
		function apply(ctx) {
			ctx.effect(() => {
				const offZh = ctx.locale.register("qweather", "zh", zh);
				const offEn = ctx.locale.register("qweather", "en", en);
				return () => {
					offZh();
					offEn();
				};
			}, "qweather: dictionaries");
			const t = ctx.locale.bind("qweather");
			const scope = ctx.settingsScope.bind({ namespace: "qweather" });
			const saveAuto = (id, name) => {
				scope.set("autoLocationId", id);
				scope.set("autoLocationName", name);
			};
			const register = ctx.slots.register;
			ctx.slots.inject("settings.plugin.item", () => register({
				name: "settings.plugin.item",
				id: "qweather",
				order: 30,
				inject: () => ({
					scope,
					qw: t
				})
			}, QWeatherSettingsCard));
			ctx.slots.inject("sidebar.footer.action", () => register({
				name: "sidebar.footer.action",
				id: "qweather",
				order: 10,
				inject: () => ({
					scope,
					qw: t,
					saveAuto,
					onExpand: () => ctx.layout.toggleSidebar()
				})
			}, SidebarWeatherWidget));
			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: CARD_TOOL_NAME
			}, QWeatherCardView));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
