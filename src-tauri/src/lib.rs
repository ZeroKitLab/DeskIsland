// 灵动岛后端：
// - 提供网易云搜索/歌词的命令代理（添加 UA、Referer、Cookie 并规避 CORS）
// - 加速器：mihomo 内核进程管理、系统代理（见 proxy.rs）
// - 窗口创建后立即吸附到主显示器顶部水平居中（物理像素，规避缩放差异）

mod proxy;
#[cfg(windows)]
mod music;
mod window_layout;

use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

fn fetch_with_headers(url: &str) -> Result<String, String> {
    let resp = ureq::get(url)
        .set("User-Agent", UA)
        .set("Referer", "https://music.163.com/")
        .set(
            "Cookie",
            "os=pc; appver=2.9.7; osver=Microsoft-Windows-10-Advanced; NMTID=00O3ol1lM00000000000000000000000",
        )
        .timeout(std::time::Duration::from_secs(12))
        .call()
        .map_err(|e| format!("请求失败: {e}"))?;
    resp.into_string().map_err(|e| format!("读取响应失败: {e}"))
}

/// 网易云搜索歌曲
#[tauri::command]
async fn netease_search(q: String) -> Result<String, String> {
    let url = format!(
        "https://music.163.com/api/search/get/web?s={}&type=1&limit=12&offset=0",
        urlencoding::encode(&q)
    );
    tauri::async_runtime::spawn_blocking(move || fetch_with_headers(&url))
        .await
        .map_err(|e| e.to_string())?
}

/// 网易云获取同步歌词（LRC）
#[tauri::command]
async fn netease_lyric(id: i64) -> Result<String, String> {
    let url = format!(
        "https://music.163.com/api/song/lyric?id={id}&lv=1&kv=1&tv=-1&csrf_token="
    );
    tauri::async_runtime::spawn_blocking(move || fetch_with_headers(&url))
        .await
        .map_err(|e| e.to_string())?
}

/// 把窗口吸附到当前显示器顶部水平居中
fn snap_to_top_center(win: &tauri::WebviewWindow) {
    let Ok(Some(mon)) = win.current_monitor() else {
        return;
    };
    let mpos = mon.position();
    let msize = mon.size();
    let Ok(wsize) = win.outer_size() else {
        return;
    };
    let x = mpos.x + (msize.width.saturating_sub(wsize.width) / 2) as i32;
    let y = mpos.y;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(proxy::ProxyState::default()))
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                snap_to_top_center(&win);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_layout::set_window_bounds,
            netease_search,
            netease_lyric,
            music::current_music_session,
            music::qq_lyric,
            proxy::proxy_status,
            proxy::proxy_setup_core,
            proxy::proxy_start,
            proxy::proxy_stop,
            proxy::proxy_sys,
            proxy::proxy_api,
            proxy::proxy_open_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // 退出时结束内核进程并恢复系统代理
                proxy::cleanup_on_exit(app_handle);
            }
        });
}
