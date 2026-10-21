// 应用全局状态上下文接口
import type {
  BarMode,
  ChatMessage,
  CurrentMusicSession,
  LyricTrack,
  NoteItem,
  NotifItem,
  PlayerState,
  Settings,
  TodoItem,
  View,
  WeatherInfo,
} from "./types";

export interface AppCtx {
  mode: BarMode;
  view: View;
  open: (v: View) => void;
  collapse: () => void;

  // 时钟
  now: Date;

  // 设置
  settings: Settings;
  patchSettings: (p: Partial<Settings>) => void;
  resetSettings: () => void;

  // 待办
  todos: TodoItem[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  clearTodos: () => void;

  // 笔记
  notes: NoteItem[];
  addNote: () => string;
  updateNote: (id: string, patch: Partial<Pick<NoteItem, "title" | "content">>) => void;
  removeNote: (id: string) => void;

  // 通知
  notifs: NotifItem[];
  unread: number;
  flash: NotifItem | null;
  addNotif: (app: string, title: string, body: string) => void;
  markAllNotifsRead: () => void;
  clearNotifs: () => void;

  // AI 对话
  messages: ChatMessage[];
  busy: boolean;
  sendMessage: (text: string) => Promise<void>;
  stopChat: () => void;
  clearChat: () => void;

  // 天气
  weather: WeatherInfo | null;
  weatherLoading: boolean;
  weatherError: string;
  refreshWeather: () => Promise<void>;

  // 音乐 / 歌词
  player: PlayerState;
  playTrack: (t: LyricTrack) => void;
  togglePlay: () => void;
  seekTo: (sec: number) => void;
  stopPlay: () => void;
  syncLiveTrack: (t: LyricTrack | null, position: number, playing: boolean, duration: number) => void;
  activeLyricLine: string | null;
  musicSession: Omit<CurrentMusicSession, "position"> | null;
  musicStatus: string;
  musicLyricStatus: string;
  musicError: string;
}
