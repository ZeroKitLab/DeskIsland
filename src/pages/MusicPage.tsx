// 实时歌词页：从 Windows 媒体会话读取 QQ 音乐 / 网易云音乐的当前播放信息。
import { useEffect } from "react";
import { Loader2, Music2, Radio } from "lucide-react";
import type { AppCtx } from "../ctx";
import { usePlaybackPosition } from "../hooks/usePlaybackClock";
import { activeLyricIndex } from "../lib/playback";

interface Props {
  ctx: AppCtx;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MusicPage({ ctx }: Props) {
  const { player, musicSession: session, musicStatus: status, musicLyricStatus: lyricStatus, musicError: pollError } = ctx;

  const track = player.live ? player.track : null;
  const position = usePlaybackPosition(player);
  const activeIdx = track ? activeLyricIndex(track.lines, position) : -1;
  const progress = player.duration > 0 ? Math.min(100, Math.max(0, (position / player.duration) * 100)) : 0;

  useEffect(() => {
    if (activeIdx < 0) return;
    document.getElementById(`lyr_${activeIdx}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx, track?.id]);

  return (
    <div className="page music-page live-music-page">
      <section className="player-card live-player-card">
        <div className="player-art live-player-art">
          {session ? <Music2 size={23} /> : <Radio size={22} />}
        </div>
        <div className="player-main">
          <div className="player-title" title={track?.name ?? "实时歌词"}>
            {track?.name ?? "实时歌词"}
          </div>
          <div className="player-artist">
            {track?.artist ?? "自动监听 QQ 音乐与网易云音乐"}
          </div>
          <div className="live-player-status">
            <span className={`live-status-dot ${session?.playing ? "playing" : ""}`} />
            <span title={pollError || status}>{status}</span>
            {lyricStatus.includes("匹配") && <Loader2 size={12} className="spin" />}
          </div>
          {track && player.duration > 0 && (
            <>
              <div className="live-progress-track"><span style={{ width: `${progress}%` }} /></div>
              <div className="player-times live-player-times">
                <span>{fmt(position)}</span>
                <span>{fmt(player.duration)}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {pollError && <p className="form-err live-error" title={pollError}>{pollError}</p>}
      {lyricStatus && !pollError && <div className="live-lyric-status">{lyricStatus}</div>}

      {track?.lines.length ? (
        <div className="lyric-sheet live-lyric-sheet">
          {track.lines.map((line, index) => (
            <div
              key={`${track.id}_${index}`}
              id={`lyr_${index}`}
              className={`lyric-line ${index === activeIdx ? "active" : ""} ${index < activeIdx ? "past" : ""}`}
            >
              {line.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="lyric-sheet live-lyric-empty">
          <Music2 size={18} />
          <span>
            {session
              ? "这首歌暂时没有可用的同步歌词"
              : "播放 QQ 音乐或网易云音乐，歌词会自动同步显示在这里"}
          </span>
          <small>QQ 音乐优先 · 网易云音乐后备</small>
        </div>
      )}
    </div>
  );
}
