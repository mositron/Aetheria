// Token-bucket rate limiter, extracted from GameRoom.
//
// One instance per room. Each (sid, bucketKey) pair tracks recent event
// timestamps over a sliding window.

export class RateLimiter {
  private buckets = new Map<string, Map<string, number[]>>();

  /**
   * Returns true if the action is allowed and consumes one token.
   * Returns false if the bucket is full (caller should reject the action).
   */
  check(sid: string, key: string, maxEvents: number, windowMs: number, now = Date.now()): boolean {
    let perSid = this.buckets.get(sid);
    if (!perSid) { perSid = new Map(); this.buckets.set(sid, perSid); }
    let stamps = perSid.get(key);
    if (!stamps) { stamps = []; perSid.set(key, stamps); }
    const cutoff = now - windowMs;
    while (stamps.length > 0 && stamps[0] < cutoff) stamps.shift();
    if (stamps.length >= maxEvents) return false;
    stamps.push(now);
    return true;
  }

  /** Remove all buckets for a disconnected session. */
  forget(sid: string): void {
    this.buckets.delete(sid);
  }

  /** Test/diagnostic. */
  size(): number {
    return this.buckets.size;
  }
}
