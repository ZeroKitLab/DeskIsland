// 全局公共类型定义

export type View =
  | "home" // 控制台首页
  | "chat" // AI 对话
  | "notes" // 笔记
  | "weather" // 天气
  | "todo" // 待办事项
  | "music" // 音乐 / 歌词
  | "notifications" // 通知中心
  | "proxy" // 加速器（网络代理）
  | "settings"; // 设置

export type BarMode = "collapsed" | "expanded";

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotifItem {
  id: string;
  app: string; // 来源应用名
  title: string;
  body: string;
  time: number;
  unread: boolean;
}

/** 加速器订阅 */
export interface ProxySub {
  id: string;
  url: string; // 订阅链接（Clash / base64 / 分享链接 均可，由内核解析）
  name: string; // 显示名
}

export interface Settings {
  city: string;
  lat: number;
  lon: number;
  units: "metric" | "imperial";
  use24h: boolean;
  accent: string;
  showSeconds: boolean;
  showLyrics: boolean;
  showNotif: boolean;
  aiBaseUrl: string;
  aiKey: string;
  aiModel: string;
  aiSystem: string;
  lyricDemoOn: boolean;
  // 加速器
  proxySubs: ProxySub[]; // 订阅列表
  proxyAuto: boolean; // true=自动选优节点，false=手动选择节点
  // 各状态尺寸（逻辑 px）：折叠刘海条的四种形态 + 展开面板
  miniW: number;
  miniH: number;
  hoverW: number;
  hoverH: number;
  workStartTime: string;
  workEndTime: string;
  lyricW: number;
  lyricH: number;
  notifW: number;
  notifH: number;
  panelW: number; // 展开面板宽度（高度按屏幕自动）
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: number;
}

export interface WeatherInfo {
  city: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  code: number;
  text: string;
  updatedAt: number;
  todayMax: number;
  todayMin: number;
  daily: { date: string; code: number; text: string; max: number; min: number }[];
}

export interface LrcLine {
  time: number; // 秒
  text: string;
}

export interface LyricTrack {
  id: string;
  name: string;
  artist: string;
  source: "qq" | "netease" | "demo";
  lines: LrcLine[];
  hasLyric: boolean;
}

export interface PlayerState {
  track: LyricTrack | null;
  playing: boolean;
  pos: number; // 当前播放位置(秒)
  base: number; // 内部：暂停时保存的基准
  startedAt: number; // 内部：本次播放的单调时钟 performance.now() (ms)
  duration: number;
  live: boolean;
}

/** 当前从 Windows 系统媒体会话读取到的 QQ 音乐 / 网易云音乐状态 */
export interface CurrentMusicSession {
  source: "qq" | "netease";
  sourceApp: string;
  title: string;
  artist: string;
  playing: boolean;
  position: number;
  duration: number;
}
