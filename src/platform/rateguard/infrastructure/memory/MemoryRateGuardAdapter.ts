/**
 * In-Memory Fallback Adapter for RateGuard
 * Used in local development or as fail-open/local fallback during Redis connectivity degradation.
 */

import { IRateGuardStore, RateEvaluationResult } from '../IRateGuardStore';
import { RateGuardDimensions } from '../../domain/models/Dimensions';
import { RateLimitPolicy } from '../../domain/policies/PolicyRegistry';

interface SlidingWindowRecord {
  timestamps: number[];
}

export class MemoryRateGuardAdapter implements IRateGuardStore {
  private cache = new Map<string, SlidingWindowRecord>();

  public isAvailable(): boolean {
    return true;
  }

  public async evaluate(
    dimensions: RateGuardDimensions,
    policy: RateLimitPolicy
  ): Promise<RateEvaluationResult> {
    const key = `rateguard:${policy.name}:${dimensions.userAccountHash || dimensions.clientIpHash}`;
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1000;
    const clearBefore = now - windowMs;

    let record = this.cache.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.cache.set(key, record);
    }

    // Clear expired timestamps
    record.timestamps = record.timestamps.filter((ts) => ts > clearBefore);

    const currentCount = record.timestamps.length;

    if (currentCount < policy.limit) {
      record.timestamps.push(now);
      return {
        allowed: true,
        currentCount: currentCount + 1,
        remaining: Math.max(0, policy.limit - (currentCount + 1)),
        retryAfterSeconds: 0,
      };
    }

    const oldest = record.timestamps[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

    return {
      allowed: false,
      currentCount,
      remaining: 0,
      retryAfterSeconds,
    };
  }
}
