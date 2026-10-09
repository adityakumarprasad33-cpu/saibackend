/**
 * RateGuard Decision Model & Types
 */

export type RateGuardDecisionType = 'ALLOW' | 'THROTTLE' | 'CHALLENGE' | 'BLOCK';

export interface RateGuardDecision {
  decision: RateGuardDecisionType;
  allowed: boolean;
  policyName: string;
  algorithm: 'SLIDING_WINDOW' | 'TOKEN_BUCKET' | 'RATE_CONCURRENCY';
  currentCount: number;
  limit: number;
  remaining: number;
  windowSeconds: number;
  retryAfterSeconds: number;
  riskScore: number;
  violationReason?: string | undefined;
}
