use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, OnceLock,
};
use std::time::{Duration, Instant};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus, MediaPropertiesChangedEventArgs,
};
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
use windows_future::{AsyncOperationCompletedHandler, AsyncStatus, IAsyncOperation};

const MEDIA_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const MEDIA_OPERATION_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(test)]
static MANAGER_CREATIONS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn await_media_operation<T: windows::core::RuntimeType>(
    operation: IAsyncOperation<T>,
    deadline: Instant,
) -> windows::core::Result<T> {
    if operation.Status()? == AsyncStatus::Started {
        let (completed, wait) = mpsc::sync_channel(1);
        operation.SetCompleted(&AsyncOperationCompletedHandler::<T>::new(move |_, _| {
            // The operation may finish after a timeout. A disconnected receiver
            // is safe here; no borrowed stack data is retained by Windows.
            let _ = completed.try_send(());
            Ok(())
        }))?;
        let remaining = deadline.saturating_duration_since(Instant::now());
        if wait
            .recv_timeout(remaining.min(MEDIA_OPERATION_TIMEOUT))
            .is_err()
        {
            let _ = operation.Cancel();
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x800705B4u32 as i32),
                "Windows 媒体接口响应超时",
            ));
        }
    }
    operation.GetResults()
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentMusicSession {
    pub source: String,
    pub source_app: String,
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub position: f64,
    pub duration: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MusicProvider {
    Qq,
    Netease,
}

impl MusicProvider {
    fn key(self) -> &'static str {
        match self {
            Self::Qq => "qq",
            Self::Netease => "netease",
        }
    }

    fn priority(self) -> u8 {
        match self {
            Self::Qq => 2,
            Self::Netease => 1,
        }
    }
}

fn classify_app_id(app_id: &str) -> Option<MusicProvider> {
    let normalized = app_id.to_ascii_lowercase();
    if normalized.contains("qqmusic")
        || normalized.contains("qq音乐")
        || (normalized.contains("tencent") && normalized.contains("music"))
    {
        Some(MusicProvider::Qq)
    } else if normalized.contains("netease")
        || normalized.contains("cloudmusic")
        || normalized.contains("163music")
    {
        Some(MusicProvider::Netease)
    } else {
        None
    }
}

struct CachedSession {
    session: GlobalSystemMediaTransportControlsSession,
    app_id: String,
    provider: MusicProvider,
    title: String,
    artist: String,
    metadata_dirty: Arc<AtomicBool>,
    metadata_token: Option<i64>,
    metadata_read_at: Option<Instant>,
}

impl CachedSession {
    fn new(session: GlobalSystemMediaTransportControlsSession) -> Result<Option<Self>, String> {
        let app_id = session
            .SourceAppUserModelId()
            .map_err(|error| format!("读取媒体来源失败：{error}"))?
            .to_string();
        let Some(provider) = classify_app_id(&app_id) else {
            return Ok(None);
        };
        let metadata_dirty = Arc::new(AtomicBool::new(true));
        let changed = Arc::clone(&metadata_dirty);
        let handler = TypedEventHandler::<
            GlobalSystemMediaTransportControlsSession,
            MediaPropertiesChangedEventArgs,
        >::new(move |_, _| {
            changed.store(true, Ordering::Release);
            Ok(())
        });
        let metadata_token = session.MediaPropertiesChanged(&handler).ok();
        Ok(Some(Self {
            session,
            app_id,
            provider,
            title: String::new(),
            artist: String::new(),
            metadata_dirty,
            metadata_token,
            metadata_read_at: None,
        }))
    }

    fn refresh_metadata(&mut self, deadline: Instant) -> Result<(), String> {
        // Full media properties can include album artwork. Read them on a track
        // change, with a slow fallback for players that omit change events.
        // A failed event subscription keeps the original polling behavior.
        let dirty = self.metadata_dirty.swap(false, Ordering::AcqRel);
        let expired = self
            .metadata_read_at
            .is_none_or(|read_at| read_at.elapsed() >= Duration::from_secs(10));
        if !dirty && !expired && self.metadata_token.is_some() && !self.title.trim().is_empty() {
            return Ok(());
        }
        let result = self
            .session
            .TryGetMediaPropertiesAsync()
            .and_then(|operation| await_media_operation(operation, deadline));
        let properties = match result {
            Ok(properties) => properties,
            Err(error) => {
                self.metadata_dirty.store(true, Ordering::Release);
                return Err(format!("读取歌曲信息失败：{error}"));
            }
        };
        self.title = properties
            .Title()
            .map(|value| value.to_string())
            .unwrap_or_default();
        self.artist = properties
            .Artist()
            .map(|value| value.to_string())
            .unwrap_or_default();
        self.metadata_read_at = Some(Instant::now());
        Ok(())
    }
}

impl Drop for CachedSession {
    fn drop(&mut self) {
        if let Some(token) = self.metadata_token {
            let _ = self.session.RemoveMediaPropertiesChanged(token);
        }
    }
}

fn session_data(
    cached: &mut CachedSession,
    deadline: Instant,
) -> Result<Option<(CurrentMusicSession, MusicProvider)>, String> {
    if Instant::now() >= deadline {
        return Err("读取媒体会话超时".into());
    }
    cached.refresh_metadata(deadline)?;
    if cached.title.trim().is_empty() {
        return Ok(None);
    }
    let session = &cached.session;
    let playback = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .map_err(|error| format!("读取播放状态失败：{error}"))?;
    let timeline = session
        .GetTimelineProperties()
        .map_err(|error| format!("读取播放进度失败：{error}"))?;

    // WinRT TimeSpan uses 100 ns ticks. EndTime and StartTime are relative to the track.
    let reported_position = timeline
        .Position()
        .map(|value| (value.Duration as f64 / 10_000_000.0).max(0.0))
        .unwrap_or(0.0);
    let is_playing = playback == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
    let elapsed_since_update = if is_playing {
        timeline
            .LastUpdatedTime()
            .map(|updated| {
                const WINDOWS_TO_UNIX_EPOCH_TICKS: i128 = 116_444_736_000_000_000;
                let now_ticks = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos() as i128
                    / 100
                    + WINDOWS_TO_UNIX_EPOCH_TICKS;
                ((now_ticks - updated.UniversalTime as i128).max(0) as f64) / 10_000_000.0
            })
            .unwrap_or(0.0)
    } else {
        0.0
    };
    let position = reported_position + elapsed_since_update;
    let duration = match (timeline.StartTime(), timeline.EndTime()) {
        (Ok(start), Ok(end)) => ((end.Duration - start.Duration) as f64 / 10_000_000.0).max(0.0),
        _ => 0.0,
    };

    Ok(Some((
        CurrentMusicSession {
            source: cached.provider.key().to_string(),
            source_app: cached.app_id.clone(),
            title: cached.title.clone(),
            artist: cached.artist.clone(),
            playing: is_playing,
            position,
            duration,
        },
        cached.provider,
    )))
}

struct SessionMonitor {
    manager: GlobalSystemMediaTransportControlsSessionManager,
    sessions: Vec<CachedSession>,
}

impl SessionMonitor {
    fn new(deadline: Instant) -> Result<Self, String> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| await_media_operation(operation, deadline))
            .map_err(|error| format!("请求 Windows 媒体会话失败：{error}"))?;
        #[cfg(test)]
        MANAGER_CREATIONS.fetch_add(1, Ordering::Relaxed);
        Ok(Self {
            manager,
            sessions: Vec::new(),
        })
    }

    fn read(&mut self, deadline: Instant) -> Result<Option<CurrentMusicSession>, String> {
        let sessions = self
            .manager
            .GetSessions()
            .map_err(|error| format!("读取 Windows 媒体会话失败：{error}"))?;
        let mut active = Vec::new();
        for index in 0..sessions
            .Size()
            .map_err(|error| format!("读取媒体会话列表失败：{error}"))?
        {
            if let Ok(session) = sessions.GetAt(index) {
                active.push(session);
            }
        }
        self.sessions
            .retain(|cached| active.contains(&cached.session));
        let mut last_error = None;
        for session in active {
            if !self.sessions.iter().any(|cached| cached.session == session) {
                match CachedSession::new(session) {
                    Ok(Some(cached)) => self.sessions.push(cached),
                    Ok(None) => {}
                    Err(error) => last_error = Some(error),
                }
            }
        }

        select_current_session(
            self.sessions
                .iter_mut()
                .map(|cached| session_data(cached, deadline)),
            last_error,
        )
    }
}

fn select_current_session(
    results: impl Iterator<Item = Result<Option<(CurrentMusicSession, MusicProvider)>, String>>,
    mut last_error: Option<String>,
) -> SessionResult {
    let mut selected: Option<(CurrentMusicSession, MusicProvider)> = None;
    for result in results {
        // When both supported players have sessions, use the one currently
        // playing; break ties in favor of QQ Music. A broken or disappearing
        // player must not hide a healthy player or discard its metadata cache.
        match result {
            Ok(Some(candidate)) => {
                if selected.as_ref().is_none_or(|current| {
                    (candidate.0.playing, candidate.1.priority())
                        >= (current.0.playing, current.1.priority())
                }) {
                    selected = Some(candidate);
                }
            }
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }
    match selected {
        Some((session, _)) => Ok(Some(session)),
        None => last_error.map_or(Ok(None), Err),
    }
}

type SessionResult = Result<Option<CurrentMusicSession>, String>;
type SessionReply = mpsc::SyncSender<SessionResult>;
struct SessionRequest {
    reply: SessionReply,
    deadline: Instant,
}

fn session_worker(requests: mpsc::Receiver<SessionRequest>) {
    // Keep the WinRT apartment and session manager on one long-lived worker.
    // Recreating the manager on each progress poll repeats Windows IPC/setup.
    if let Err(error) = unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
        for request in requests {
            let _ = request
                .reply
                .send(Err(format!("初始化 Windows 媒体接口失败：{error}")));
        }
        return;
    }
    let _apartment = Apartment;
    let mut monitor: Option<SessionMonitor> = None;
    for SessionRequest { reply, deadline } in requests {
        if Instant::now() >= deadline {
            let _ = reply.send(Err("读取媒体会话超时".into()));
            continue;
        }
        if monitor.is_none() {
            match SessionMonitor::new(deadline) {
                Ok(created) => monitor = Some(created),
                Err(error) => {
                    let _ = reply.send(Err(error));
                    continue;
                }
            }
        }
        let result = monitor.as_mut().unwrap().read(deadline);
        if result.is_err() {
            // Reconnect after Windows/player session failures on the next poll.
            monitor = None;
        }
        let _ = reply.send(result);
    }
}

fn read_current_session() -> SessionResult {
    static WORKER: OnceLock<Result<mpsc::SyncSender<SessionRequest>, String>> = OnceLock::new();
    let requests = WORKER
        .get_or_init(|| {
            let (requests, receiver) = mpsc::sync_channel(1);
            std::thread::Builder::new()
                .name("island-media-session".into())
                .spawn(move || session_worker(receiver))
                .map_err(|error| format!("启动媒体会话监听失败：{error}"))?;
            Ok(requests)
        })
        .as_ref()
        .map_err(Clone::clone)?;
    let (reply, response) = mpsc::sync_channel(1);
    requests
        .try_send(SessionRequest {
            reply,
            deadline: Instant::now() + MEDIA_REQUEST_TIMEOUT,
        })
        .map_err(|error| format!("请求媒体会话失败：{error}"))?;
    response
        .recv_timeout(MEDIA_REQUEST_TIMEOUT)
        .map_err(|error| format!("读取媒体会话失败：{error}"))?
}

struct Apartment;

impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

#[tauri::command]
pub async fn current_music_session() -> Result<Option<CurrentMusicSession>, String> {
    tauri::async_runtime::spawn_blocking(read_current_session)
        .await
        .map_err(|error| format!("读取媒体会话任务失败：{error}"))?
}

fn qq_get(url: &str) -> Result<String, String> {
    let response = ureq::get(url)
        .set("User-Agent", super::UA)
        .set("Referer", "https://y.qq.com/portal/player.html")
        .set("Origin", "https://y.qq.com")
        .set("Accept", "application/json, text/plain, */*")
        .timeout(std::time::Duration::from_secs(12))
        .call()
        .map_err(|error| format!("QQ 音乐请求失败：{error}"))?;
    response
        .into_string()
        .map_err(|error| format!("读取 QQ 音乐响应失败：{error}"))
}

fn qq_post_json(body: &serde_json::Value) -> Result<serde_json::Value, String> {
    let response = ureq::post("https://u.y.qq.com/cgi-bin/musicu.fcg")
        .set("User-Agent", super::UA)
        .set("Referer", "https://y.qq.com/n/ryqq/player")
        .set("Origin", "https://y.qq.com")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/plain, */*")
        .timeout(std::time::Duration::from_secs(12))
        .send_string(&body.to_string())
        .map_err(|error| format!("QQ 音乐搜索失败：{error}"))?;
    let text = response
        .into_string()
        .map_err(|error| format!("读取 QQ 音乐搜索响应失败：{error}"))?;
    serde_json::from_str(&text).map_err(|error| format!("解析 QQ 音乐搜索响应失败：{error}"))
}

fn jsonp_value(text: &str) -> Result<serde_json::Value, String> {
    let start = text.find('{').ok_or("QQ 音乐返回内容格式异常")?;
    let end = text.rfind('}').ok_or("QQ 音乐返回内容格式异常")?;
    if end < start {
        return Err("QQ 音乐返回内容格式异常".into());
    }
    serde_json::from_str(&text[start..=end])
        .map_err(|error| format!("解析 QQ 音乐响应失败：{error}"))
}

fn normalize_match(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace() && !character.is_ascii_punctuation())
        .flat_map(char::to_lowercase)
        .collect()
}

fn qq_song_mid(song: &serde_json::Value) -> Option<&str> {
    song.get("songmid")
        .or_else(|| song.get("mid"))
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
}

fn qq_song_title(song: &serde_json::Value) -> Option<&str> {
    song.get("songname")
        .or_else(|| song.get("name"))
        .and_then(serde_json::Value::as_str)
}

fn qq_song_artists(song: &serde_json::Value) -> String {
    song.get("singer")
        .or_else(|| song.get("singers"))
        .and_then(serde_json::Value::as_array)
        .map(|artists| {
            artists
                .iter()
                .filter_map(|artist| artist.get("name").and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

fn qq_song_id(song: &serde_json::Value) -> Option<String> {
    song.get("id")
        .map(|value| match value {
            serde_json::Value::String(id) => id.clone(),
            serde_json::Value::Number(id) => id.to_string(),
            _ => String::new(),
        })
        .filter(|id| !id.is_empty())
}

/// Search QQ Music by the currently playing title and fetch its synchronized LRC.
#[tauri::command]
pub async fn qq_lyric(title: String, artist: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let query = format!("{artist} {title}").trim().to_string();
        let request = serde_json::json!({
            "music.search.SearchCgiService": {
                "module": "music.search.SearchCgiService",
                "method": "DoSearchForQQMusicDesktop",
                "param": {
                    "num_per_page": 10,
                    "page_num": 1,
                    "query": query,
                    "search_type": 0
                }
            }
        });
        let response = qq_post_json(&request)?;
        let data = response
            .get("music.search.SearchCgiService")
            .or_else(|| response.get("req_0"))
            .unwrap_or(&response);
        let songs = data
            .pointer("/data/body/song/list")
            .and_then(serde_json::Value::as_array)
            .ok_or("QQ 音乐没有返回歌曲搜索结果")?;
        let requested_title = normalize_match(&title);
        let requested_artist = normalize_match(&artist);
        let best = songs
            .iter()
            .filter_map(|song| {
                let song_title = qq_song_title(song)?;
                let mid = qq_song_mid(song)?;
                let normalized_title = normalize_match(song_title);
                let normalized_artist = normalize_match(&qq_song_artists(song));
                let mut score = if normalized_title == requested_title {
                    10
                } else if normalized_title.contains(&requested_title)
                    || requested_title.contains(&normalized_title)
                {
                    5
                } else {
                    0
                };
                if !requested_artist.is_empty()
                    && (normalized_artist.contains(&requested_artist)
                        || requested_artist.contains(&normalized_artist))
                {
                    score += 4;
                }
                Some((score, mid, qq_song_id(song)))
            })
            .max_by_key(|(score, _, _)| *score)
            .filter(|(score, _, _)| *score >= 5)
            .map(|(_, mid, id)| (mid.to_string(), id))
            .ok_or("QQ 音乐没有匹配到这首歌")?;

        let (mid, song_id) = best;
        let music_id = song_id.map(|id| format!("&musicid={id}")).unwrap_or_default();
        let lyric_url = format!(
            "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={mid}{music_id}&format=json&nobase64=1&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0"
        );
        let lyric_response = qq_get(&lyric_url)?;
        let lyric_data = jsonp_value(&lyric_response)?;
        let lyric = lyric_data
            .get("lyric")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                lyric_data
                    .get("trans")
                    .and_then(serde_json::Value::as_str)
                    .filter(|value| !value.trim().is_empty())
            })
            .ok_or("QQ 音乐没有提供这首歌的同步歌词")?;
        let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, lyric)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .filter(|text| text.contains('['));
        Ok(decoded.unwrap_or_else(|| lyric.to_string()))
    })
    .await
    .map_err(|error| format!("QQ 歌词查询任务失败：{error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(provider: MusicProvider, playing: bool) -> (CurrentMusicSession, MusicProvider) {
        (CurrentMusicSession {
            source: provider.key().into(),
            source_app: provider.key().into(),
            title: "test track".into(),
            artist: "test artist".into(),
            playing,
            position: 12.0,
            duration: 120.0,
        }, provider)
    }

    #[test]
    fn unavailable_player_does_not_hide_healthy_session() {
        let result = select_current_session([
            Err("QQ Music session closed".into()),
            Ok(Some(candidate(MusicProvider::Netease, true))),
        ].into_iter(), None).unwrap().unwrap();
        assert_eq!(result.source, "netease");
    }

    #[test]
    fn playing_session_wins_and_qq_breaks_ties() {
        let result = select_current_session([
            Ok(Some(candidate(MusicProvider::Qq, false))),
            Ok(Some(candidate(MusicProvider::Netease, true))),
        ].into_iter(), None).unwrap().unwrap();
        assert_eq!(result.source, "netease");
        let result = select_current_session([
            Ok(Some(candidate(MusicProvider::Qq, true))),
            Ok(Some(candidate(MusicProvider::Netease, true))),
        ].into_iter(), None).unwrap().unwrap();
        assert_eq!(result.source, "qq");
    }

    #[test]
    fn unfinished_media_operation_times_out_and_next_operation_works() {
        let (release, blocked) = mpsc::sync_channel(1);
        let operation = IAsyncOperation::<bool>::spawn(move || {
            let _ = blocked.recv_timeout(Duration::from_secs(1));
            Ok(true)
        });
        let result = await_media_operation(operation, Instant::now());
        // Allow the completion callback to run after its receiver was dropped.
        let _ = release.send(());
        assert_eq!(result.unwrap_err().code().0, 0x800705B4u32 as i32);
        assert!(await_media_operation(IAsyncOperation::ready(Ok(true)), Instant::now()).unwrap());
    }

    #[test]
    fn windows_media_session_query_is_available() {
        let result = read_current_session();
        assert!(
            result.is_ok(),
            "Windows media session query failed: {result:?}"
        );
        println!(
            "Supported QQ/NetEase session detected: {}",
            result.unwrap().is_some()
        );
        let initial_creations = MANAGER_CREATIONS.load(Ordering::Relaxed);
        for _ in 0..5 {
            assert!(read_current_session().is_ok());
        }
        assert_eq!(MANAGER_CREATIONS.load(Ordering::Relaxed), initial_creations,
            "Repeated polls must reuse the Windows session manager");
        println!("Five repeated queries reused the same media session manager");
    }
}
