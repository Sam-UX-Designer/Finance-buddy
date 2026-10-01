/** In-memory sliding-window limiter. Production with several instances should use a shared store. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Returns seconds to wait if limited, otherwise records the hit and returns 0. */
  hit(key: string, now = Date.now()): number {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return Math.ceil((this.windowMs - (now - list[0]!)) / 1000);
    }
    list.push(now);
    this.hits.set(key, list);
    return 0;
  }
}
