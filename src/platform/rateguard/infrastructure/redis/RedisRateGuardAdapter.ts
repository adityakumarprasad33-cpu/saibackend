/**
 * Redis Atomic Distributed Adapter for RateGuard Engine
 * Uses Atomic Redis Lua Scripts to guarantee race-condition-free sliding window counts.
 */

import Redis from 'ioredis';
import { IRateGuardStore, RateEvaluationResult } from '../IRateGuardStore';
import { RateGuardDimensions } from '../../domain/models/Dimensions';
import { RateLimitPolicy } from '../../domain/policies/PolicyRegistry';

export class RedisRateGuardAdapter implements IRateGuardStore {
  private client: Redis | null = null;
  private isConnected = false;

  private slidingWindowLua = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local clearBefore = now - windowMs

    redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
    local current = redis.call('ZCARD', key)

    if current < limit then
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        return {1, limit - (current + 1), 0}
    else
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local retryAfter = 1
        if #oldest > 1 then
            retryAfter = math.ceil((tonumber(oldest[2]) + windowMs - now) / 1000)
        end
        return {0, 0, math.max(1, retryAfter)}
    end
  `;

  constructor(redisUrl?: string | undefined) {
    const connectionUrl = redisUrl || process.env.REDIS_URL;

    if (connectionUrl) {
      try {
        this.client = new Redis(connectionUrl, {
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          connectTimeout: 3000,
        });

        this.client.on('connect', () => {
          this.isConnected = true;
        });

        this.client.on('error', () => {
          this.isConnected = false;
        });
      } catch {
        this.isConnected = false;
      }
    }
  }

  public isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  public async checkConnection(): Promise<void> {
    if (!this.client) throw new Error('REDIS_URL is not configured.');
    await this.client.ping();
  }

  public async evaluate(
    dimensions: RateGuardDimensions,
    policy: RateLimitPolicy
  ): Promise<RateEvaluationResult> {
    if (!this.client || !this.isConnected) {
      throw new Error('RedisUnavailable: Connection to Redis cluster is offline');
    }

    const key = `rateguard:${policy.name}:${dimensions.userAccountHash || dimensions.clientIpHash}`;
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1000;

    const result = (await this.client.eval(
      this.slidingWindowLua,
      1,
      key,
      now.toString(),
      windowMs.toString(),
      policy.limit.toString()
    )) as [number, number, number];

    const [allowedNum, remaining, retryAfterSeconds] = result;

    return {
      allowed: allowedNum === 1,
      currentCount: allowedNum === 1 ? policy.limit - remaining : policy.limit,
      remaining,
      retryAfterSeconds,
    };
  }
}
