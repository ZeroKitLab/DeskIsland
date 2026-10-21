// 全局状态管理：时钟 / 设置 / 待办 / 通知 / AI 会话 / 天气 / 歌词播放
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "../types";
import type { AppCtx } from "../ctx";
import {
  DEFAULT_SETTINGS,
  loadChatMsgs,
  loadNotifs,
  loadNotes,
  loadSettings,
  loadTodos,
  saveChatMsgs,
  saveNotifs,
  saveNotes,
  saveSettings,
  saveTodos,
  uid,
} from "../lib/store";
import { streamChat } from "../lib/ai";
import { detectLocation, fetchWeather } from "../lib/weather";
import { liveLyrics } from "../lib/lrc";
import { isTauri } from "../lib/window";
import { playbackPosition, synchronizeLivePlayer } from "../lib/playback";
import { useActiveLyricLine } from "./usePlaybackClock";

const HOVER_LAYOUT_MIGRATION_KEY = "island.hoverInfoLayoutVersion";

export function useAppState(): AppCtx {
  const [mode, setMode] = useState<BarMode>("collapsed");
  const [view, setView] = useState<View>("home");
  const [now, setNow] = useState<Date>(new Date());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos());
  const [notes, setNotes] = useState<NoteItem[]>(() => loadNotes());
  const [notifs, setNotifs] = useState<NotifItem[]>(() => loadNotifs());
  const [flash, setFlash] = useState<NotifItem | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatMsgs());
  const [busy, setBusy] = useState(false);

  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [player, setPlayer] = useState<PlayerState>({
    track: null,
    playing: false,
    pos: 0,
    base: 0,
    startedAt: 0,
    duration: 0,
    live: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const locatedRef = useRef(false);
  const liveTrackRef = useRef<LyricTrack | null>(null);
  const musicKeyRef = useRef("");
  const musicRequestIdRef = useRef(0);
  const [musicSession, setMusicSession] = useState<Omit<CurrentMusicSession, "position"> | null>(null);
  const [musicStatus, setMusicStatus] = useState("正在连接系统媒体会话…");
  const [musicLyricStatus, setMusicLyricStatus] = useState("");
  const [musicError, setMusicError] = useState("");

  // ---------- 时钟 ----------
  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      const timestamp = Date.now();
      setNow((previous) => Math.floor(previous.getTime() / 60_000) === Math.floor(timestamp / 60_000)
        ? previous : new Date(timestamp));
      // All visible clocks/countdowns show minutes; align with the next minute.
      timer = window.setTimeout(update, 60_000 - timestamp % 60_000 + 10);
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // ---------- 设置持久化 ----------
  const patchSettings = useCallback((p: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      saveSettings(next);
      return next;
    });
  }, []);
  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    saveSettings({ ...DEFAULT_SETTINGS });
  }, []);

  // 一次性将已保存的悬停宽度升级到 300px；后续仍可通过尺寸设置调整。
  useEffect(() => {
    try {
      if (localStorage.getItem(HOVER_LAYOUT_MIGRATION_KEY) === "2") return;
      localStorage.setItem(HOVER_LAYOUT_MIGRATION_KEY, "2");
    } catch {
      // localStorage 不可用时仍应用本次布局升级。
    }
    if (settings.hoverW !== 300) patchSettings({ hoverW: 300 });
  }, [settings.hoverW, patchSettings]);

  // ---------- 首次定位（可选） ----------
  useEffect(() => {
    if (locatedRef.current) return;
    locatedRef.current = true;
    const isDefault =
      Math.abs(settings.lat - DEFAULT_SETTINGS.lat) < 0.5 &&
      Math.abs(settings.lon - DEFAULT_SETTINGS.lon) < 0.5;
    if (!isDefault) return;
    detectLocation()
      .then((g) => {
        if (g) patchSettings({ city: g.name || "当前位置", lat: g.lat, lon: g.lon });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 待办 ----------
  useEffect(() => saveTodos(todos), [todos]);
  const addTodo = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setTodos((prev) => [{ id: uid("t"), text: t, done: false, createdAt: Date.now() }, ...prev]);
  }, []);
  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);
  const removeTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const clearTodos = useCallback(() => setTodos([]), []);

  // ---------- 笔记 ----------
  useEffect(() => saveNotes(notes), [notes]);
  const addNote = useCallback(() => {
    const timestamp = Date.now();
    const note: NoteItem = {
      id: uid("note"),
      title: "",
      content: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setNotes((prev) => [note, ...prev]);
    return note.id;
  }, []);
  const updateNote = useCallback((id: string, patch: Partial<Pick<NoteItem, "title" | "content">>) => {
    setNotes((prev) => prev.map((note) => note.id === id
      ? { ...note, ...patch, updatedAt: Date.now() }
      : note));
  }, []);
  const removeNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }, []);

  // ---------- 通知 ----------
  useEffect(() => saveNotifs(notifs), [notifs]);
  const unread = notifs.filter((n) => n.unread).length;

  const addNotif = useCallback((app: string, title: string, body: string) => {
    const n: NotifItem = { id: uid("n"), app, title, body, time: Date.now(), unread: true };
    setNotifs((prev) => [n, ...prev].slice(0, 40));
    setFlash(n);
  }, []);
  // 刘海条通知自动收起
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash?.id]);

  const markAllNotifsRead = useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
    setFlash(null);
  }, []);
  const clearNotifs = useCallback(() => {
    setNotifs([]);
    setFlash(null);
  }, []);

  // ---------- AI 对话 ----------
  useEffect(() => saveChatMsgs(messages), [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      const userMsg: ChatMessage = { role: "user", content, time: Date.now() };
      const history = [...messages, userMsg];
      const aiMsg: ChatMessage = { role: "assistant", content: "", time: Date.now() };
      setMessages([...history, aiMsg]);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let acc = "";
      try {
        await streamChat(
          history,
          settings,
          (d) => {
            acc += d;
            setMessages([...history, { ...aiMsg, content: acc }]);
          },
          ctrl.signal
        );
        setMessages([...history, { ...aiMsg, content: acc || "（无回复）" }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const stopped = ctrl.signal.aborted ? "已停止。" : `请求失败：${msg}`;
        const final = acc ? `${acc}\n\n${stopped}` : stopped;
        setMessages([...history, { ...aiMsg, content: final }]);
      } finally {
        setBusy(false);
      }
    },
    [messages, busy, settings]
  );

  const stopChat = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
  }, []);
  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setBusy(false);
  }, []);

  // ---------- 天气 ----------
  const refreshWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const w = await fetchWeather(settings.lat, settings.lon, settings.units, settings.city);
      setWeather(w);
    } catch (e) {
      setWeatherError(e instanceof Error ? e.message : "天气获取失败");
    } finally {
      setWeatherLoading(false);
    }
  }, [settings.lat, settings.lon, settings.units, settings.city]);

  useEffect(() => {
    if (settings.lat !== 0 || settings.lon !== 0) void refreshWeather();
  }, [refreshWeather]);

  // ---------- 歌词播放 ----------
  const playTrack = useCallback((t: LyricTrack) => {
    const duration = t.lines.length ? t.lines[t.lines.length - 1].time + 4 : 30;
    setPlayer({ track: t, playing: true, pos: 0, base: 0, startedAt: performance.now(), duration, live: false });
  }, []);

  const syncLiveTrack = useCallback((t: LyricTrack | null, position: number, playing: boolean, duration: number) => {
    setPlayer((previous) => synchronizeLivePlayer(previous, t, position, playing, duration));
  }, []);

  // ---------- Windows 实时媒体会话：此 hook 常驻，面板收起时也持续监听 ----------
  useEffect(() => {
    if (!isTauri()) {
      setMusicStatus("实时歌词需要在 Windows 桌面版中运行");
      return;
    }

    let cancelled = false;
    let polling = false;
    let timer = 0;
    let pollDelay = 5000;

    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const current = await invoke<CurrentMusicSession | null>("current_music_session");
        if (cancelled) return;
        setMusicError("");
        // Session metadata is separate from the monotonic playback clock.
        // Advancing seconds alone must not render every page in the application.
        setMusicSession((previous) => {
          if (!current) return null;
          if (previous && previous.source === current.source && previous.sourceApp === current.sourceApp
            && previous.title === current.title && previous.artist === current.artist
            && previous.playing === current.playing && previous.duration === current.duration) return previous;
          const { position: _position, ...info } = current;
          return info;
        });
        pollDelay = current ? 2000 : 5000;

        if (!current) {
          if (musicKeyRef.current) {
            musicKeyRef.current = "";
            liveTrackRef.current = null;
            musicRequestIdRef.current += 1;
            setPlayer({ track: null, playing: false, pos: 0, base: 0, startedAt: 0, duration: 0, live: false });
          }
          setMusicStatus("正在监听 QQ 音乐和网易云音乐；开始播放后会自动匹配歌词");
          setMusicLyricStatus("");
          return;
        }

        const appName = current.source === "qq" ? "QQ 音乐" : "网易云音乐";
        setMusicStatus(`${appName} · ${current.playing ? "正在播放" : "已暂停"}`);
        const key = [current.source, current.title.trim(), current.artist.trim()].join("|");
        if (key !== musicKeyRef.current) {
          musicKeyRef.current = key;
          const requestId = ++musicRequestIdRef.current;
          const track: LyricTrack = {
            id: `live:${key}`,
            name: current.title,
            artist: current.artist || "未知歌手",
            source: current.source,
            lines: [],
            hasLyric: false,
          };
          liveTrackRef.current = track;
          syncLiveTrack(track, current.position, current.playing, current.duration);
          setMusicLyricStatus("正在匹配同步歌词…");

          void liveLyrics(current.source, current.title, current.artist).then((lines) => {
            if (cancelled || requestId !== musicRequestIdRef.current) return;
            const updated = { ...track, lines, hasLyric: lines.length > 0 };
            liveTrackRef.current = updated;
            // Lyrics may arrive between native polls; retain the current clock anchor.
            setPlayer((previous) => previous.live && previous.track?.id === updated.id
              ? { ...previous, track: updated }
              : previous);
            setMusicLyricStatus(lines.length ? "同步歌词已加载" : "暂未找到这首歌的同步歌词，仍会继续监听");
          }).catch((error: unknown) => {
            if (cancelled || requestId !== musicRequestIdRef.current) return;
            const message = error instanceof Error ? error.message : String(error);
            setMusicLyricStatus(`歌词匹配失败：${message}`);
          });
        } else if (liveTrackRef.current) {
          syncLiveTrack(liveTrackRef.current, current.position, current.playing, current.duration);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setMusicError(message);
        setMusicStatus("无法读取 Windows 媒体会话");
        pollDelay = 5000;
      } finally {
        polling = false;
        if (!cancelled) timer = window.setTimeout(() => void poll(), pollDelay);
      }
    };

    const refreshOnFocus = () => {
      window.clearTimeout(timer);
      void poll();
    };
    void poll();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshOnFocus);
      musicRequestIdRef.current += 1;
    };
  }, [syncLiveTrack]);

  const togglePlay = useCallback(() => {
    setPlayer((p) => {
      if (!p.track) return p;
      if (p.playing) {
        // 暂停：固定当前位置
        const pos = playbackPosition(p);
        return { ...p, playing: false, pos, base: pos, startedAt: performance.now() };
      }
      const end = p.track.lines.length ? p.track.lines[p.track.lines.length - 1].time + 4 : 30;
      if (p.pos >= end) return { ...p, pos: 0, base: 0, startedAt: performance.now(), playing: true };
      return { ...p, playing: true, base: p.pos, startedAt: performance.now() };
    });
  }, []);

  const seekTo = useCallback((sec: number) => {
    setPlayer((p) => {
      if (!p.track) return p;
      const pos = Math.max(0, p.duration > 0 ? Math.min(sec, p.duration) : sec);
      return { ...p, pos, base: pos, startedAt: performance.now() };
    });
  }, []);

  const stopPlay = useCallback(() => {
    setPlayer({ track: null, playing: false, pos: 0, base: 0, startedAt: 0, duration: 0, live: false });
  }, []);

  // Demo playback needs only an end timer. Live progress is interpolated locally.
  useEffect(() => {
    if (!player.playing || player.live || !player.track) return;
    const timer = window.setTimeout(() => {
      setPlayer((previous) => previous === player
        ? { ...previous, playing: false, pos: previous.duration, base: previous.duration }
        : previous);
    }, Math.max(0, (player.duration - playbackPosition(player)) * 1000));
    return () => window.clearTimeout(timer);
  }, [player]);

  const activeLyricLine = useActiveLyricLine(player);

  // ---------- 导航 ----------
  const open = useCallback((v: View) => {
    setView(v);
    setMode("expanded");
  }, []);
  const collapse = useCallback(() => setMode("collapsed"), []);

  return {
    mode,
    view,
    open,
    collapse,
    now,
    settings,
    patchSettings,
    resetSettings,
    todos,
    addTodo,
    toggleTodo,
    removeTodo,
    clearTodos,
    notes,
    addNote,
    updateNote,
    removeNote,
    notifs,
    unread,
    flash,
    addNotif,
    markAllNotifsRead,
    clearNotifs,
    messages,
    busy,
    sendMessage,
    stopChat,
    clearChat,
    weather,
    weatherLoading,
    weatherError,
    refreshWeather,
    player,
    playTrack,
    togglePlay,
    seekTo,
    stopPlay,
    syncLiveTrack,
    activeLyricLine,
    musicSession,
    musicStatus,
    musicLyricStatus,
    musicError,
  };
}
