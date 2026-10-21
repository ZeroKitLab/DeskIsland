import type { LrcLine, LyricTrack, PlayerState } from "../types";

export const LYRIC_LEAD_SECONDS = 0.35;

// Playback uses a monotonic anchor; a system-clock adjustment must not seek a song.
export function playbackPosition(player: PlayerState, now = performance.now()): number {
  if (!player.track) return 0;
  const elapsed = player.playing ? Math.max(0, now - player.startedAt) / 1000 : 0;
  const position = player.playing ? player.base + elapsed : player.pos;
  return Math.max(0, player.duration > 0 ? Math.min(position, player.duration) : position);
}

export function activeLyricIndex(lines: LrcLine[], position: number): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= position + LYRIC_LEAD_SECONDS) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function activeLyricText(player: PlayerState, position: number): string | null {
  const track = player.track;
  if (!track || (!player.playing && position === 0)) return null;
  const text = track.lines[activeLyricIndex(track.lines, position)]?.text;
  return text || (!track.hasLyric ? `${track.name} - ${track.artist}` : null);
}

// Wake at the next visible lyric instead of updating the entire app on a fast timer.
export function nextLyricDelay(player: PlayerState, position: number): number | null {
  if (!player.playing || !player.track) return null;
  const lines = player.track.lines;
  const next = lines[activeLyricIndex(lines, position) + 1];
  if (!next) return null;
  const boundary = next.time - LYRIC_LEAD_SECONDS;
  if (player.duration > 0 && boundary > player.duration) return null;
  return Math.max(16, Math.ceil((boundary - position) * 1000) + 1);
}

export function synchronizeLivePlayer(
  previous: PlayerState,
  track: LyricTrack | null,
  position: number,
  playing: boolean,
  duration: number,
  now = performance.now(),
): PlayerState {
  const length = Math.max(0, duration);
  const pos = Math.max(0, length > 0 ? Math.min(position, length) : position);
  // Keep the current anchor when the native report merely confirms normal playback.
  // A seek, pause, track change or meaningful drift creates a fresh anchor.
  if (previous.live && previous.track === track && previous.playing === playing
    && previous.duration === length
    && Math.abs(playbackPosition(previous, now) - pos) <= (playing ? 0.12 : 0.001)) {
    return previous;
  }
  return { track, playing, pos, base: pos, startedAt: now, duration: length, live: true };
}
