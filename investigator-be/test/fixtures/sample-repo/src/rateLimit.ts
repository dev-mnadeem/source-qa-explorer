type Bucket = { tokens: number; updatedAt: number };

const CAPACITY = 10;
const REFILL_PER_SECOND = 0.5;

/**
 * A token bucket, keyed by client id. Refills continuously rather than on a
 * fixed window so a client cannot burst at every boundary.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  allow(clientId: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(clientId) ?? {
      tokens: CAPACITY,
      updatedAt: now,
    };
    const elapsedSeconds = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(
      CAPACITY,
      bucket.tokens + elapsedSeconds * REFILL_PER_SECOND,
    );
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      this.buckets.set(clientId, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(clientId, bucket);
    return true;
  }
}
