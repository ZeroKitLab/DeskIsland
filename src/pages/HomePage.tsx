// 控制台首页：快捷功能按钮网格 + 概览
import {
  Bell,
  CloudSun,
  ListTodo,
  MessageSquareText,
  Music2,
  FileText,
  Settings2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AppCtx } from "../ctx";
import type { View } from "../types";
import { formatDate, formatTime } from "../lib/store";
import WIcon from "../components/WIcon";

interface Props {
  ctx: AppCtx;
}

export default function HomePage({ ctx }: Props) {
  const { now, settings, weather, open, todos, unread } = ctx;
  const undone = todos.filter((t) => !t.done).length;
  const { md } = formatDate(now.getTime());
  const hour = now.getHours();
  const greet = hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";

  const items: {
    key: View;
    icon: LucideIcon;
    name: string;
    desc: string;
    color: string;
    badge?: number;
  }[] = [
    {
      key: "chat",
      icon: MessageSquareText,
      name: "AI 对话",
      desc: "随时提问与闲聊",
      color: "#ffffff",
    },
    { key: "notes", icon: FileText, name: "笔记", desc: "记录想法，自动保存", color: "#ffffff" },
    { key: "weather", icon: CloudSun, name: "天气", desc: weather ? `${weather.city} ${weather.temp}°` : "查看天气", color: "#ffffff" },
    { key: "todo", icon: ListTodo, name: "待办事项", desc: undone ? `${undone} 项待完成` : "暂无待办", color: "#ffffff", badge: undone || undefined },
    { key: "music", icon: Music2, name: "音乐 / 歌词", desc: "同步显示到刘海条", color: "#ffffff" },
    { key: "notifications", icon: Bell, name: "通知", desc: unread ? `${unread} 条未读` : "查看通知记录", color: "#ffffff", badge: unread || undefined },
    { key: "proxy", icon: Zap, name: "加速器", desc: "订阅接入 · 系统代理", color: "#ffffff" },
    { key: "settings", icon: Settings2, name: "设置", desc: "外观 / AI / 城市", color: "#ffffff" },
  ];

  return (
    <div className="home-page">
      <div className="home-hero">
        <div>
          <div className="home-greet">{greet}</div>
          <div className="home-time">
            {formatTime(now.getTime(), settings.use24h)} · {md}
          </div>
        </div>
        <div className="home-weather-mini">
          {weather ? (
            <>
              <WIcon code={weather.code} size={26} className="big" />
              <div className="home-wt-main">
                <span className="home-wt-temp">{weather.temp}°</span>
                <span className="home-wt-text">
                  {weather.text} {weather.todayMax}°/{weather.todayMin}°
                </span>
              </div>
            </>
          ) : (
            <span className="dim">天气加载中…</span>
          )}
        </div>
      </div>

      <div className="console-grid">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button key={it.key} className="console-card" onClick={() => open(it.key)}>
              <span className="console-ic" style={{ color: it.color, background: `${it.color}1f` }}>
                <Icon size={18} strokeWidth={2} />
                {it.badge ? <i className="console-badge">{it.badge > 99 ? "99+" : it.badge}</i> : null}
              </span>
              <span className="console-txt">
                <span className="console-name">{it.name}</span>
                <span className="console-desc">{it.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
