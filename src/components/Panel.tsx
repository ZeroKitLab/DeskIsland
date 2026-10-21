// 展开态面板：内容区随页面切换，导航操作悬浮在右上角
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, House } from "lucide-react";
import type { AppCtx } from "../ctx";
import HomePage from "../pages/HomePage";
import ChatPage from "../pages/ChatPage";
import WeatherPage from "../pages/WeatherPage";
import TodoPage from "../pages/TodoPage";
import NotesPage from "../pages/NotesPage";
import MusicPage from "../pages/MusicPage";
import NotificationsPage from "../pages/NotificationsPage";
import ProxyPage from "../pages/ProxyPage";
import SettingsPage from "../pages/SettingsPage";
import { applyLayout } from "../lib/window";
import { afterNextPaint, waitForElementTransitions } from "../lib/motion";

interface Props {
  ctx: AppCtx;
}

export default function Panel({ ctx }: Props) {
  const { view, open, collapse, settings } = ctx;
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const bodyRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRequestedRef = useRef(false);
  const homeHeightRef = useRef<number | null>(null);

  const handleCollapse = useCallback(() => {
    if (closeRequestedRef.current || !panelRef.current) return;
    closeRequestedRef.current = true;
    setClosing(true);
    void waitForElementTransitions(panelRef.current).then(() => {
      if (panelRef.current) collapse();
    });
  }, [collapse]);

  const handleBackOneLevel = useCallback(() => {
    if (view !== "home") {
      open("home");
    } else {
      handleCollapse();
    }
  }, [handleCollapse, open, view]);

  // Escape steps back one level: feature pages return to the console, then the console collapses.
  useEffect(() => {
    if (ctx.mode !== "expanded") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      handleBackOneLevel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ctx.mode, handleBackOneLevel]);

  // Mouse button 3 is the common browser back/side button. Use it as an in-app
  // one-level back action and suppress WebView history navigation.
  useEffect(() => {
    if (ctx.mode !== "expanded") return;
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      event.stopPropagation();
      handleBackOneLevel();
    };
    const suppressSideButtonNavigation = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("auxclick", suppressSideButtonNavigation, true);
    return () => {
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("auxclick", suppressSideButtonNavigation, true);
    };
  }, [ctx.mode, handleBackOneLevel]);

  // 切页时回到滚动顶部，避免残留上一页的滚动位置
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [view]);

  // 功能页沿用控制台的紧凑高度；页面内容在固定窗口内部滚动。
  useEffect(() => {
    if (ctx.mode !== "expanded") return;
    let cancelled = false;
    const reveal = async () => {
      await afterNextPaint();
      if (!cancelled) setEntered(true);
    };
    if (view === "home") {
      const body = bodyRef.current;
      const fit = () => {
        if (cancelled) return;
        const page = body?.querySelector<HTMLElement>(".home-page");
        if (!page) return;
        const height = page.offsetHeight;
        homeHeightRef.current = height;
        void applyLayout("expanded", { w: 0, h: 0 }, settings.panelW, height).then(reveal);
      };
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(fit);
      });
      const timer = window.setTimeout(fit, 120);
      const page = body?.querySelector<HTMLElement>(".home-page");
      let ro: ResizeObserver | null = null;
      if (page && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(fit);
        ro.observe(page);
      }
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        window.clearTimeout(timer);
        ro?.disconnect();
      };
    }

    // 第一次打开功能页也使用控制台的实测高度，避免突然拉长窗口。
    void applyLayout("expanded", { w: 0, h: 0 }, settings.panelW, homeHeightRef.current ?? 336).then(reveal);
    return () => { cancelled = true; };
  }, [ctx.mode, view, settings.panelW]);

  return (
    <div
      ref={panelRef}
      className={`panel ${entered ? "panel-entered" : ""} ${closing ? "panel-closing" : ""}`}
      style={{ ["--accent" as string]: "#ffffff" }}
    >
      <main ref={bodyRef} className="panel-body">
        <div key={view} className={`page-swap page-swap-${view}`}>
          {view === "home" && <HomePage ctx={ctx} />}
          {view === "chat" && <ChatPage ctx={ctx} />}
          {view === "weather" && <WeatherPage ctx={ctx} />}
          {view === "todo" && <TodoPage ctx={ctx} />}
          {view === "notes" && <NotesPage ctx={ctx} />}
          {view === "music" && <MusicPage ctx={ctx} />}
          {view === "notifications" && <NotificationsPage ctx={ctx} />}
          {view === "proxy" && <ProxyPage ctx={ctx} />}
          {view === "settings" && <SettingsPage ctx={ctx} />}
        </div>
      </main>

      <div className="panel-actions panel-floating-actions" onClick={(e) => e.stopPropagation()}>
        {view !== "home" && (
          <button className="icon-btn" title="回到控制台" disabled={closing} onClick={() => open("home")}>
            <House size={15} />
          </button>
        )}
        <button className="icon-btn accent" title="收起" disabled={closing} onClick={handleCollapse}>
          <ChevronDown size={16} />
        </button>
      </div>
    </div>
  );
}
