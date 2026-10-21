// Pure playback-clock regression checks; no running music app or network needed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/playback.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
});
const { playbackPosition, activeLyricIndex, activeLyricText, nextLyricDelay, synchronizeLivePlayer } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const track = {
  id: "fixture", name: "Test", artist: "Test artist", source: "qq", hasLyric: true,
  lines: [{ time: 0, text: "First" }, { time: 3, text: "Second" }, { time: 5, text: "Third" }],
};
const player = {
  track, playing: true, pos: 10, base: 10, startedAt: 1000, duration: 180, live: true,
};

test("monotonic playback advances, clamps and freezes at pause", () => {
  assert.equal(playbackPosition(player, 3500), 12.5);
  assert.equal(playbackPosition(player, 500), 10);
  assert.equal(playbackPosition(player, 999999), 180);
  assert.equal(playbackPosition({ ...player, playing: false, pos: 22 }, 3500), 22);
  assert.equal(playbackPosition({ ...player, track: null }, 3500), 0);
});

test("600 normal native position reports preserve the same React state", () => {
  const initial = { ...player, duration: 2000 };
  for (let i = 1; i <= 600; i++) {
    const now = initial.startedAt + i * 2000;
    const position = playbackPosition(initial, now) + (i % 2 ? 0.02 : -0.02);
    assert.equal(synchronizeLivePlayer(initial, track, position, true, 2000, now), initial);
  }
});

test("seek, pause, resume and a track change replace the anchor", () => {
  const seek = synchronizeLivePlayer(player, track, 60, true, 180, 3000);
  assert.notEqual(seek, player);
  assert.equal(playbackPosition(seek, 5000), 62);
  const paused = synchronizeLivePlayer(seek, track, 62, false, 180, 5000);
  assert.equal(playbackPosition(paused, 99999), 62);
  assert.equal(synchronizeLivePlayer(paused, track, 62, false, 180, 9000), paused);
  const resumed = synchronizeLivePlayer(paused, track, 62, true, 180, 9000);
  assert.equal(playbackPosition(resumed, 10000), 63);
  const switched = synchronizeLivePlayer(resumed, { ...track, id: "other" }, 0, true, 100, 10000);
  assert.equal(playbackPosition(switched, 11000), 1);
});

test("late-arriving lyric data retains the ongoing clock", () => {
  const withLyrics = { ...player, track: { ...track, lines: [...track.lines] } };
  assert.equal(playbackPosition(withLyrics, 4600), 13.6);
  assert.equal(withLyrics.startedAt, player.startedAt);
});

test("lyric lookup handles prelude, exact boundary, duplicates and final line", () => {
  const lines = [{ time: 2, text: "A" }, { time: 2, text: "B" }, { time: 4, text: "C" }];
  assert.equal(activeLyricIndex([], 5), -1);
  assert.equal(activeLyricIndex(lines, 0), -1);
  assert.equal(activeLyricIndex(lines, 1.65), 1);
  assert.equal(activeLyricIndex(lines, 3.65), 2);
  assert.equal(activeLyricIndex(lines, 999), 2);
});

test("lyric wakeups follow timestamps rather than native polling cadence", () => {
  assert.equal(activeLyricText(player, 2), "First");
  assert.ok(Math.abs(nextLyricDelay(player, 2) - 651) <= 1);
  assert.equal(activeLyricText(player, 2.651), "Second");
  assert.equal(nextLyricDelay(player, 6), null);
  assert.equal(nextLyricDelay({ ...player, playing: false }, 2), null);
  assert.equal(nextLyricDelay({ ...player, duration: 2 }, 2), null);
});

test("missing lyrics show the title without starting a lyric timer", () => {
  const withoutLyrics = { ...player, track: { ...track, lines: [], hasLyric: false } };
  assert.equal(activeLyricText(withoutLyrics, 10), "Test - Test artist");
  assert.equal(nextLyricDelay(withoutLyrics, 10), null);
  assert.equal(activeLyricText({ ...withoutLyrics, playing: false }, 0), null);
});
