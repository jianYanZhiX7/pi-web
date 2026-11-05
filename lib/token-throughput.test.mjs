import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  createTokenThroughput,
  isThroughputStalled,
  THROUGHPUT_STALL_TOKENS,
  THROUGHPUT_WINDOW_MS,
} = await jiti.import("./token-throughput.ts");
const { estimateTokens } = await jiti.import("./token-estimate.ts");

const at = 1_000_000;

test("estimates CJK at about one token a character and the rest at four", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("中文"), 2);
  assert.equal(estimateTokens("ab中文"), 2.5);
});

test("sums what was streamed in the last window and forgets what fell out", () => {
  const meter = createTokenThroughput(at);
  // 40 ASCII characters a second: 10 tokens each.
  for (let second = 0; second < 40; second++) {
    meter.addText("x".repeat(40), at + second * 1000);
  }

  // A whole second either side of the window keeps its bucket, so the count
  // can be up to one second's worth high at the boundary.
  assert.equal(meter.tokensInWindow(at + 39_000), 310);
  assert.equal(meter.tokensInWindow(at + 39_999), 310);
  assert.equal(meter.tokensInWindow(at + 40_000), 300);
  assert.equal(meter.tokensInWindow(at + 41_000), 290);
});

test("a reset starts a new turn with an empty window", () => {
  const meter = createTokenThroughput(at);
  meter.addText("x".repeat(400), at);
  assert.equal(meter.tokensInWindow(at + 1000), 100);

  meter.reset(at + 1000);
  assert.equal(meter.startedAt, at + 1000);
  assert.equal(meter.tokensInWindow(at + 2000), 0);
});

test("is not stalled before it has watched a whole window", () => {
  const meter = createTokenThroughput(at);
  assert.equal(isThroughputStalled(meter, at), false);
  assert.equal(isThroughputStalled(meter, at + THROUGHPUT_WINDOW_MS - 1), false);
  // A page that joined a run late gets the same grace: silence only reads as a
  // stall once this meter itself has seen a window.
  assert.equal(isThroughputStalled(meter, at + THROUGHPUT_WINDOW_MS), true);
});

test("is stalled under 300 tokens in the window, not at or above it", () => {
  const quiet = createTokenThroughput(at);
  quiet.addText("x".repeat(4 * (THROUGHPUT_STALL_TOKENS - 1)), at + 500);
  assert.equal(isThroughputStalled(quiet, at + THROUGHPUT_WINDOW_MS), true);

  const busy = createTokenThroughput(at);
  busy.addText("x".repeat(4 * THROUGHPUT_STALL_TOKENS), at + 500);
  assert.equal(isThroughputStalled(busy, at + THROUGHPUT_WINDOW_MS), false);

  const quietAgain = createTokenThroughput(at);
  quietAgain.addText("x".repeat(4 * THROUGHPUT_STALL_TOKENS), at + 500);
  // The tokens leave the window, and the turn reads as stalled again.
  assert.equal(isThroughputStalled(quietAgain, at + THROUGHPUT_WINDOW_MS + 1001), true);
});
