// 加速器页：内核状态 / 一键启停 / 订阅管理 / 自动-手动策略 / 节点测速与切换
// 后端由 mihomo(Clash.Meta) sidecar + Windows 系统代理实现（src-tauri/src/proxy.rs）
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Gauge,
  Play,
  Power,
  RefreshCw,
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import type { AppCtx } from "../ctx";
import { isTauri } from "../lib/window";
import { uid } from "../lib/store";
import * as px from "../lib/proxy";

interface Props {
  ctx: AppCtx;
}

type Snapshot = {
  manualAll: string[];
  manualNow: string;
  autoNow: string;
  nowDelay: number | null;
};

// 内置内核缺失时的备用下载地址（Windows x64，兼容旧安装）。
const DEFAULT_CORE_URL =
  "https://github.com/MetaCubeX/mihomo/releases/download/v1.19.32/mihomo-windows-amd64-v1-v1.19.32.zip";

export default function ProxyPage({ ctx }: Props) {
  const { settings, patchSettings } = ctx;
  const subs = settings.proxySubs;

  const [st, setSt] = useState<px.ProxyStatus | null>(null);
  const [statusErr, setStatusErr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [dlState, setDlState] = useState<"idle" | "downloading" | "done">("idle");
  const [pct, setPct] = useState(0);
  const [downUrl, setDownUrl] = useState(DEFAULT_CORE_URL);
  const [subUrl, setSubUrl] = useState("");
  const [subName, setSubName] = useState("");
  const [testing, setTesting] = useState(false);

  const running = !!st?.running;
  const sysOn = !!st?.sys_on;

  // ---- 状态轮询 ----
  const refresh = useCallback(async () => {
    try {
      const s = await px.proxyStatus();
      setSt(s);
      setStatusErr("");
      return s;
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const refreshNodes = useCallback(async () => {
    try {
      const j = (await px.proxyApiJson("GET", "/proxies")) as {
        proxies?: Record<string, Record<string, unknown> & {
          type?: string;
          now?: string;
          all?: string[];
          history?: { delay?: number }[];
        }>;
      };
      const map = j.proxies ?? {};
      const manual = map["手动"];
      const auto = map["自动"];
      const manualAll = (manual?.all as string[]) ?? [];
      const manualNow = manual?.now ?? "";
      const autoNow = auto?.now ?? "";
      const hist = manual?.history as { delay?: number }[] | undefined;
      const nowDelay =
        hist && hist.length ? (hist[hist.length - 1].delay ?? null) : null;
      setSnap({ manualAll, manualNow, autoNow, nowDelay });
    } catch {
      /* 尚未就绪时忽略 */
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void refresh();
    const t = setInterval(() => {
      void refresh().then((s) => {
        if (s?.running) void refreshNodes();
      });
    }, 3000);
    return () => clearInterval(t);
  }, [refresh, refreshNodes]);

  // ---- 启停 ----
  const start = async () => {
    if (!subs.length) {
      setErr("请先添加至少一条订阅");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const version = await px.proxyStart(subs.map((s) => s.url), settings.proxyAuto);
      await px.proxySys(true);
      setSt(await px.proxyStatus());
      if (version) setErr("");
      await refreshNodes();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setErr("");
    try {
      await px.proxySys(false).catch(() => {});
      await px.proxyStop();
      setSt(await px.proxyStatus());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- 策略切换（自动/手动）会重启内核以更新规则 ----
  const switchStrategy = async (auto: boolean) => {
    patchSettings({ proxyAuto: auto });
    if (running) {
      setBusy(true);
      setErr("");
      try {
        const version = await px.proxyStart(subs.map((s) => s.url), auto);
        setSt(await px.proxyStatus());
        await refreshNodes();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }
  };

  // ---- 订阅管理 ----
  const addSub = () => {
    const url = subUrl.trim();
    if (!url) {
      setErr("请输入订阅链接");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setErr("订阅链接需以 http:// 或 https:// 开头");
      return;
    }
    patchSettings({
      proxySubs: [
        ...subs,
        { id: uid("sub"), url, name: subName.trim() || `订阅 ${subs.length + 1}` },
      ],
    });
    setSubUrl("");
    setSubName("");
    setErr("");
  };
  const removeSub = (id: string) => {
    patchSettings({ proxySubs: subs.filter((s) => s.id !== id) });
  };

  // ---- 内核下载 ----
  const installCore = async () => {
    setDlState("downloading");
    setPct(0);
    setErr("");
    try {
      const ver = await px.proxySetupCore(downUrl, setPct);
      setDlState("done");
      await refresh();
    } catch (e) {
      setDlState("idle");
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- 节点操作 ----
  const pickNode = async (node: string) => {
    setErr("");
    try {
      await px.proxySelectGroup("手动", node);
      await refreshNodes();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const testNow = async () => {
    if (!snap) return;
    const target = settings.proxyAuto && snap.autoNow ? snap.autoNow : snap.manualNow;
    if (!target) {
      setErr("当前无可用节点，请检查订阅");
      return;
    }
    setTesting(true);
    setErr("");
    try {
      const d = await px.proxyDelay(target);
      setSnap((s) => (s ? { ...s, nowDelay: d } : s));
    } catch (e) {
      setErr(`测速失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  if (!isTauri()) {
    return (
      <div className="page">
        <div className="empty-state">
          <Zap size={26} />
          加速器需要 Tauri 桌面端运行（npm run desktop:dev）。
        </div>
      </div>
    );
  }

  return (
    <div className="page proxy-page">
      {/* 状态卡 */}
      <section className="proxy-card">
        <div className="proxy-top">
          <div className="proxy-id">
            <span className={`pdot ${running ? "on" : ""}`} />
            <b>{running ? "已连接" : "未运行"}</b>
            <i className="dim">
              {st?.version
                ? st.version
                : st
                  ? st.core_exists
                    ? st.core_bundled ? "内核已内置" : "内核已安装"
                    : "内核未安装"
                  : statusErr
                    ? "状态检测失败"
                    : "正在检测…"}
            </i>
          </div>
          <button
            className={`proxy-master ${running ? "on" : ""}`}
            disabled={busy}
            onClick={running ? stop : start}
          >
            {running ? <Square size={14} /> : <Play size={14} />}
            {running ? "停止加速" : "开始加速"}
          </button>
        </div>
        <div className="proxy-meta">
          <span>
            本地代理端口 <b>127.0.0.1:{st?.port ?? 7890}</b>
          </span>
          <span>
            系统代理 <b className={sysOn ? "ok" : ""}>{sysOn ? "已开启" : "关闭"}</b>
          </span>
        </div>
        {statusErr && <div className="proxy-err">读取内核状态失败：{statusErr}</div>}
        {err && <div className="proxy-err">{err}</div>}
        {running && !snap?.manualAll.length && (
          <div className="dim note">正在解析订阅节点…（可能需要数十秒）</div>
        )}
      </section>

      {/* 安装包内置内核缺失时的恢复入口 */}
      {!st?.core_exists && (
        <section className="set-sec">
          <h3 className="set-sec-title">修复内核</h3>
          <div className="set-sec-body">
            <p className="dim note">
              正式安装包已包含 mihomo 内核。若仍显示缺失，可重新安装应用，或填写 Windows x64 的 .zip
              下载地址；手动安装时，将文件命名为 mihomo.exe，放入下方目录后点“重新检测”。
            </p>
            <div className="todo-input-row">
              <input
                value={downUrl}
                onChange={(e) => setDownUrl(e.target.value)}
                spellCheck={false}
                placeholder="内核 .zip 下载地址"
              />
              <span className="icon-inline">
                <Download size={14} className="dim" />
              </span>
            </div>
            <div className="btn-group">
              <button className="soft-btn" disabled={dlState === "downloading"} onClick={installCore}>
                {dlState === "downloading" ? (
                  <>
                    <RefreshCw size={12} className="spin" /> 下载中…
                  </>
                ) : (
                  <>
                    <Download size={12} /> {dlState === "done" ? "重新下载" : "下载并安装"}
                  </>
                )}
              </button>
              <button
                className="soft-btn"
                onClick={() => void px.proxyOpenDir().catch((e) => setErr(String(e)))}
              >
                <FolderOpen size={12} /> 打开内核目录
              </button>
              <button className="soft-btn" disabled={busy} onClick={() => void refresh()}>
                <RefreshCw size={12} /> 重新检测
              </button>
            </div>
            {dlState === "downloading" && (
              <div className="dl-bar">
                <i style={{ width: `${Math.round(pct * 100)}%` }} />
              </div>
            )}
            <p className="dim note">内核目录：{st?.core_dir ?? "正在读取…"}</p>
            {st?.core_path && <p className="dim note">检测到：{st.core_path}</p>}
          </div>
        </section>
      )}

      {/* 订阅管理 */}
      <section className="set-sec">
        <h3 className="set-sec-title">订阅管理</h3>
        <div className="set-sec-body">
          <p className="dim note">
            支持 Clash / base64（v2rayN 类）订阅链接。启动时由内核拉取解析；之后按 24
            小时间隔自动刷新。修改订阅后重新“停止→开始”即可生效。
          </p>
          {subs.map((s, i) => (
            <div className="proxy-sub-row" key={s.id}>
              <span className="proxy-sub-idx">{i + 1}</span>
              <div className="proxy-sub-txt">
                <span>{s.name}</span>
                <i className="dim">{s.url}</i>
              </div>
              <button className="icon-btn small" title="删除" onClick={() => removeSub(s.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="set-label">名称（可选）</div>
          <input
            className="set-input"
            value={subName}
            placeholder={`订阅 ${subs.length + 1}`}
            onChange={(e) => setSubName(e.target.value)}
          />
          <div className="set-label">订阅链接</div>
          <div className="todo-input-row">
            <input
              value={subUrl}
              placeholder="https://example.com/sub"
              spellCheck={false}
              onChange={(e) => setSubUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSub()}
            />
            <span className="icon-inline">
              <Download size={14} className="dim" />
            </span>
          </div>
          <div className="btn-group">
            <button className="soft-btn" onClick={addSub}>
              <Zap size={12} /> 添加订阅
            </button>
          </div>
        </div>
      </section>

      {/* 运行态：策略与节点 */}
      {running && (
        <section className="set-sec">
          <h3 className="set-sec-title">加速策略</h3>
          <div className="set-sec-body">
            <div className="seg">
              <button
                className={settings.proxyAuto ? "on" : ""}
                onClick={() => settings.proxyAuto || switchStrategy(true)}
              >
                <Gauge size={12} /> 自动选优
              </button>
              <button
                className={!settings.proxyAuto ? "on" : ""}
                onClick={() => (settings.proxyAuto ? switchStrategy(false) : undefined)}
              >
                手动选择
              </button>
            </div>
            <p className="dim note">
              {settings.proxyAuto
                ? `自动模式：规则走「自动」分组（延迟最低节点），当前 ${snap?.autoNow || "—"}。切换会重启内核。`
                : "手动模式：请在下方节点列表点选你要用的节点。切换会重启内核。"}
            </p>

            <div className="proxy-now">
              <span className="dim">当前节点</span>
              <b>{settings.proxyAuto ? snap?.autoNow || "—" : snap?.manualNow || "—"}</b>
              <button className="icon-btn small" disabled={testing} title="测速" onClick={testNow}>
                <RefreshCw size={12} className={testing ? "spin" : ""} />
              </button>
              {snap?.nowDelay !== null && snap?.nowDelay !== undefined && (
                <span className={`pdelay ${snap.nowDelay >= 0 ? "" : "bad"}`}>
                  {snap.nowDelay >= 0 ? `${snap.nowDelay} ms` : "超时"}
                </span>
              )}
            </div>

            {!settings.proxyAuto && (
              <div className="proxy-nodes">
                {!snap?.manualAll.length && (
                  <p className="dim note">暂无节点，等待订阅解析…</p>
                )}
                {snap?.manualAll.map((n) => (
                  <button
                    key={n}
                    className={`proxy-node ${snap.manualNow === n ? "on" : ""}`}
                    onClick={() => pickNode(n)}
                  >
                    {snap.manualNow === n ? <Power size={11} /> : <Zap size={11} />}
                    <span>{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
