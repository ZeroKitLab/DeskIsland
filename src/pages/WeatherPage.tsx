// 天气页
import { Cloud, Droplets, MapPin, RefreshCw, Thermometer, Wind, ChevronRight } from "lucide-react";
import type { AppCtx } from "../ctx";
import WIcon from "../components/WIcon";
import { codeKind } from "../lib/weather";
import { formatDate } from "../lib/store";

interface Props {
  ctx: AppCtx;
}

const weatherGlow: Record<ReturnType<typeof codeKind>, string> = {
  sun: "#e6b75c",
  partly: "#a8b9d2",
  cloud: "#aab0b7",
  rain: "#70b9df",
  snow: "#a7d7ef",
  thunder: "#b8a3e8",
  fog: "#aab9c1",
};

export default function WeatherPage({ ctx }: Props) {
  const { weather, weatherLoading, weatherError, refreshWeather, settings, open } = ctx;
  const days = weather?.daily.slice(0, 7) ?? [];
  const minTemp = days.length ? Math.min(...days.map((day) => day.min)) : 0;
  const maxTemp = days.length ? Math.max(...days.map((day) => day.max)) : 1;
  const tempRange = Math.max(1, maxTemp - minTemp);
  const degree = settings.units === "imperial" ? "°F" : "°C";

  return (
    <div className="page weather-page">
      {weather ? (
        <>
          <section
            className="weather-hero"
            style={{ ["--weather-glow" as string]: weatherGlow[codeKind(weather.code)] }}
          >
            <div className="weather-hero-top">
              <div className="weather-place">
                <button className="weather-city" onClick={() => open("settings")} title="更改城市">
                  <MapPin size={13} />
                  <span>{weather.city}</span>
                  <ChevronRight size={13} />
                </button>
                <span className="weather-date">
                  {new Intl.DateTimeFormat("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    weekday: "long",
                  }).format(new Date())}
                </span>
              </div>
              <div className="weather-tools">
                <span className="weather-updated">
                  更新于 {new Date(weather.updatedAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <button
                  className="weather-refresh"
                  onClick={() => void refreshWeather()}
                  disabled={weatherLoading}
                  title="刷新天气"
                >
                  <RefreshCw size={14} className={weatherLoading ? "spin" : ""} />
                </button>
              </div>
            </div>

            <div className="weather-hero-main">
              <div className="weather-reading">
                <div className="weather-temperature">
                  {weather.temp}<span>{degree}</span>
                </div>
                <div className="weather-condition">
                  <b>{weather.text}</b>
                  <i />
                  <span>体感 {weather.feels}{degree}</span>
                </div>
                <div className="weather-high-low">
                  <span>最高 <b>{weather.todayMax}°</b></span>
                  <span>最低 <b>{weather.todayMin}°</b></span>
                </div>
              </div>
              <div className="weather-art" aria-hidden="true">
                <span className="weather-art-ring" />
                <WIcon code={weather.code} size={62} className="weather-symbol" />
              </div>
            </div>
          </section>

          <section className="weather-stats" aria-label="天气详情">
            <div className="weather-stat">
              <div className="weather-stat-label"><Thermometer size={13} /><span>体感温度</span></div>
              <div className="weather-stat-value">{weather.feels}<small>{degree}</small></div>
            </div>
            <div className="weather-stat">
              <div className="weather-stat-label"><Droplets size={13} /><span>相对湿度</span></div>
              <div className="weather-stat-value">{weather.humidity}<small>%</small></div>
            </div>
            <div className="weather-stat">
              <div className="weather-stat-label"><Wind size={13} /><span>当前风速</span></div>
              <div className="weather-stat-value">{weather.wind}<small>{settings.units === "imperial" ? "mph" : "km/h"}</small></div>
            </div>
          </section>

          <section className="weather-forecast">
            <div className="weather-section-heading">
              <b>未来 7 天</b>
              <span>每日最高 / 最低</span>
            </div>
            <div className="weather-days">
              {days.map((day, index) => {
                const weekday = formatDate(new Date(`${day.date}T00:00:00`).getTime()).week;
                const left = ((day.min - minTemp) / tempRange) * 100;
                const width = Math.max(12, ((day.max - day.min) / tempRange) * 100);
                return (
                  <div key={day.date} className={`weather-day ${index === 0 ? "is-today" : ""}`}>
                    <span className="weather-day-name">{index === 0 ? "今天" : weekday}</span>
                    <WIcon code={day.code} size={19} />
                    <div className="weather-day-temps">
                      <b>{day.max}°</b><i>{day.min}°</i>
                    </div>
                    <div className="weather-range-track">
                      <span style={{ left: `${left}%`, width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="weather-empty">
          <span className="weather-empty-icon"><Cloud size={24} /></span>
          <b>{weatherLoading ? "正在获取天气" : "天气暂不可用"}</b>
          <span>{weatherError || "请检查网络，或先设置所在城市"}</span>
          <div className="weather-empty-actions">
            <button className="soft-btn" onClick={() => void refreshWeather()} disabled={weatherLoading}>
              <RefreshCw size={13} className={weatherLoading ? "spin" : ""} /> 刷新天气
            </button>
            <button className="soft-btn" onClick={() => open("settings")}>更改城市</button>
          </div>
        </section>
      )}
    </div>
  );
}
