export interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
}

export class MemoryRateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;
  private maxAttempts: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: RateLimiterOptions = { windowMs: 15 * 60 * 1000, maxAttempts: 10 }) {
    this.windowMs = options.windowMs;
    this.maxAttempts = options.maxAttempts;

    // Periodic cleanup of expired rate limits
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry) return false;

    if (now > entry.resetTime) {
      this.attempts.delete(key);
      return false;
    }

    return entry.count >= this.maxAttempts;
  }

  recordAttempt(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetTime) {
      this.attempts.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
    } else {
      entry.count += 1;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.attempts.entries()) {
      if (now > entry.resetTime) {
        this.attempts.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.attempts.clear();
  }
}
