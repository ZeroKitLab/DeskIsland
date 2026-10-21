// 歌词工具：解析 LRC、通过网易云搜索并获取同步歌词。
import type { LrcLine } from "../types";

/** 解析 LRC 文本 -> 带时间戳(秒)的行 */
export function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = [];
  if (!raw) return lines;
  const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const block of raw.split(/\r?\n/)) {
    const text = block.replace(re, "").trim();
    if (!text) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(block)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
      lines.push({ time: min * 60 + sec + frac / 1000, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export interface NeteaseSong {
  id: number;
  name: string;
  artist: string;
  album?: string;
}

/** 通过 Tauri 命令代理搜索网易云歌曲（避免 CORS） */
export async function neteaseSearch(q: string): Promise<NeteaseSong[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  const text = await invoke<string>("netease_search", { q });
  const obj = JSON.parse(text);
  const songs = obj?.result?.songs;
  if (!Array.isArray(songs)) return [];
  return songs.slice(0, 12).map((s: any) => ({
    id: s.id,
    name: s.name,
    artist: (s.artists ?? s.ar ?? []).map((a: any) => a.name).join(" / ") || "未知歌手",
    album: (s.album ?? s.al)?.name,
  }));
}

/** 获取并解析同步歌词 */
export async function neteaseLyric(id: number): Promise<LrcLine[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  const text = await invoke<string>("netease_lyric", { id });
  const obj = JSON.parse(text);
  const lrc = obj?.lrc?.lyric || obj?.tlyric?.lyric || "";
  return parseLrc(lrc);
}

/** 从 QQ 音乐按曲名和歌手获取同步歌词（由 Tauri 后端代理请求）。 */
export async function qqLyric(title: string, artist: string): Promise<LrcLine[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<string>("qq_lyric", { title, artist });
  return parseLrc(raw);
}

function normalizeSongText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function isLyricNotice(text: string): boolean {
  const normalized = normalizeSongText(text);
  return normalized.includes("此歌曲为没有填词的纯音乐") || normalized === "暂无歌词" || normalized === "暂无同步歌词";
}

function usableLyrics(lines: LrcLine[]): LrcLine[] {
  return lines.filter((line) => !isLyricNotice(line.text));
}

function artistNames(value: string): string[] {
  return value
    .split(/[\/、,&，;；|+＋]+/u)
    .map(normalizeSongText)
    .filter(Boolean);
}

function artistsMatch(wanted: string, candidate: string): boolean {
  const wantedNames = artistNames(wanted);
  const candidateNames = artistNames(candidate);
  return wantedNames.some((wantedName) =>
    candidateNames.some((candidateName) =>
      candidateName.includes(wantedName) || wantedName.includes(candidateName)
    )
  );
}

async function neteaseLiveLyric(title: string, artist: string): Promise<LrcLine[]> {
  const results = await neteaseSearch(`${title} ${artist}`);
  const wantedTitle = normalizeSongText(title);
  // Search may rank a lyric-less exact title above a usable cover/live version.
  // Check several high-confidence candidates and use the first one with timed lines.
  const candidates = results
    .map((song) => {
      const name = normalizeSongText(song.name);
      const titleMatch = name === wantedTitle ? 10 : name.includes(wantedTitle) || wantedTitle.includes(name) ? 5 : 0;
      const artistMatch = artistsMatch(artist, song.artist) ? 3 : 0;
      return { song, score: titleMatch + artistMatch };
    })
    .filter((candidate) => candidate.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (!candidates.length) return [];

  const lyricResults = await Promise.all(candidates.map(async ({ song }) => {
    try {
      return await neteaseLyric(song.id);
    } catch {
      return [];
    }
  }));
  return lyricResults.map(usableLyrics).find((lines) => lines.length > 0) ?? [];
}

/** 优先从正在播放的平台取词，失败时再从另一平台按曲名查询。 */
export async function liveLyrics(
  source: "qq" | "netease",
  title: string,
  artist: string
): Promise<LrcLine[]> {
  const providers = source === "qq"
    ? [() => qqLyric(title, artist), () => neteaseLiveLyric(title, artist)]
    : [() => neteaseLiveLyric(title, artist), () => qqLyric(title, artist)];

  for (const fetchLyrics of providers) {
    try {
      const lines = usableLyrics(await fetchLyrics());
      if (lines.length) return lines;
    } catch {
      // Continue with the secondary provider when a service has no match or is unavailable.
    }
  }
  return [];
}

// ---------- 内置演示曲目（离线展示歌词效果用） ----------
export const DEMO_TRACKS: { name: string; artist: string; lrc: string }[] = [
  {
    name: "都市晚风 Demo",
    artist: "灵动岛 示例",
    lrc: `[00:00.00]城市的天际线慢慢泛起微光
[00:05.00]我把今天的天气写进清晨的窗口
[00:10.00]时间它悄悄流动在掌心里
[00:15.00]每一秒都值得被认真收藏
[00:20.00]灵动岛 点亮你的每一次归来
[00:26.00]通知与旋律都在这里轻轻停靠
[00:32.00]愿忙碌的你 记得抬头看看天
[00:38.00]风从耳边路过 带走一天的疲惫`,
  },
  {
    name: "山海之间 Demo",
    artist: "灵动岛 示例",
    lrc: `[00:00.00]穿过云层的风 带来远方的信
[00:06.00]山与海之间 住着一颗安静的心
[00:12.00]把烦恼折成纸飞机 抛向天边
[00:18.00]剩下温柔 陪你度过漫漫长夜
[00:24.00]每一句歌词都像星光
[00:30.00]落在你的眼角 轻轻的哼唱`,
  },
];
