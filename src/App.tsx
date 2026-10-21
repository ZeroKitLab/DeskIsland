import { useEffect, useState, type CSSProperties } from "react";
import { useAppState } from "./hooks/useAppState";
import IslandBar from "./components/IslandBar";
import Panel from "./components/Panel";

export default function App() {
  const ctx = useAppState();
  const [fade, setFade] = useState(false);

  // 进入时先渲染折叠态，再由 applyLayout 把窗口吸附到屏幕顶部
  useEffect(() => {
    const t = setTimeout(() => setFade(true), 30);
    return () => clearTimeout(t);
  }, []);

  const style = {
    ["--accent" as string]: "#ffffff",
    ["--panel-w" as string]: `${ctx.settings.panelW}px`,
  } as CSSProperties;

  // 折叠态由岛自身在固定透明窗口内居中，避免外层布局参与缩放。
  if (ctx.mode === "collapsed") return <IslandBar ctx={ctx} />;

  return (
    <div
      className={`app mode-${ctx.mode} ${fade ? "ready" : ""}`}
      style={style}
    >
      <Panel ctx={ctx} />
    </div>
  );
}
