/**
 * The server process's clock, as this page last measured it. pi stamps session
 * entries with the server's clock, and the browser's clock can differ (a phone
 * on the LAN), so a live turn can only count from an entry's timestamp once it
 * is moved onto the browser's clock.
 *
 * `GET /api/sessions/[id]/state` answers with the server's `now`: the mount's
 * read records the offset, and so does every read that follows a hidden page's
 * return. One value for the page, since one browser talks to one server.
 */
let offsetMs = 0;

/** Record a server `now` at the moment its answer reached the browser. */
export function recordServerNow(serverNow: number, receivedAt = Date.now()): void {
  if (!Number.isFinite(serverNow)) return;
  offsetMs = serverNow - receivedAt;
}

/** A pi timestamp (the server's clock) on this browser's clock. */
export function toBrowserClock(serverTimestamp: number): number {
  return serverTimestamp - offsetMs;
}
