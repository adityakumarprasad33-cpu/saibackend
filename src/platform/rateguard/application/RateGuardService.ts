/**
 * RateGuard Service Application Gateway
 */

import { DimensionFactory, RateGuardDimensions } from '../domain/models/Dimensions';
import { RateGuardDecision } from '../domain/models/RateGuardDecision';
import { PolicyRegistry, RateLimitPolicy } from '../domain/policies/PolicyRegistry';
import { IRateGuardStore } from '../infrastructure/IRateGuardStore';
import { MemoryRateGuardAdapter } from '../infrastructure/memory/MemoryRateGuardAdapter';
import { RedisRateGuardAdapter } from '../infrastructure/redis/RedisRateGuardAdapter';
import { PinoSecurityAuditLogger } from '../../../features/iam/infrastructure/logging/PinoSecurityAuditLogger';

export class RateGuardService {
  private static instance: RateGuardService;
  private primaryStore: IRateGuardStore;
  private fallbackStore: IRateGuardStore;

  private constructor() {
    this.primaryStore = new RedisRateGuardAdapter();
    this.fallbackStore = new MemoryRateGuardAdapter();
  }

  public async checkConnection(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') return;
    if (!(this.primaryStore instanceof RedisRateGuardAdapter)) {
      throw new Error('Distributed rate limiting is unavailable.');
    }
    await this.primaryStore.checkConnection();
  }

  public static getInstance(): RateGuardService {
    if (!RateGuardService.instance) {
      RateGuardService.instance = new RateGuardService();
    }
    return RateGuardService.instance;
  }

  public async evaluateRequest(
    rawIp: string,
    endpoint: string,
    method: string,
    user?: { uid: string; roleId: string } | undefined,
    deviceHeader?: string | undefined,
    correlationId?: string | undefined
  ): Promise<RateGuardDecision> {
    const dimensions = DimensionFactory.createDimensions(rawIp, endpoint, method, user, deviceHeader);
    const policy = PolicyRegistry.resolvePolicy(endpoint, method);

    let store = process.env.NODE_ENV === 'production' || this.primaryStore.isAvailable()
      ? this.primaryStore
      : this.fallbackStore;

    try {
      const result = await store.evaluate(dimensions, policy);

      const decision: RateGuardDecision = {
        decision: result.allowed ? 'ALLOW' : 'BLOCK',
        allowed: result.allowed,
        policyName: policy.name,
        algorithm: policy.algorithm,
        currentCount: result.currentCount,
        limit: policy.limit,
        remaining: result.remaining,
        windowSeconds: policy.windowSeconds,
        retryAfterSeconds: result.retryAfterSeconds,
        riskScore: result.allowed ? 0.0 : 0.85,
        violationReason: result.allowed ? undefined : `Rate limit of ${policy.limit} exceeded for ${policy.name}`,
      };

      if (!decision.allowed) {
        PinoSecurityAuditLogger.logSecurityEvent({
          auditId: `audit-rg-${Date.now()}`,
          event: 'SuspiciousActivity',
          userId: user ? user.uid : 'anonymous',
          ipAddress: dimensions.clientIpHash,
          userAgent: 'RateGuard Engine',
          correlationId,
          details: {
            policy: policy.name,
            endpoint,
            method,
            limit: policy.limit,
            retryAfter: result.retryAfterSeconds,
          },
        });
      }

      return decision;
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        const unavailable = new Error('Distributed rate limiting is unavailable.') as Error & { statusCode: number };
        unavailable.statusCode = 503;
        throw unavailable;
      }
      // Redis outage / evaluation failure logic
      if (policy.failClosed) {
        return {
          decision: 'BLOCK',
          allowed: false,
          policyName: policy.name,
          algorithm: policy.algorithm,
          currentCount: policy.limit,
          limit: policy.limit,
          remaining: 0,
          windowSeconds: policy.windowSeconds,
          retryAfterSeconds: 60,
          riskScore: 1.0,
          violationReason: 'FailClosedSecurityEnforcement: RateGuard backend unavailable',
        };
      }

      // Fail-Open fallback to memory store
      const fallbackResult = await this.fallbackStore.evaluate(dimensions, policy);
      return {
        decision: fallbackResult.allowed ? 'ALLOW' : 'BLOCK',
        allowed: fallbackResult.allowed,
        policyName: policy.name,
        algorithm: policy.algorithm,
        currentCount: fallbackResult.currentCount,
        limit: policy.limit,
        remaining: fallbackResult.remaining,
        windowSeconds: policy.windowSeconds,
        retryAfterSeconds: fallbackResult.retryAfterSeconds,
        riskScore: 0.2,
      };
    }
  }
}
