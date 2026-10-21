// 简单的本地持久化 store（基于 localStorage），
// 包含 设置 / 待办 / 笔记 / 通知 / AI 会话 的读写与订阅。

import type { ChatMessage, NoteItem, NotifItem, Settings, TodoItem } from "../types";

const KEY_SETTINGS = "island.settings";
const KEY_TODOS = "island.todos";
const KEY_NOTES = "island.notes";
const KEY_NOTIFS = "island.notifs";
const KEY_MSGS = "island.chatMsgs";

export const DEFAULT_SETTINGS: Settings = {
  city: "北京",
  lat: 39.9042,
  lon: 116.4074,
  units: "metric",
  use24h: true,
  accent: "#ffffff",
  showSeconds: false,
  showLyrics: true,
  showNotif: true,
  aiBaseUrl: "https://api.openai.com/v1",
  aiKey: "",
  aiModel: "gpt-4o-mini",
  aiSystem: "你是一个简洁、友好、善于用短句回答的桌面助手。回答尽量精炼。",
  lyricDemoOn: true,
  proxySubs: [],
  proxyAuto: true,
  // 各状态尺寸（逻辑 px）
  miniW: 90,
  miniH: 25,
  hoverW: 300,
  hoverH: 40,
  workStartTime: "09:00",
  workEndTime: "18:00",
  lyricW: 300,
  lyricH: 40,
  notifW: 120,
  notifH: 40,
  panelW: 560,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) } as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  const settings = read<Settings>(KEY_SETTINGS, DEFAULT_SETTINGS);
  let migrated = false;
  // 将旧默认值以及用户当前沿用的 160 宽度升级到新的歌词态宽度。
  if (settings.lyricW === 120 || settings.lyricW === 160) {
    settings.lyricW = DEFAULT_SETTINGS.lyricW;
    migrated = true;
  }
  // 新信息胶囊至少需要 220px；升级较窄的旧悬停态设置。
  if (settings.hoverW < 220) {
    settings.hoverW = DEFAULT_SETTINGS.hoverW;
    migrated = true;
  }
  if (migrated) {
    saveSettings(settings);
  }
  return settings;
}
export function saveSettings(s: Settings) {
  write(KEY_SETTINGS, s);
}

export function loadTodos(): TodoItem[] {
  return readArray<TodoItem>(KEY_TODOS);
}
export function saveTodos(t: TodoItem[]) {
  write(KEY_TODOS, t);
}

export function loadNotes(): NoteItem[] {
  return readArray<NoteItem>(KEY_NOTES);
}
export function saveNotes(n: NoteItem[]) {
  write(KEY_NOTES, n);
}

export function loadNotifs(): NotifItem[] {
  return readArray<NotifItem>(KEY_NOTIFS);
}
export function saveNotifs(n: NotifItem[]) {
  write(KEY_NOTIFS, n);
}

export function loadChatMsgs(): ChatMessage[] {
  return readArray<ChatMessage>(KEY_MSGS);
}
export function saveChatMsgs(m: ChatMessage[]) {
  write(KEY_MSGS, m);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatDate(ts: number): { week: string; date: string; md: string } {
  const d = new Date(ts);
  const week = WEEK_CN[d.getDay()];
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const date = `${d.getFullYear()}年${md}`;
  return { week, date, md };
}

export function formatTime(ts: number, use24h: boolean, showSeconds = false): string {
  const d = new Date(ts);
  let h = d.getHours();
  let suffix = "";
  if (!use24h) {
    suffix = h >= 12 ? " 下午" : " 上午";
    h = h % 12 || 12;
  }
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = showSeconds ? `:${String(d.getSeconds()).padStart(2, "0")}` : "";
  return `${h}:${mm}${ss}${suffix}`;
}
