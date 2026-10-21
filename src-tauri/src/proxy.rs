// 加速器（网络代理）后端：
// - 使用 mihomo (Clash.Meta) 内核作为 sidecar 进程
// - 支持订阅 URL 注入 / 配置生成 / 进程启停 / 内核下载解压（依赖系统自带 tar.exe）
// - 通过 mihomo external-controller REST API 查询节点、测速与切换
// - Windows 系统代理：HKCU 注册表 ProxyEnable/ProxyServer + WinINET 广播刷新
//
// 设计约束：除已存在的 ureq / urlencoding 外不新增第三方 crate。

use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{path::BaseDirectory, AppHandle, Manager, State};

/// mihomo 监听的控制端口（系统代理指向 mixed 端口）
const MIXED_PORT: u16 = 7890;
/// mihomo external-controller 端口（本地 REST API）
const CONTROLLER_PORT: u16 = 9090;

/// 全局进程状态（由 Tauri manage 注入）
pub struct ProxyState {
    pub child: Option<Child>,
    pub sys_on: bool,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            child: None,
            sys_on: false,
        }
    }
}

#[derive(Serialize)]
pub struct Status {
    core_exists: bool,
    core_bundled: bool,
    core_path: Option<String>,
    core_dir: String,
    running: bool,
    sys_on: bool,
    version: Option<String>,
    port: u16,
    dir: String,
}

fn to_err(e: impl std::fmt::Display) -> String {
    format!("{e}")
}

/// 应用数据目录下的加速器工作目录，并确保子目录存在
fn proxy_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    let dir = base.join("proxy");
    fs::create_dir_all(&dir).map_err(to_err)?;
    fs::create_dir_all(dir.join("core")).map_err(to_err)?;
    fs::create_dir_all(dir.join("providers")).map_err(to_err)?;
    Ok(dir)
}

fn core_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(proxy_dir(app)?.join("core"))
}

/// 用户手动安装的内核优先；安装包内置内核作为默认值。
fn bundled_core(app: &AppHandle) -> Option<PathBuf> {
    app.path().resolve("mihomo.exe", BaseDirectory::Resource).ok()
}

fn core_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(dir) = proxy_dir(app) {
        v.push(dir.join("core").join("mihomo.exe"));
        // 兼容早期“打开内核目录”按钮实际打开 proxy 根目录时放入的文件。
        v.push(dir.join("mihomo.exe"));
    }
    if let Some(bundled) = bundled_core(app) {
        v.push(bundled);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            v.push(parent.join("mihomo.exe"));
            v.push(parent.join("resources").join("mihomo.exe"));
        }
    }
    v
}

/// 找到首个已存在的内核；用于下载的“安装位”固定为数据目录 core/mihomo.exe
fn find_core(app: &AppHandle) -> Option<PathBuf> {
    core_candidates(app).into_iter().find(|p| p.is_file())
}

fn core_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(core_dir(app)?.join("mihomo.exe"))
}

fn set_sys_proxy_raw(port: u16, on: bool) -> Result<(), String> {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    let set = |name: &str, ty: &str, val: &str| -> Result<(), String> {
        let out = Command::new("reg")
            .args(["add", key, "/v", name, "/t", ty, "/d", val, "/f"])
            .output()
            .map_err(to_err)?;
        if !out.status.success() {
            return Err(format!(
                "设置注册表失败: {}",
                String::from_utf8_lossy(&out.stderr)
            ));
        }
        Ok(())
    };
    if on {
        set("ProxyEnable", "REG_DWORD", "1")?;
        set("ProxyServer", "REG_SZ", &format!("127.0.0.1:{port}"))?;
        set("ProxyOverride", "REG_SZ", "<local>")?;
    } else {
        set("ProxyEnable", "REG_DWORD", "0")?;
    }
    // 广播 WinINET 设置变更，让浏览器/系统立即感知（INTERNET_OPTION_SETTINGS_CHANGED=39 / REFRESH=37）
    let script = r#"Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport("wininet.dll")]public static extern bool InternetSetOption(System.IntPtr h,int o,System.IntPtr b,int l);}';[W]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0);[W]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)"#;
    let out = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output()
        .map_err(to_err)?;
    if !out.status.success() {
        return Err(format!(
            "刷新系统代理失败: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

/// 打开/关闭系统代理（开启时要求内核已在运行）
#[tauri::command]
pub async fn proxy_sys(state: State<'_, Mutex<ProxyState>>, on: bool) -> Result<(), String> {
    {
        let mut st = state.lock().map_err(to_err)?;
        if on {
            let alive = match &mut st.child {
                Some(c) => c.try_wait().map_err(to_err)?.is_none(),
                None => false,
            };
            if !alive {
                st.child = None;
                return Err("代理内核未运行，请先启动加速器".into());
            }
        }
        st.sys_on = on;
    }
    set_sys_proxy_raw(MIXED_PORT, on)?;
    Ok(())
}

/// 状态查询：内核是否存在 / 进程是否运行 / 系统代理是否开启 / 版本
#[tauri::command]
pub async fn proxy_status(
    app: AppHandle,
    state: State<'_, Mutex<ProxyState>>,
) -> Result<Status, String> {
    let dir = proxy_dir(&app)?;
    let core = find_core(&app);
    let core_exists = core.is_some();
    let core_bundled = core
        .as_ref()
        .zip(bundled_core(&app))
        .is_some_and(|(core, bundled)| core == &bundled);
    let (alive, sys_on) = {
        let mut st = state.lock().map_err(to_err)?;
        let a = match &mut st.child {
            Some(c) => c.try_wait().map_err(to_err)?.is_none(),
            None => false,
        };
        if !a {
            st.child = None;
        }
        (a, st.sys_on)
    };
    // 运行中时顺带探测版本
    let mut running = alive;
    let mut version: Option<String> = None;
    if running {
        let base = format!("http://127.0.0.1:{CONTROLLER_PORT}");
        let ver = http_json("GET", &format!("{base}/version"), None, Duration::from_secs(2))
            .ok()
            .and_then(|s| {
                serde_json::from_str::<serde_json::Value>(&s)
                    .ok()
                    .and_then(|v| v["version"].as_str().map(|x| x.to_string()))
            });
        if ver.is_some() {
            version = ver;
        } else {
            running = false;
        }
    }
    Ok(Status {
        core_exists,
        core_bundled,
        core_path: core.map(|c| c.to_string_lossy().to_string()),
        core_dir: core_dir(&app)?.to_string_lossy().to_string(),
        running,
        sys_on,
        version,
        port: MIXED_PORT,
        dir: dir.to_string_lossy().to_string(),
    })
}

/// 打开加速器数据目录（方便手动放置/检查内核文件）
#[tauri::command]
pub async fn proxy_open_dir(app: AppHandle) -> Result<(), String> {
    let dir = core_dir(&app)?;
    Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(to_err)?;
    Ok(())
}

/// 下载并安装 mihomo 内核：接受 zip 下载地址，解压后把内部 exe 整理为 mihomo.exe
#[tauri::command]
pub async fn proxy_setup_core(
    app: AppHandle,
    url: String,
    on_progress: tauri::ipc::Channel<f64>,
) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("下载地址必须以 http:// 或 https:// 开头".into());
    }
    let dir = proxy_dir(&app)?;
    let core = core_exe(&app)?;
    if core.exists() {
        return Ok("内核已存在，无需重复下载".into());
    }
    let zip_path = dir.join("core_download.tmp.zip");
    let out_dir = dir.join("core_tmp");

    let _ = fs::remove_file(&zip_path);
    if out_dir.exists() {
        fs::remove_dir_all(&out_dir).map_err(to_err)?;
    }
    fs::create_dir_all(&out_dir).map_err(to_err)?;

    // 下载
    let _ = on_progress.send(0.1);
    let result: Result<(), String> = (|| {
        let resp = ureq::get(&url)
            .timeout(Duration::from_secs(300))
            .call()
            .map_err(|e| format!("下载失败: {e}"))?;
        let total = resp.header("content-length").and_then(|v| v.parse::<u64>().ok());
        let mut src = resp.into_reader();
        let mut file = File::create(&zip_path).map_err(to_err)?;
        let mut buf = [0u8; 65536];
        let mut done: u64 = 0;
        loop {
            let n = src.read(&mut buf).map_err(to_err)?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(to_err)?;
            done += n as u64;
            if let Some(t) = total {
                if t > 0 {
                    let _ = on_progress.send(0.1 + 0.5 * (done as f64 / t as f64));
                }
            }
        }
        file.flush().map_err(to_err)?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&zip_path);
        let _ = fs::remove_dir_all(&out_dir);
        return Err(e);
    }

    // 用系统自带 tar.exe 解压 zip（Windows 10/11 均内置 bsdtar）
    let unzip = Command::new("tar")
        .args(["-xf", zip_path.to_str().unwrap_or(""), "-C", out_dir.to_str().unwrap_or("")])
        .output()
        .map_err(to_err)?;
    if !unzip.status.success() {
        let _ = fs::remove_file(&zip_path);
        let _ = fs::remove_dir_all(&out_dir);
        return Err(format!(
            "解压失败：{}。可改为手动下载并把 exe 重命名为 mihomo.exe 放入内核目录。",
            String::from_utf8_lossy(&unzip.stderr)
        ));
    }
    let _ = fs::remove_file(&zip_path);
    let _ = on_progress.send(0.7);

    // 找到解压出的 exe 并安装为 mihomo.exe
    let found = find_exe(&out_dir);
    let found = match found {
        Some(p) => p,
        None => {
            let _ = fs::remove_dir_all(&out_dir);
            return Err("压缩包内未找到可执行文件（*.exe）".into());
        }
    };
    fs::copy(&found, &core).map_err(to_err)?;
    fs::remove_dir_all(&out_dir).map_err(to_err)?;
    let _ = on_progress.send(1.0);

    // 冒烟测试：mihomo -v
    let out = Command::new(&core).arg("-v").output().map_err(to_err)?;
    let ver = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("mihomo")
        .trim()
        .to_string();
    Ok(ver)
}

fn find_exe(dir: &Path) -> Option<PathBuf> {
    if dir.is_file() {
        return dir
            .extension()
            .map(|e| e.eq_ignore_ascii_case("exe"))
            .unwrap_or(false)
            .then(|| dir.to_path_buf());
    }
    let mut stack = vec![dir.to_path_buf()];
    while let Some(p) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&p) {
            for en in entries.flatten() {
                let path = en.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path
                    .extension()
                    .map(|e| e.eq_ignore_ascii_case("exe"))
                    .unwrap_or(false)
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// 生成 mihomo 配置文本。订阅以 proxy-providers 方式注入，由内核自行拉取/解析。
fn config_text(port: u16, subs: &[String], auto: bool) -> String {
    let mut providers = String::new();
    let mut uses = String::new();
    for (i, url) in subs.iter().enumerate() {
        providers.push_str(&format!(
            "  sub-{i}:\n    type: http\n    url: '{url}'\n    interval: 1440\n    path: 'providers/sub-{i}.yaml'\n    health-check:\n      enable: true\n      url: http://www.gstatic.com/generate_204\n      interval: 300\n"
        ));
        uses.push_str(&format!("      - sub-{i}\n"));
    }
    let target = if auto { "自动" } else { "手动" };
    format!(
        r#"# Generated by island accelerator
mixed-port: {port}
allow-lan: false
bind-address: '*'
mode: global
log-level: warning
ipv6: true
external-controller: 127.0.0.1:{CONTROLLER_PORT}
proxy-providers:
{providers}proxy-groups:
  - name: 手动
    type: select
{uses}  - name: 自动
    type: url-test
{uses}    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
rules:
  - MATCH,{target}
"#
    )
}

/// 启动加速器（重启时自动先停止旧进程）。订阅地址需至少一个。
#[tauri::command]
pub async fn proxy_start(
    app: AppHandle,
    state: State<'_, Mutex<ProxyState>>,
    subs: Vec<String>,
    auto: bool,
    port: Option<u16>,
) -> Result<String, String> {
    let subs: Vec<String> = subs.into_iter().filter(|s| !s.trim().is_empty()).collect();
    if subs.is_empty() {
        return Err("请先在“订阅管理”中添加至少一条订阅".into());
    }
    let real_port = port.unwrap_or(MIXED_PORT);
    let dir = proxy_dir(&app)?;
    let core = find_core(&app).ok_or_else(|| "未找到 mihomo 内核，请先下载安装内核".to_string())?;

    // 停掉旧进程
    {
        let mut st = state.lock().map_err(to_err)?;
        if let Some(mut c) = st.child.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }

    let cfg_path = dir.join("config.yaml");
    fs::write(&cfg_path, config_text(real_port, &subs, auto)).map_err(to_err)?;

    let log_path = dir.join("mihomo.log");
    let logf = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(to_err)?;
    let loge = logf.try_clone().map_err(to_err)?;

    let mut child = Command::new(&core)
        .arg("-f")
        .arg(&cfg_path)
        .current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(logf))
        .stderr(Stdio::from(loge))
        .spawn()
        .map_err(|e| format!("启动内核失败: {e}"))?;

    // 等待 external-controller 就绪
    let base = format!("http://127.0.0.1:{CONTROLLER_PORT}");
    let deadline = Instant::now() + Duration::from_secs(8);
    let version = loop {
        match http_json("GET", &format!("{base}/version"), None, Duration::from_secs(2)) {
            Ok(s) => {
                break serde_json::from_str::<serde_json::Value>(&s)
                    .ok()
                    .and_then(|v| v["version"].as_str().map(|x| x.to_string()));
            }
            Err(_) => {
                if Instant::now() > deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let log = fs::read_to_string(&log_path).unwrap_or_default();
                    let tail: String = log.lines().rev().take(8).collect::<Vec<_>>().join("\n");
                    return Err(format!("内核启动超时，请检查日志：\n{tail}"));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    };

    {
        let mut st = state.lock().map_err(to_err)?;
        st.child = Some(child);
    }
    Ok(version.unwrap_or_else(|| "unknown".into()))
}

/// 停止加速器（仅杀内核进程，系统代理由前端同步关闭）
#[tauri::command]
pub async fn proxy_stop(state: State<'_, Mutex<ProxyState>>) -> Result<(), String> {
    let mut st = state.lock().map_err(to_err)?;
    if let Some(mut c) = st.child.take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    Ok(())
}

/// 向 mihomo external-controller 转发受控 REST 请求。
/// 白名单路径：/version、/configs、/proxies 及其子路径；路径需由前端预先做 URL 编码。
#[tauri::command]
pub async fn proxy_api(
    method: String,
    path: String,
    body: Option<String>,
) -> Result<String, String> {
    let ok =
        path.starts_with("/version") || path.starts_with("/configs") || path.starts_with("/proxies");
    if !ok || path.contains("..") {
        return Err("不允许的路径".into());
    }
    let method = method.to_uppercase();
    if !["GET", "PUT", "PATCH", "POST", "DELETE"].contains(&method.as_str()) {
        return Err("不允许的方法".into());
    }
    let url = format!("http://127.0.0.1:{CONTROLLER_PORT}{path}");
    let body = body.filter(|b| !b.trim().is_empty());
    http_json(&method, &url, body.as_deref(), Duration::from_secs(15))
}

fn http_json(
    method: &str,
    url: &str,
    body: Option<&str>,
    timeout: Duration,
) -> Result<String, String> {
    let req = ureq::request(method, url).timeout(timeout);
    let resp = match (method, body) {
        ("PUT", Some(b)) | ("PATCH", Some(b)) | ("POST", Some(b)) => {
            req.set("Content-Type", "application/json").send_string(b)
        }
        _ => req.call(),
    }
    .map_err(|e| format!("请求控制器失败: {e}"))?;
    let code = resp.status();
    let text = resp.into_string().map_err(to_err)?;
    if (200..300).contains(&code) {
        Ok(text)
    } else {
        Err(format!("控制器返回 {code}: {}", &text[..text.len().min(300)]))
    }
}

/// 应用退出清理：结束内核进程并恢复系统代理
pub fn cleanup_on_exit(app: &AppHandle) {
    let Some(st) = app.try_state::<Mutex<ProxyState>>() else {
        return;
    };
    let Ok(mut st) = st.lock() else {
        return;
    };
    if let Some(mut c) = st.child.take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    if st.sys_on {
        let _ = set_sys_proxy_raw(MIXED_PORT, false);
    }
}
