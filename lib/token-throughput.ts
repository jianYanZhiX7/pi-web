import { estimateTokens } from "./token-estimate";

/** The window the live response rate is read over. */
export const THROUGHPUT_WINDOW_MS = 30_000;
/** Under this many tokens in a full window, the live turn reads as stalled. */
export const THROUGHPUT_STALL_TOKENS = 300;

const BUCKET_MS = 1_000;
const KEEP_MS = 2 * THROUGHPUT_WINDOW_MS;

/**
 * The output tokens a live turn produced, in one-second buckets. Fed by the
 * streamed text, thinking and tool-argument deltas, because pi reports a
 * response's exact `usage` only when it ends. One meter per session: `reset()`
 * starts a turn, or marks the moment this page joined one.
 */
export interface TokenThroughput {
  /** When the meter was last reset: a turn's start, or when this page joined it. */
  readonly startedAt: number;
  reset(at: number): void;
  addText(text: string, at: number): void;
  tokensInWindow(now: number): number;
}

export function createTokenThroughput(startedAt: number): TokenThroughput {
  const buckets = new Map<number, number>();
  let started = startedAt;

  const prune = (now: number) => {
    const oldest = Math.floor((now - KEEP_MS) / BUCKET_MS);
    for (const bucket of buckets.keys()) {
      if (bucket < oldest) buckets.delete(bucket);
    }
  };

  return {
    get startedAt() {
      return started;
    },
    reset(at) {
      buckets.clear();
      started = at;
    },
    addText(text, at) {
      if (text.length === 0) return;
      const bucket = Math.floor(at / BUCKET_MS);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + estimateTokens(text));
      prune(at);
    },
    tokensInWindow(now) {
      prune(now);
      // Whole seconds: a bucket at or after the window's start is in it, so a
      // sample can be up to one second older than `now - THROUGHPUT_WINDOW_MS`.
      const oldest = Math.floor((now - THROUGHPUT_WINDOW_MS) / BUCKET_MS);
      let total = 0;
      for (const [bucket, tokens] of buckets) {
        if (bucket >= oldest) total += tokens;
      }
      return total;
    },
  };
}

/**
 * The live row's red rule: the meter has watched a whole window since it was
 * reset, and the model put out fewer than 300 tokens in it. Measured from the
 * meter's own start, so a page that joined a run late is not red before it has
 * seen a window itself.
 */
export function isThroughputStalled(meter: TokenThroughput, now: number): boolean {
  return now - meter.startedAt >= THROUGHPUT_WINDOW_MS
    && meter.tokensInWindow(now) < THROUGHPUT_STALL_TOKENS;
}
