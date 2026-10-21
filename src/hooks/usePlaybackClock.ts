import { useEffect, useState } from "react";
import type { PlayerState } from "../types";
import { activeLyricText, nextLyricDelay, playbackPosition } from "../lib/playback";

export function useActiveLyricLine(player: PlayerState): string | null {
  const [snapshot, setSnapshot] = useState(() => ({
    player, line: activeLyricText(player, playbackPosition(player)),
  }));
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const position = playbackPosition(player);
      const line = activeLyricText(player, position);
      setSnapshot((previous) => previous.player === player && previous.line === line
        ? previous : { player, line });
      const delay = nextLyricDelay(player, position);
      if (delay !== null) timer = window.setTimeout(update, delay);
    };
    update();
    return () => window.clearTimeout(timer);
  }, [player]);
  // A seek or track switch must never display the preceding player's lyric for a frame.
  return snapshot.player === player ? snapshot.line : activeLyricText(player, playbackPosition(player));
}

// Only mounted by the music page. The compact island has no progress-bar timer.
export function usePlaybackPosition(player: PlayerState): number {
  const [snapshot, setSnapshot] = useState(() => ({ player, position: playbackPosition(player) }));
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const current = playbackPosition(player);
      setSnapshot((previous) => previous.player === player && previous.position === current
        ? previous : { player, position: current });
      if (!player.playing || !player.track || (player.duration > 0 && current >= player.duration)) return;
      const nextSecond = Math.max(16, Math.ceil((Math.floor(current) + 1 - current) * 1000) + 1);
      timer = window.setTimeout(update, Math.min(nextSecond, nextLyricDelay(player, current) ?? nextSecond));
    };
    update();
    return () => window.clearTimeout(timer);
  }, [player]);
  return snapshot.player === player ? snapshot.position : playbackPosition(player);
}
