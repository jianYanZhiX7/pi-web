import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { recordServerNow, toBrowserClock } = await jiti.import("./server-clock.ts");

test("reads a pi timestamp as-is until a state read measured the server", () => {
  assert.equal(toBrowserClock(1_000_000), 1_000_000);
});

test("moves pi's timestamps onto the browser's clock by the measured offset", () => {
  // The server's clock runs 5 s ahead of this browser's.
  recordServerNow(1_005_000, 1_000_000);
  assert.equal(toBrowserClock(1_005_000), 1_000_000);
  assert.equal(toBrowserClock(1_065_000), 1_060_000);

  // A later read after the browser's clock was corrected.
  recordServerNow(1_000_500, 1_000_000);
  assert.equal(toBrowserClock(1_000_500), 1_000_000);

  recordServerNow(Number.NaN, 1_000_000);
  assert.equal(toBrowserClock(1_000_500), 1_000_000);
});
