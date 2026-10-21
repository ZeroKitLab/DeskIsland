// 折叠态“灵动岛”：
// 默认态为极小胶囊（时间）；当鼠标悬停 / 来通知 / 播放歌词时，
// 切换成更宽的多功能胶囊，按需展示悬停信息 / 滚动通知 / 歌名+滚动歌词。
// 四种状态的尺寸由设置页自定义。
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppCtx } from "../ctx";
import { formatDate, formatTime } from "../lib/store";
import { applyLayout, isTauri } from "../lib/window";
import { waitForElementTransitions } from "../lib/motion";

type Shape = "mini" | "hover" | "lyric" | "notif";

interface Props {
  ctx: AppCtx;
}

type IslandContentProps = Pick<AppCtx, "settings" | "flash" | "activeLyricLine" | "open"> & {
  timestamp: number;
  trackName: string | null;
  temperature: number | null;
};

const NUMBER_REVEAL_DELAY_MS = 100;
const POINTER_LEAVE_GRACE_MS = 120;

function minutesOfDay(value: string, fallback: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || fallback);
  if (!match) return minutesOfDay(fallback, fallback);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return minutesOfDay(fallback, fallback);
  return hours * 60 + minutes;
}

function formatWorkCountdown(now: Date, startTime: string, endTime: string): string {
  const start = minutesOfDay(startTime, "09:00");
  const end = minutesOfDay(endTime, "18:00");
  const current = now.getHours() * 60 + now.getMinutes();
  const overnight = end <= start;

  if (!overnight && current >= end) return "今日已下班";

  const endDate = new Date(now);
  const [endHour, endMinute] = [Math.floor(end / 60), end % 60];
  endDate.setHours(endHour, endMinute, 0, 0);
  if (overnight && (current >= start || current >= end)) {
    endDate.setDate(endDate.getDate() + 1);
  }

  const remainingMinutes = Math.ceil((endDate.getTime() - now.getTime()) / 60_000);
  if (remainingMinutes <= 0) return "今日已下班";
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `距下班 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function cursorWithinIsland(element: HTMLElement | null): Promise<boolean> {
  if (!element) return false;
  if (!isTauri()) return element.matches(":hover");

  try {
    const { currentMonitor, cursorPosition, getCurrentWindow } = await import(
      "@tauri-apps/api/window"
    );
    const win = getCurrentWindow();
    const [position, monitor, cursor] = await Promise.all([
      win.outerPosition(),
      currentMonitor(),
      cursorPosition(),
    ]);
    const scale = monitor?.scaleFactor || window.devicePixelRatio || 1;
    const rect = element.getBoundingClientRect();
    const width = rect.width * scale;
    const height = rect.height * scale;
    const left = position.x + rect.left * scale;
    const top = position.y + rect.top * scale;
    const padding = 2 * scale;

    return (
      cursor.x >= left - padding &&
      cursor.x <= left + width + padding &&
      cursor.y >= top - padding &&
      cursor.y <= top + height + padding
    );
  } catch {
    return false;
  }
}

/** 恒速跑马灯：文字溢出时先停留 leadMs 让人看清开头，再平滑滚到末尾 */
const RollText = memo(function RollText({
  text,
  leadMs = 3000,
  fadeOnChange = false,
}: {
  text: string;
  leadMs?: number;
  fadeOnChange?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(text);
  const [fadePhase, setFadePhase] = useState<"in" | "out">("in");
  const [overflow, setOverflow] = useState(false);
  const [phase, setPhase] = useState<"lead" | "run">("lead");

  useEffect(() => {
    if (text === displayText) return;
    if (!fadeOnChange) {
      setDisplayText(text);
      return;
    }

    setFadePhase("out");
    const timer = window.setTimeout(() => {
      setDisplayText(text);
      setFadePhase("in");
    }, 150);
    return () => window.clearTimeout(timer);
  }, [text, displayText, fadeOnChange]);

  // 测量是否溢出：等容器宽度稳定（窗口从默认切到胶囊后）再测一次
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const box = boxRef.current;
      const inner = innerRef.current;
      if (!box || !inner) return;
      inner.style.transition = "none";
      inner.style.transform = "translateX(0)";
      setPhase("lead");
      setOverflow(false);
      setOverflow(inner.scrollWidth > box.clientWidth + 1);
    };
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(measure);
    });
    return () => cancelAnimationFrame(raf);
  }, [displayText]);

  // 停留 leadMs 后一次性滚动到末尾（只滚一次，不循环）
  useEffect(() => {
    if (!overflow) return;
    if (phase !== "lead") return;
    const t = setTimeout(() => {
      const box = boxRef.current;
      const inner = innerRef.current;
      if (!box || !inner) return;
      const dist = inner.scrollWidth - box.clientWidth + 12;
      if (dist <= 0) return;
      inner.style.transition = `transform ${Math.max(1600, dist * 14)}ms linear`;
      inner.style.transform = `translateX(${-dist}px)`;
      setPhase("run");
    }, leadMs);
    return () => clearTimeout(t);
  }, [overflow, phase, displayText, leadMs]);

  return (
    <div className={`bar-line ${fadeOnChange ? `lyric-line-fade-${fadePhase}` : ""}`} ref={boxRef}>
      <div className="roll-track" ref={innerRef}>
        {displayText}
      </div>
    </div>
  );
});

const IslandContent = memo(function IslandContent({
  settings, timestamp, flash, trackName, activeLyricLine, temperature, open,
}: IslandContentProps) {
  const [hovered, setHovered] = useState(false);
  const [numbersReady, setNumbersReady] = useState(true);

  // 内容优先级：通知 > 歌词 > 悬停 > 默认
  const showNotif = settings.showNotif && !!flash;
  const showLyric = settings.showLyrics && trackName !== null && !!activeLyricLine;
  const shape: Shape = showNotif ? "notif" : showLyric ? "lyric" : hovered ? "hover" : "mini";

  // 各状态尺寸来自设置（默认：mini 90×25，悬停 / 歌词 300×40）
  const SIZE: Record<Shape, { w: number; h: number }> = {
    mini: { w: settings.miniW, h: settings.miniH },
    hover: { w: settings.hoverW, h: settings.hoverH },
    lyric: { w: settings.lyricW, h: settings.lyricH },
    notif: { w: settings.notifW, h: settings.notifH },
  };
  const cur = SIZE[shape];
  const previousSizeRef = useRef(cur);
  const [displaySize, setDisplaySize] = useState(cur);
  const barRef = useRef<HTMLDivElement>(null);

  // 自定义拖拽：按住拖动移动刘海，轻点展开
  const dragState = useRef({ active: false, pointerId: -1, startX: 0, startY: 0, moved: false });
  const hoverOn = useRef(false);
  const leaveTimerRef = useRef<number | null>(null);
  const leaveGenerationRef = useRef(0);

  // 为所有胶囊状态预留固定透明窗口，状态切换只改变内部岛的尺寸。
  // 避免原生 WebView 在动画起止时调整尺寸，造成黑色背景闪烁。
  const surfaceW = Math.max(SIZE.mini.w, SIZE.hover.w, SIZE.lyric.w, SIZE.notif.w);
  const surfaceH = Math.max(SIZE.mini.h, SIZE.hover.h, SIZE.lyric.h, SIZE.notif.h);
  useLayoutEffect(() => {
    void applyLayout("collapsed", { w: surfaceW, h: surfaceH });
  }, [surfaceW, surfaceH]);

  // Only the black shell animates; native geometry stays fixed throughout hover.
  useLayoutEffect(() => {
    const previous = previousSizeRef.current;
    previousSizeRef.current = cur;
    const changed = cur.w !== previous.w || cur.h !== previous.h;

    if (!changed) return;

    setNumbersReady(false);
    setDisplaySize({ ...cur });
    let cancelled = false;
    let revealTimer: number | null = null;

    void (async () => {
      const bar = barRef.current;
      if (!bar) return;
      await waitForElementTransitions(bar);
      if (cancelled) return;

      revealTimer = window.setTimeout(() => {
        if (!cancelled) setNumbersReady(true);
      }, NUMBER_REVEAL_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (revealTimer !== null) window.clearTimeout(revealTimer);
    };
  }, [cur.w, cur.h]);

  const handleDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    dragState.current = {
      active: true, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY, moved: false,
    };
  };
  const handleMove = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.active || s.pointerId !== e.pointerId || (e.buttons & 1) === 0) return;
    if (!s.moved && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > 6) {
      s.moved = true;
      s.active = false;
      if (isTauri()) {
        import("@tauri-apps/api/window").then((m) =>
          m.getCurrentWindow().startDragging().catch(() => {})
        );
      }
    }
  };
  const handleUp = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.active || s.pointerId !== e.pointerId || e.button !== 0) return;
    s.active = false;
    if (!s.moved) open("home");
  };

  const handleEnter = () => {
    leaveGenerationRef.current += 1;
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (hoverOn.current) return;
    hoverOn.current = true;
    setHovered(true);
  };
  const handleLeave = () => {
    const generation = ++leaveGenerationRef.current;
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);

    // 短暂离开时稍作等待，并按实际岛的边界和桌面光标位置确认。
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      void (async () => {
        if (leaveGenerationRef.current !== generation) return;

        const withinIsland = await cursorWithinIsland(barRef.current);
        if (leaveGenerationRef.current !== generation) return;
        if (withinIsland) return;

        hoverOn.current = false;
        setHovered(false);
      })();
    }, POINTER_LEAVE_GRACE_MS);
  };

  useEffect(() => {
    return () => {
      leaveGenerationRef.current += 1;
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const timeStr = formatTime(timestamp, settings.use24h, false);
  const { week } = formatDate(timestamp);
  const workCountdown = formatWorkCountdown(new Date(timestamp), settings.workStartTime, settings.workEndTime);
  const radius = Math.min(Math.round(displaySize.w / 2), Math.max(10, Math.round(displaySize.h * 0.72)));

  return (
    <div
      ref={barRef}
      className={`island-bar shape-${shape} ${numbersReady ? "numbers-ready" : ""}`}
      style={{ width: displaySize.w, height: displaySize.h, borderRadius: `0 0 ${radius}px ${radius}px` }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => { dragState.current.active = false; }}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {shape === "mini" && (
        <div className="mini-clock">
          <span className="mini-time">{timeStr}</span>
        </div>
      )}

      {shape === "hover" && (
        <div className="hover-block">
          <span className="hover-time">{timeStr}</span>
          <div className="hover-info-pill">
            <span className="hover-countdown">{workCountdown}</span>
            <span className="hover-meta">
              <span>{week}</span>
              {temperature !== null && (
                <>
                  <span className="hover-meta-separator">·</span>
                  <span>{temperature}°</span>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {shape === "lyric" && trackName !== null && (
        <div className="lyric-block">
          <span className="lyric-song">{trackName}</span>
          <div className="lyric-scroll">
            <RollText text={activeLyricLine || ""} leadMs={1600} fadeOnChange />
          </div>
        </div>
      )}

      {shape === "notif" && flash && (
        <div className="notif-block">
          <span className="notif-app">{flash.app}：</span>
          <div className="notif-scroll">
            <RollText
              key={flash.id}
              text={[flash.title, flash.body].filter(Boolean).join(" ")}
              leadMs={3000}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default function IslandBar({ ctx }: Props) {
  // Playback position and status change more often than the visible lyric. Pass
  // only displayed values so those updates do not reconcile the island again.
  return (
    <IslandContent
      settings={ctx.settings}
      timestamp={Math.floor(ctx.now.getTime() / 60_000) * 60_000}
      flash={ctx.flash}
      trackName={ctx.player.track?.name ?? null}
      activeLyricLine={ctx.activeLyricLine}
      temperature={ctx.weather ? Math.round(ctx.weather.temp) : null}
      open={ctx.open}
    />
  );
}
