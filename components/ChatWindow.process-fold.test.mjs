import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const locales = ["en", "zh-CN", "zh-TW"];

test("a live run folds its last turn instead of flattening it", () => {
  // The old live-tail branch rendered the running turn flat. It now folds, with
  // the streaming reply outside the fold, so the process steps are collapsed
  // while the answer still streams.
  assert.doesNotMatch(source, /isLiveTail/);
  assert.match(source, /const liveTurn = \(agentRunning \|\| isStreaming\) && endIdx === messages\.length && userIdx === lastAnchorIdx;/);
  assert.match(source, /running=\{liveTurn\}/);
  // Collapsed by default while running; re-keyed when the run settles so the
  // default is read again (an unanswered turn opens then, #906).
  assert.match(source, /defaultExpanded=\{!answered && !liveTurn\}/);
  assert.match(source, /key=\{answered \? "answered" : liveTurn \? "live" : "unanswered"\}/);
});

test("the running fold leads with six dots that unmount when the run ends", () => {
  const coordinates = source.match(/const PROCESS_DOT_COORDINATES = \[([\s\S]*?)\] as const;/);
  assert.ok(coordinates, "the six-dot ring keeps its coordinates in one list");
  assert.equal((coordinates[1].match(/\[\d+(?:\.\d+)?, \d+(?:\.\d+)?\]/g) ?? []).length, 6);
  // Each dot starts at a different point of the cycle, so the light travels round.
  assert.ok(source.includes("animationDelay: `${-index / PROCESS_DOT_COORDINATES.length}s`"));
  // Only during the run: nothing is left animating once the task is done.
  assert.match(source, /\{running && <ProcessRunningDots \/>\}/);
  assert.match(source, /className="process-dots"[\s\S]{0,80}aria-hidden="true"/);
  assert.match(source, /\.\.\.\(running \? \[t\("chat\.processRunning"\)\] : \[\]\)/);
});

test("the expanded fold grows with its steps and caps into a bordered, unfilled scroll window", () => {
  assert.match(source, /className="process-details-window"/);
  const window = globals.match(/\.process-details-window \{([\s\S]*?)\n\}/);
  assert.ok(window, "the window's chrome lives in one rule");
  // A short fold is as tall as its steps: no fixed height to leave blank space.
  assert.match(window[1], /max-height: 320px;/);
  assert.doesNotMatch(window[1], /^ {2}height: 320px;/m);
  assert.match(window[1], /overflow-y: auto;/);
  assert.match(window[1], /border: 1px solid var\(--border\);/);
  assert.match(window[1], /background: transparent;/);
  // Scrolling the steps must not chain to the chat behind them.
  assert.match(window[1], /overscroll-behavior: contain;/);
  assert.match(globals, /@media \(max-width: 640px\) \{\s*\.process-details-window \{\s*max-height: 240px;/);
});

test("the six dots stop moving when the reader asks for less motion", () => {
  assert.match(globals, /\.process-dots circle \{\s*animation: process-dots-fade 1\.2s linear infinite;/);
  assert.match(globals, /@keyframes process-dots-fade \{/);
  const reduced = globals.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.process-dots circle \{([\s\S]*?)\n {2}\}/);
  assert.ok(reduced, "the dots honour a reduced-motion preference");
  assert.match(reduced[1], /animation: none;/);
  assert.match(reduced[1], /opacity: 0\.6;/);
});

test("an open running window follows the steps unless the reader scrolled up", () => {
  assert.match(source, /if \(!running \|\| !body \|\| !followBottomRef\.current\) return;/);
  assert.match(source, /followBottomRef\.current = body\.scrollHeight - body\.scrollTop - body\.clientHeight < 24;/);
  // Re-opening the fold goes back to following.
  assert.match(source, /if \(v\) return false;\s*\n\s*followBottomRef\.current = true;/);
  // Opening by hand brings the fixed window into view; a search hit leaves the
  // chat where the search put it.
  assert.match(source, /bodyRef\.current\?\.scrollIntoView\(\{ block: "nearest" \}\);/);
});

test("the running fold's accessible name is translated everywhere", async () => {
  for (const locale of locales) {
    const messages = await readFile(new URL(`../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    assert.match(messages, /"chat\.processRunning":/, `${locale} carries the running fold's name`);
  }
});
