// Tauri 窗口布局控制：
// 让主窗口始终保持“吸附在屏幕顶部中央”的刘海形态，
// 折叠态为小刘海条，展开态为自上而下生长的大面板。

import type { BarMode } from "../types";

// 默认尺寸（设置里可覆盖）
export const BAR_W = 90;
export const BAR_H = 25;
export const ACTIVE_W = 120;
export const ACTIVE_H = 40;
export const PANEL_W = 560;
const PANEL_MAX_RATIO = 0.8; // 相对工作区高度的上限
const PANEL_H_MAX = 640;
const PANEL_H_MIN = 480;
const PANEL_FIT_MIN = 220; // 按内容贴合面板时允许的最小高度
const MARGIN_X = 12;

// Retain the physical center across resizes; repeated DPI rounding must not move it.
let centerX: number | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type MonitorInfo = {
  scaleFactor: number;
  x: number; // 物理
  y: number;
  width: number; // 物理
  height: number;
};

async function getMonitor(): Promise<MonitorInfo | null> {
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const mon = await currentMonitor();
    if (!mon) return null;
    return {
      scaleFactor: mon.scaleFactor || 1,
      x: mon.position.x,
      y: mon.position.y,
      width: mon.size.width,
      height: mon.size.height,
    };
  } catch {
    return null;
  }
}

/** 展开面板的尺寸（逻辑像素） */
async function getPanelLogicalHeight(mon: MonitorInfo): Promise<number> {
  const sf = mon.scaleFactor || 1;
  const workH = mon.height / sf;
  return Math.round(Math.min(PANEL_H_MAX, Math.max(PANEL_H_MIN, workH * PANEL_MAX_RATIO)));
}

/**
 * 依据“折叠/展开”调整窗口尺寸并保持在屏幕顶部。
 * 首次布局：水平居中于显示器；之后：以当前中心点为水平锚点（即用户拖过就跟随用户）。
 * 折叠态：使用 collapse（默认极小时间条；由调用方传入悬停/通知/歌词等胶囊尺寸）。
 * 展开态：宽度使用 panelW；高度默认按屏幕比例自动，传入 fitH>0 时改为“贴合内容高度”（如控制台）。
 *
 * 所有布局调用按队列串行执行：悬停/离开等快速切换产生的多次调整，
 * 不会读到“宽度已改、位置尚未同步”的中间态，从而避免以错误中心为锚点导致的偏移。
 */
type LayoutRequest = {
  mode: BarMode;
  collapse: { w: number; h: number };
  panelW: number;
  fitH: number;
};

// Only the latest pending geometry matters. Dropping stale hover/leave requests
// prevents the native window from replaying an obsolete size after the pointer moved.
let pendingLayout: LayoutRequest | null = null;
let layoutRunner: Promise<void> | null = null;

function drainLayoutQueue(): Promise<void> {
  if (layoutRunner) return layoutRunner;

  layoutRunner = (async () => {
    while (pendingLayout) {
      const request = pendingLayout;
      pendingLayout = null;
      await runLayout(request.mode, request.collapse, request.panelW, request.fitH);
    }
  })().finally(() => {
    layoutRunner = null;
    if (pendingLayout) void drainLayoutQueue();
  });

  return layoutRunner;
}

/** Native client dimensions retain fractional logical pixels at 125%/150% DPI. */
export async function getWindowLogicalSize(): Promise<{ w: number; h: number }> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const [size, monitor] = await Promise.all([getCurrentWindow().outerSize(), getMonitor()]);
  const scale = monitor?.scaleFactor || window.devicePixelRatio || 1;
  return { w: size.width / scale, h: size.height / scale };
}

// 最近一次实际下发的窗口几何（物理像素）。几何没变就跳过，
// 避免悬停/离开等对同一尺寸的重复调用产生多余的“移动 + 缩放”重绘。
let lastBounds: { x: number; y: number; w: number; h: number } | null = null;

export function applyLayout(
  mode: BarMode,
  collapse: { w: number; h: number } = { w: BAR_W, h: BAR_H },
  panelW = PANEL_W,
  fitH = 0
): Promise<void> {
  pendingLayout = { mode, collapse: { ...collapse }, panelW, fitH };
  return drainLayoutQueue();
}

async function runLayout(
  mode: BarMode,
  collapse: { w: number; h: number },
  panelW: number,
  fitH: number
) {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { invoke } = await import("@tauri-apps/api/core");
    const win = getCurrentWindow();
    const mon = await getMonitor();
    if (!mon) return;

    const sf = mon.scaleFactor || 1;
    // 展开高度：默认按屏幕比例（contentFit=0）；contentFit>0 时贴合内容高度，但不超过比例上限
    const baseH = await getPanelLogicalHeight(mon);
    const height =
      mode === "expanded"
        ? fitH > 0
          ? Math.round(Math.min(baseH, Math.max(PANEL_FIT_MIN, fitH)))
          : baseH
        : collapse.h;
    const size =
      mode === "expanded" ? { width: panelW, height } : { width: collapse.w, height: collapse.h };

    const [cur, pos] = await Promise.all([win.outerSize(), win.outerPosition()]);
    if (centerX === null) {
      centerX = mon.x + mon.width / 2;
    } else if (lastBounds && (pos.x !== lastBounds.x || pos.y !== lastBounds.y)) {
      // An external move, such as dragging, establishes the next horizontal anchor.
      centerX = pos.x + cur.width / 2;
    }

    // Round outward so the window never clips a fractional final CSS pixel.
    const pw = Math.max(1, Math.ceil(size.width * sf - 1e-6));
    const ph = Math.max(1, Math.ceil(size.height * sf - 1e-6));
    const margin = Math.round(MARGIN_X * sf);
    const px = Math.round(Math.max(
      mon.x + margin,
      Math.min(centerX - pw / 2, mon.x + mon.width - pw - margin)
    ));
    const py = mon.y;

    if (pos.x !== px || pos.y !== py || cur.width !== pw || cur.height !== ph) {
      // Promise.all(setPosition, setSize) still issues TWO independent native
      // operations. Windows must receive the position and size atomically.
      await invoke("set_window_bounds", { x: px, y: py, width: pw, height: ph });
    }
    lastBounds = { x: px, y: py, w: pw, h: ph };
  } catch (e) {
    lastBounds = null;
    console.warn("applyLayout failed", e);
  }
}
