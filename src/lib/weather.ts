// 天气数据：Open-Meteo（免费无需 Key）
import type { WeatherInfo } from "../types";

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}

const CODE_TEXT: Record<number, string> = {
  0: "晴",
  1: "基本晴朗",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "冻雾",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "浓毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "小阵雨",
  81: "阵雨",
  82: "强阵雨",
  85: "阵雪",
  86: "强阵雪",
  95: "雷阵雨",
  96: "雷阵雨伴冰雹",
  99: "强雷暴伴冰雹",
};

/** WMO 天气码 → 图标组（对应 lucide 图标与配色） */
export function codeKind(code: number): "sun" | "partly" | "cloud" | "rain" | "snow" | "thunder" | "fog" {
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return "partly";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if (code >= 95) return "thunder";
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return "snow";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 80 && code <= 82) return "rain";
  return "cloud";
}

export function codeText(code: number): string {
  return CODE_TEXT[code] ?? "未知";
}

export function cityLabel(r: GeoResult): string {
  return r.admin1 && r.country ? `${r.name} · ${r.admin1}` : r.name;
}

const cache = new Map<string, { data: WeatherInfo; at: number }>();

export async function fetchWeather(
  lat: number,
  lon: number,
  units: "metric" | "imperial",
  city: string
): Promise<WeatherInfo> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${units}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&forecast_days=7&timezone=auto` +
    (units === "imperial" ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "&wind_speed_unit=kmh");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`天气服务异常(${res.status})`);
  const j = (await res.json()) as any;
  const c = j.current ?? {};
  const d = j.daily ?? {};
  const daily = (d.time ?? []).map((date: string, i: number) => ({
    date,
    code: (d.weather_code ?? [])[i] ?? 0,
    text: codeText((d.weather_code ?? [])[i] ?? 0),
    max: Math.round((d.temperature_2m_max ?? [])[i] ?? 0),
    min: Math.round((d.temperature_2m_min ?? [])[i] ?? 0),
  }));

  const data: WeatherInfo = {
    city,
    temp: Math.round(c.temperature_2m ?? 0),
    feels: Math.round(c.apparent_temperature ?? 0),
    humidity: Math.round(c.relative_humidity_2m ?? 0),
    wind: Math.round(c.wind_speed_10m ?? 0),
    code: c.weather_code ?? 0,
    text: codeText(c.weather_code ?? 0),
    updatedAt: Date.now(),
    todayMax: daily[0]?.max ?? 0,
    todayMin: daily[0]?.min ?? 0,
    daily,
  };
  cache.set(key, { data, at: Date.now() });
  return data;
}

/** 城市搜索（Open-Meteo Geocoding） */
export async function searchCity(name: string): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    name
  )}&count=6&language=zh&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("城市搜索失败");
  const j = (await res.json()) as any;
  return (j.results ?? []).map((r: any) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}

/** 根据 IP 粗略定位（用于首次启动自动填充城市） */
export async function detectLocation(): Promise<GeoResult | null> {
  const tries = [
    "https://ip-api.com/json/?lang=zh-CN&fields=lat,lon,city,regionName,country",
    "https://ipapi.co/json/",
    "https://api.ip.sb/geoip",
  ];
  for (const url of tries) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const j = (await res.json()) as any;
      const lat = Number(j.lat ?? j.latitude);
      const lon = Number(j.lon ?? j.longitude ?? j.longitude ?? j.lng);
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        return {
          name: String(j.city ?? j.regionName ?? "当前位置"),
          lat,
          lon,
          country: j.country,
          admin1: j.regionName,
        };
      }
    } catch {
      /* continue */
    }
  }
  return null;
}
