import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  TAB_RUN_COLORS,
  TAB_RUN_GLYPHS,
  TAB_SPINNER_FRAMES,
  TAB_SPINNER_INTERVAL_MS,
  cwdBranch,
  formatTabBaseTitle,
  formatTabTitle,
  tabRunPhaseAfterEnd,
  tabRunPrefix,
  tabRunStatus,
} = await jiti.import("./tab-status.ts");

test("the spinner walks its frames and wraps in both directions", () => {
  assert.equal(tabRunPrefix("running", 0), TAB_SPINNER_FRAMES[0]);
  assert.equal(tabRunPrefix("running", 3), TAB_SPINNER_FRAMES[3]);
  assert.equal(tabRunPrefix("running", TAB_SPINNER_FRAMES.length), TAB_SPINNER_FRAMES[0]);
  assert.equal(tabRunPrefix("running", TAB_SPINNER_FRAMES.length + 2), TAB_SPINNER_FRAMES[2]);
  assert.equal(tabRunPrefix("running", -1), TAB_SPINNER_FRAMES[TAB_SPINNER_FRAMES.length - 1]);
  assert.equal(tabRunPrefix("running", 1.7), TAB_SPINNER_FRAMES[1]);
  assert.ok(TAB_SPINNER_INTERVAL_MS >= 60 && TAB_SPINNER_INTERVAL_MS <= 500);
});

test("a finished run shows a glyph, an idle tab shows only its name", () => {
  assert.equal(formatTabTitle("pi-web", "running", 1), `${TAB_SPINNER_FRAMES[1]} pi-web`);
  assert.equal(formatTabTitle("pi-web", "done"), `${TAB_RUN_GLYPHS.done} pi-web`);
  assert.equal(formatTabTitle("pi-web", "failed"), `${TAB_RUN_GLYPHS.failed} pi-web`);
  assert.equal(formatTabTitle("pi-web", "idle"), "pi-web");
  assert.equal(formatTabTitle("", "failed"), `${TAB_RUN_GLYPHS.failed} Pi Web`);
});

test("only finished runs have a colour, and it is the sidebar's green or red", () => {
  assert.equal(tabRunStatus("running"), null);
  assert.equal(tabRunStatus("idle"), null);
  assert.equal(tabRunStatus("done"), "done");
  assert.equal(tabRunStatus("failed"), "failed");
  assert.equal(TAB_RUN_COLORS.done, "#16a34a");
  assert.equal(TAB_RUN_COLORS.failed, "#dc2626");
});

test("a stopped run leaves no mark, a subagent still at work keeps the spinner", () => {
  assert.equal(tabRunPhaseAfterEnd({ aborted: true }), "idle");
  assert.equal(tabRunPhaseAfterEnd({ aborted: true, failed: true }), "idle");
  assert.equal(tabRunPhaseAfterEnd({ subagentsActive: true }), "running");
  assert.equal(tabRunPhaseAfterEnd({ subagentsActive: true, failed: true }), "running");
  assert.equal(tabRunPhaseAfterEnd({}), "done");
  assert.equal(tabRunPhaseAfterEnd({ failed: true }), "failed");
});

test("the base title carries the folder name and its branch, the run mark goes in front", () => {
  assert.equal(formatTabBaseTitle("pi-web", "main"), "pi-web · main");
  assert.equal(formatTabBaseTitle("pi-web", "feature/tab-branch"), "pi-web · feature/tab-branch");
  assert.equal(formatTabBaseTitle("pi-web", null), "pi-web");
  assert.equal(formatTabBaseTitle("pi-web", "  "), "pi-web");
  assert.equal(formatTabBaseTitle("", "main"), "Pi Web · main");
  assert.equal(formatTabBaseTitle(null, null), "Pi Web");
  assert.equal(
    formatTabTitle(formatTabBaseTitle("pi-web", "main"), "running", 0),
    `${TAB_SPINNER_FRAMES[0]} pi-web · main`,
  );
});

test("the branch is the open chat's, then any session's of that cwd, then the listing's", () => {
  const sessions = [
    { id: "a", cwd: "/repo", branch: "stale-main" },
    { id: "b", cwd: "/repo-feature", branch: "feature/x" },
  ];
  const context = {
    cwd: "/repo-feature",
    currentWorktreePath: "/repo-feature",
    worktrees: [
      { path: "/repo", branch: null },
      { path: "/repo-feature", branch: "feature/x" },
    ],
  };

  assert.equal(cwdBranch("/repo-feature", { selected: sessions[1], sessions, context }), "feature/x");
  assert.equal(cwdBranch("/repo", { selected: sessions[1], sessions, context }), "stale-main");
  assert.equal(cwdBranch("/repo", { selected: null, sessions: [], context: null }), null);
  assert.equal(
    cwdBranch("/repo-feature", { selected: null, sessions: [], context }),
    "feature/x",
    "a folder with no session yet reads its checkout from the sidebar's listing",
  );
  assert.equal(
    cwdBranch("/repo-feature", { selected: null, sessions: [], context: { ...context, cwd: "/repo" } }),
    null,
    "the listing is the previous cwd's report for anything else",
  );
  assert.equal(cwdBranch("/repo/sub", { selected: null, sessions, context }), null, "a subdirectory is not inferred");
  assert.equal(cwdBranch(null, { selected: null, sessions, context }), null);
});
