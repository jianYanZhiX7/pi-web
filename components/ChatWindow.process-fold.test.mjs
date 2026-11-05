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
  // Content that grows between steps (a running tool's output, a thinking
  // block the reader expands, streamed text in a step) also follows.
  assert.match(source, /if \(followBottomRef\.current\) body\.scrollTop = body\.scrollHeight;/);
  assert.match(source, /const observer = new MutationObserver\(follow\);/);
  assert.match(source, /observer\.observe\(body, \{ childList: true, subtree: true, characterData: true \}\);/);
});

test("the running fold ticks its elapsed time and last window's tokens, red under the threshold", () => {
  // One tick a second while a run is under way; the steps are the same elements.
  assert.match(source, /if \(!running\) return;\s*\n\s*setNow\(Date\.now\(\)\);\s*\n\s*const timer = setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\);/);
  assert.match(source, /running && liveStartedAt !== undefined/);
  assert.match(source, /throughput\.tokensInWindow\(now\)/);
  assert.match(source, /warning: stallGauge && isThroughputStalled\(throughput, now\)/);
  assert.match(source, /const PROCESS_STALL_COLOR = "#ef4444";/);
  // The live numbers join the accessible name of the button like the rest of the line.
  assert.match(source, /const parts = segments\.map\(\(segment\) => segment\.text\);/);
  assert.match(source, /\.\.\.parts, \.\.\.\(cacheMissText/);
  // Tools, a compaction and an extension's question pause the model: no red then.
  assert.match(source, /const liveStallGauge = !isCompacting && !extensionDialog && agentPhase\?\.kind !== "running_tools";/);
  assert.match(source, /stallGauge=\{liveStallGauge\}/);
  // A turn's start on the browser's clock: our own bubble's stamp, or pi's moved
  // onto it by the offset the state read measured.
  assert.match(source, /return entryId \? toBrowserClock\(timestamp\) : timestamp;/);
  assert.match(source, /liveStartedAt=\{liveTurn && hasAnchor \? liveTurnStartedAtMs\(messages\[userIdx\], entryIds\[userIdx\]\) : undefined\}/);
});

test("the running fold's accessible name is translated everywhere", async () => {
  for (const locale of locales) {
    const messages = await readFile(new URL(`../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    assert.match(messages, /"chat\.processRunning":/, `${locale} carries the running fold's name`);
    assert.match(messages, /"chat\.liveTurnDuration":/, `${locale} carries the live elapsed time`);
    assert.match(messages, /"chat\.liveTokens":/, `${locale} carries the live window's token count`);
    assert.match(messages, /"chat\.liveTokensHint":/, `${locale} carries the threshold hint`);
  }
});
