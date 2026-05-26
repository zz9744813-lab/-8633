// Rate limiter for LLM API calls
// Prevents hitting API limits and controls costs

interface RateLimitConfig {
  maxCallsPerMinute: number;
  maxCallsPerHour?: number;
  maxCallsPerDay?: number;
  enabled: boolean;
}

interface CallRecord {
  timestamp: number;
  purpose: string;
  tokens?: number;
}

export class RateLimiter {
  private calls: CallRecord[] = [];
  private config: RateLimitConfig;
  private lastCleanup: number = Date.now();

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  // Check if a call can be made
  canMakeCall(): { allowed: boolean; waitMs?: number; reason?: string } {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    this.cleanup();

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const callsLastMinute = this.calls.filter((c) => c.timestamp > oneMinuteAgo).length;
    const callsLastHour = this.calls.filter((c) => c.timestamp > oneHourAgo).length;
    const callsLastDay = this.calls.filter((c) => c.timestamp > oneDayAgo).length;

    // Check per-minute limit
    if (callsLastMinute >= this.config.maxCallsPerMinute) {
      const oldestCallInWindow = this.calls.find((c) => c.timestamp > oneMinuteAgo);
      const waitMs = oldestCallInWindow
        ? oldestCallInWindow.timestamp + 60 * 1000 - now
        : 60000;
      return {
        allowed: false,
        waitMs,
        reason: `Rate limit: ${callsLastMinute}/${this.config.maxCallsPerMinute} calls per minute`,
      };
    }

    // Check per-hour limit
    if (this.config.maxCallsPerHour && callsLastHour >= this.config.maxCallsPerHour) {
      const waitMs = 60 * 60 * 1000 - (now - oneHourAgo);
      return {
        allowed: false,
        waitMs,
        reason: `Rate limit: ${callsLastHour}/${this.config.maxCallsPerHour} calls per hour`,
      };
    }

    // Check per-day limit
    if (this.config.maxCallsPerDay && callsLastDay >= this.config.maxCallsPerDay) {
      return {
        allowed: false,
        reason: `Daily rate limit reached: ${callsLastDay}/${this.config.maxCallsPerDay}`,
      };
    }

    return { allowed: true };
  }

  // Record a call
  recordCall(purpose: string, tokens?: number): void {
    this.calls.push({
      timestamp: Date.now(),
      purpose,
      tokens,
    });
    this.cleanup();
  }

  // Wait until a call can be made
  async waitForSlot(): Promise<void> {
    while (true) {
      const status = this.canMakeCall();
      if (status.allowed) {
        return;
      }
      if (status.waitMs && status.waitMs < 60000) {
        await sleep(status.waitMs + 100);
      } else {
        throw new Error(status.reason || "Rate limit exceeded");
      }
    }
  }

  // Get current usage stats
  getStats(): {
    callsLastMinute: number;
    callsLastHour: number;
    callsLastDay: number;
    averageTokensPerCall: number;
  } {
    this.cleanup();

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const callsLastMinute = this.calls.filter((c) => c.timestamp > oneMinuteAgo);
    const callsLastHour = this.calls.filter((c) => c.timestamp > oneHourAgo);
    const callsLastDay = this.calls.filter((c) => c.timestamp > oneDayAgo);

    const callsWithTokens = this.calls.filter((c) => c.tokens);
    const avgTokens =
      callsWithTokens.length > 0
        ? callsWithTokens.reduce((sum, c) => sum + (c.tokens || 0), 0) /
          callsWithTokens.length
        : 0;

    return {
      callsLastMinute: callsLastMinute.length,
      callsLastHour: callsLastHour.length,
      callsLastDay: callsLastDay.length,
      averageTokensPerCall: Math.round(avgTokens),
    };
  }

  // Remove old call records
  private cleanup(): void {
    const now = Date.now();
    // Cleanup every 5 minutes
    if (now - this.lastCleanup < 5 * 60 * 1000) {
      return;
    }

    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    this.calls = this.calls.filter((c) => c.timestamp > oneDayAgo);
    this.lastCleanup = now;
  }

  // Update config
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Global rate limiter instance
let globalRateLimiter: RateLimiter | null = null;

export function initRateLimiter(config: RateLimitConfig): RateLimiter {
  globalRateLimiter = new RateLimiter(config);
  return globalRateLimiter;
}

export function getRateLimiter(): RateLimiter | null {
  return globalRateLimiter;
}
