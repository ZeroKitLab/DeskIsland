// 加速器：Tauri 命令封装（与 src-tauri/src/proxy.rs 对应）
import { Channel, invoke } from "@tauri-apps/api/core";

export interface ProxyStatus {
  core_exists: boolean;
  core_bundled: boolean;
  core_path: string | null;
  core_dir: string;
  running: boolean;
  sys_on: boolean;
  version: string | null;
  port: number;
  dir: string;
}

export function proxyStatus(): Promise<ProxyStatus> {
  return invoke<ProxyStatus>("proxy_status");
}

/** 打开加速器数据目录 */
export function proxyOpenDir(): Promise<void> {
  return invoke("proxy_open_dir");
}

/** 下载安装 mihomo 内核，onProgress 接收 0~1 进度 */
export function proxySetupCore(
  url: string,
  onProgress: (p: number) => void
): Promise<string> {
  const channel = new Channel<number>();
  channel.onmessage = onProgress;
  return invoke<string>("proxy_setup_core", { url, onProgress: channel });
}

/** 启动加速器（需要至少一条订阅） */
export function proxyStart(subs: string[], auto: boolean): Promise<string> {
  return invoke<string>("proxy_start", { subs, auto });
}

/** 停止加速器内核 */
export function proxyStop(): Promise<void> {
  return invoke("proxy_stop");
}

/** 打开/关闭系统代理 */
export function proxySys(on: boolean): Promise<void> {
  return invoke("proxy_sys", { on });
}

/** 转发到 mihomo external-controller（method: GET/PUT/PATCH…，path 需 URL 编码） */
export function proxyApi(
  method: string,
  path: string,
  body?: string
): Promise<string> {
  return invoke<string>("proxy_api", { method, path, body });
}

/** 便捷：JSON 响应解析 */
export async function proxyApiJson(
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const raw = await proxyApi(
    method,
    path,
    body === undefined ? undefined : JSON.stringify(body)
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

/** 节点延迟测试：/proxies/{name}/delay */
export async function proxyDelay(name: string): Promise<number> {
  const path = `/proxies/${encodeURIComponent(name)}/delay?timeout=4000&url=${encodeURIComponent(
    "http://www.gstatic.com/generate_204"
  )}`;
  const raw = await proxyApi("GET", path);
  const j = JSON.parse(raw) as { delay?: number };
  return j.delay ?? -1;
}

/** 选择手动节点：PUT /proxies/手动 {"name": node} */
export function proxySelectGroup(group: string, node: string): Promise<string> {
  return proxyApi("PUT", `/proxies/${encodeURIComponent(group)}`, JSON.stringify({ name: node }));
}
