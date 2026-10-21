// 设置页
import { useEffect, useState, type ReactNode } from "react";
import { MapPin, Minus, Plus, Power, RotateCcw } from "lucide-react";
import type { AppCtx } from "../ctx";
import type { GeoResult } from "../lib/weather";
import { searchCity } from "../lib/weather";
import { isTauri } from "../lib/window";

interface Props {
  ctx: AppCtx;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-sec">
      <h3 className="set-sec-title">{title}</h3>
      <div className="set-sec-body">{children}</div>
    </section>
  );
}

function Switch({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span className="switch-txt">
        <span>{label}</span>
        {desc && <i className="dim">{desc}</i>}
      </span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="knob" />
      </span>
    </label>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** 宽 / 高 步进调节 */
function SizeStepper({
  name,
  value,
  min,
  max,
  step = 2,
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="size-stepper">
      <span className="size-name">{name}</span>
      <button
        className="step-btn"
        aria-label={`减小${name}`}
        onClick={() => onChange(clamp(value - step, min, max))}
      >
        <Minus size={11} />
      </button>
      <span className="step-val">{value}</span>
      <button
        className="step-btn"
        aria-label={`增大${name}`}
        onClick={() => onChange(clamp(value + step, min, max))}
      >
        <Plus size={11} />
      </button>
    </span>
  );
}

/** 一个“状态”的两行：宽 + 高 */
function SizeRow({
  title,
  w,
  h,
  wRange,
  hRange,
  onW,
  onH,
}: {
  title: string;
  w: number;
  h: number;
  wRange: [number, number];
  hRange: [number, number];
  onW: (v: number) => void;
  onH: (v: number) => void;
}) {
  return (
    <div className="size-row">
      <span className="size-row-title">{title}</span>
      <div className="size-pairs">
        <SizeStepper name="宽" value={w} min={wRange[0]} max={wRange[1]} onChange={onW} />
        {hRange[1] > hRange[0] && (
          <SizeStepper name="高" value={h} min={hRange[0]} max={hRange[1]} onChange={onH} />
        )}
      </div>
    </div>
  );
}

export default function SettingsPage({ ctx }: Props) {
  const { settings, patchSettings, resetSettings, messages, todos, clearChat, clearTodos, clearNotifs } = ctx;
  const [cityInput, setCityInput] = useState("");
  const [geo, setGeo] = useState<GeoResult[] | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  useEffect(() => {
    if (!cityInput.trim()) {
      setGeo(null);
      return;
    }
    const t = setTimeout(() => {
      setGeoBusy(true);
      searchCity(cityInput)
        .then(setGeo)
        .catch(() => setGeo([]))
        .finally(() => setGeoBusy(false));
    }, 450);
    return () => clearTimeout(t);
  }, [cityInput]);

  const quit = () => {
    if (isTauri()) {
      import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().close());
    }
  };

  return (
    <div className="page settings-page">
      <Section title="外观">
        <p className="dim note">深色外观：黑色背景 + 白色文本和图标。</p>
        <Switch label="12 小时制" desc="关闭后使用 24 小时制显示时间" checked={!settings.use24h} onChange={(v) => patchSettings({ use24h: !v })} />
        <Switch label="显示秒数" checked={settings.showSeconds} onChange={(v) => patchSettings({ showSeconds: v })} />
      </Section>

      <Section title="工作时间">
        <p className="dim note">悬停岛会显示距下班倒计时、星期和气温；下班时间支持跨午夜。</p>
        <div className="work-time-grid">
          <label className="work-time-field">
            <span>上班时间</span>
            <input
              className="set-input"
              type="time"
              value={settings.workStartTime}
              onChange={(e) => patchSettings({ workStartTime: e.target.value })}
            />
          </label>
          <label className="work-time-field">
            <span>下班时间</span>
            <input
              className="set-input"
              type="time"
              value={settings.workEndTime}
              onChange={(e) => patchSettings({ workEndTime: e.target.value })}
            />
          </label>
        </div>
      </Section>

      <Section title="刘海条尺寸">
        <p className="dim note">分别调整不同状态下的刘海胶囊尺寸（逻辑像素），改动即时生效。</p>
        <div className="size-list">
          <SizeRow
            title="默认态 · 时钟"
            w={settings.miniW}
            h={settings.miniH}
            wRange={[60, 200]}
            hRange={[18, 48]}
            onW={(v) => patchSettings({ miniW: v })}
            onH={(v) => patchSettings({ miniH: v })}
          />
          <SizeRow
            title="悬停态 · 时间信息"
            w={settings.hoverW}
            h={settings.hoverH}
            wRange={[220, 320]}
            hRange={[24, 64]}
            onW={(v) => patchSettings({ hoverW: v })}
            onH={(v) => patchSettings({ hoverH: v })}
          />
          <SizeRow
            title="歌词态 · 歌名滚动"
            w={settings.lyricW}
            h={settings.lyricH}
            wRange={[80, 320]}
            hRange={[24, 64]}
            onW={(v) => patchSettings({ lyricW: v })}
            onH={(v) => patchSettings({ lyricH: v })}
          />
          <SizeRow
            title="通知态 · 软件通知"
            w={settings.notifW}
            h={settings.notifH}
            wRange={[80, 360]}
            hRange={[24, 64]}
            onW={(v) => patchSettings({ notifW: v })}
            onH={(v) => patchSettings({ notifH: v })}
          />
          <SizeRow
            title="展开面板"
            w={settings.panelW}
            h={0}
            wRange={[320, 1200]}
            hRange={[0, 0]}
            onW={(v) => patchSettings({ panelW: v })}
            onH={() => {}}
          />
        </div>
        <p className="dim note">展开面板高度会按屏幕比例自动贴合，宽度可自定义。</p>
      </Section>

      <Section title="天气">
        <div className="set-label">城市</div>
        <div className="todo-input-row">
          <input
            placeholder={settings.city}
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setCityInput((s) => s)}
          />
          <span className="icon-inline">
            <MapPin size={14} className="dim" />
          </span>
        </div>
        {geoBusy && <p className="dim note">搜索中…</p>}
        {geo && geo.length > 0 && (
          <div className="geo-list">
            {geo.map((g, i) => (
              <button
                key={i}
                className="geo-item"
                onClick={() => {
                  patchSettings({ city: g.name, lat: g.lat, lon: g.lon });
                  setCityInput("");
                  setGeo(null);
                }}
              >
                <MapPin size={12} /> {g.name}
                <span className="dim">
                  {g.admin1 ? ` · ${g.admin1}` : ""}
                  {g.country ? ` · ${g.country}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="set-label">温度单位</div>
        <div className="seg">
          <button className={settings.units === "metric" ? "on" : ""} onClick={() => patchSettings({ units: "metric" })}>
            摄氏度 °C
          </button>
          <button className={settings.units === "imperial" ? "on" : ""} onClick={() => patchSettings({ units: "imperial" })}>
            华氏度 °F
          </button>
        </div>
      </Section>

      <Section title="音乐与歌词">
        <Switch label="在刘海条显示歌词 / 歌名" desc="播放音乐时同步滚动" checked={settings.showLyrics} onChange={(v) => patchSettings({ showLyrics: v })} />
        <p className="dim note">
          歌词显示与“系统正在播放”暂未直接打通。可在「音乐 / 歌词」页搜索歌曲或使用内置示例体验效果。
        </p>
      </Section>

      <Section title="通知">
        <Switch label="通知浮现在刘海条" desc="新通知会短暂出现在顶部，6 秒后自动收起" checked={settings.showNotif} onChange={(v) => patchSettings({ showNotif: v })} />
      </Section>

      <Section title="AI 服务">
        <div className="set-label">接口地址（OpenAI 兼容）</div>
        <input className="set-input" value={settings.aiBaseUrl} onChange={(e) => patchSettings({ aiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        <div className="set-label">API Key</div>
        <input className="set-input" type="password" value={settings.aiKey} onChange={(e) => patchSettings({ aiKey: e.target.value })} placeholder="sk-…" autoComplete="off" />
        <div className="set-label">模型</div>
        <input className="set-input" value={settings.aiModel} onChange={(e) => patchSettings({ aiModel: e.target.value })} placeholder="gpt-4o-mini" />
        <div className="set-label">系统提示词</div>
        <textarea className="set-input area" rows={2} value={settings.aiSystem} onChange={(e) => patchSettings({ aiSystem: e.target.value })} />
        <p className="dim note">Key 仅保存在本机 localStorage，不会上传到任何地方。</p>
      </Section>

      <Section title="数据管理">
        <div className="btn-group">
          <button className="soft-btn" onClick={clearChat}>清空聊天（{messages.length}）</button>
          <button className="soft-btn" onClick={clearTodos}>清空待办（{todos.length}）</button>
          <button className="soft-btn" onClick={clearNotifs}>清空通知</button>
          <button className="soft-btn danger" onClick={() => { resetSettings(); }}>
            <RotateCcw size={12} /> 恢复默认设置
          </button>
        </div>
      </Section>

      <Section title="关于">
        <p className="dim">Windows 灵动岛 v0.1.0 · 基于 Tauri 2 与 React。</p>
        <div className="btn-group">
          {isTauri() && (
            <button className="soft-btn danger" onClick={quit}>
              <Power size={12} /> 退出应用
            </button>
          )}
        </div>
      </Section>
    </div>
  );
}
